'use strict';

// Zoom and pan of the grid in the phone solving view (shared/svg-zoom.mjs, attached by
// shared/engine-phone.mjs), run only under the mobile projects in playwright.config.js.
// Pinch and drag are synthetic pointer events on #grid-pane: Playwright has no
// two-finger gesture, and the module reads pointer events alone. Taps and double-taps go
// through the real touch input.
//
// Playwright's emulated WebKit is advisory for gestures: it does not always deliver a
// touch's pointer events or its click the way a phone does (docs/TESTING.md).

const { test, expect } = require('@playwright/test');
const { buildPuzzleFile } = require('../test/helpers');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { TOOL_FIXTURES, dismissIntro } = require('./mobile');

const DIRECTION_LABEL = '#active-clue-primary .active-clue-dir';

// Reduced motion by default, so a view change lands at once and a test reads it right
// after the action. The 'animated' group below turns it off to test the glides.
test.use({ reducedMotion: 'reduce' });

let tmpDir;
const htmlPaths = {};
test.beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-'));
  for (const f of TOOL_FIXTURES) {
    htmlPaths[f.tool] = path.join(tmpDir, f.tool + '.html');
    buildPuzzleFile(f.yamlPath, htmlPaths[f.tool]);
  }
});
test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function load(page, tool) {
  await page.goto('file://' + htmlPaths[tool]);
  await expect(page.locator('#drawn-kb')).toBeVisible();
  await dismissIntro(page);
}

// The grid SVG's viewBox attribute, as the string and parsed.
const viewBoxAttr = page => page.locator('#grid-pane svg').first().getAttribute('viewBox');
async function viewBox(page) {
  const [x, y, width, height] = (await viewBoxAttr(page)).split(/\s+/).map(Number);
  return { x, y, width, height };
}

// A synthetic touch sequence on #grid-pane. `center` is a CSS selector (the middle of
// that element) or { fx, fy }, fractions of the grid SVG's box. Each pointer moves in
// five steps, and a settle() should follow before the next tap. With `thenTap`, a
// pointer tap follows at once where the first finger lifted. Resolves to the viewBox
// attribute read at once after the last pointer up ({ atOnce }) and one animation frame
// later ({ afterFrame }), in the same evaluate, so neither depends on round-trip time.
function gesture(page, center, fingers, { thenTap = false } = {}) {
  return page.evaluate(async ({ center: c, fingers: f, thenTap: tap }) => {
    const pane = document.getElementById('grid-pane');
    const svgRect = pane.querySelector('svg').getBoundingClientRect();
    let cx, cy;
    if (typeof c === 'string') {
      const r = document.querySelector(c).getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    } else {
      cx = svgRect.left + svgRect.width * c.fx;
      cy = svgRect.top + svgRect.height * c.fy;
    }
    const fire = (type, id, x, y) => pane.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y,
      bubbles: true, cancelable: true,
    }));
    const at = (finger, t) => ({
      x: cx + finger.dx0 + (finger.dx1 - finger.dx0) * t,
      y: cy + finger.dy0 + (finger.dy1 - finger.dy0) * t,
    });
    f.forEach((finger, i) => fire('pointerdown', i + 1, at(finger, 0).x, at(finger, 0).y));
    for (let step = 1; step <= 5; step++) {
      f.forEach((finger, i) => fire('pointermove', i + 1, at(finger, step / 5).x, at(finger, step / 5).y));
    }
    f.forEach((finger, i) => fire('pointerup', i + 1, at(finger, 1).x, at(finger, 1).y));
    if (tap) {
      fire('pointerdown', 9, at(f[0], 1).x, at(f[0], 1).y);
      fire('pointerup', 9, at(f[0], 1).x, at(f[0], 1).y);
    }
    const svg = pane.querySelector('svg');
    const atOnce = svg.getAttribute('viewBox');
    await new Promise(requestAnimationFrame);
    return { atOnce, afterFrame: svg.getAttribute('viewBox') };
  }, { center, fingers, thenTap });
}

// Two fingers either side of `center`, `fromDist` apart at first and `toDist` at the end:
// zooms by toDist / fromDist.
const pinch = (page, center, fromDist, toDist, opts) => gesture(page, center, [
  { dx0: -fromDist / 2, dy0: 0, dx1: -toDist / 2, dy1: 0 },
  { dx0: fromDist / 2, dy0: 0, dx1: toDist / 2, dy1: 0 },
], opts);

// One finger from `center` offset by (dx0, dy0) to (dx1, dy1).
const drag = (page, center, [dx0, dy0], [dx1, dy1], opts) =>
  gesture(page, center, [{ dx0, dy0, dx1, dy1 }], opts);

// Waits out the stray-click window, so the next tap is not eaten as a gesture's click.
const settle = page => page.waitForTimeout(450);

// Resolves to the viewBox once it has stopped moving: unchanged across several animation
// frames. Counted in frames, not ms, since a page can stall its frames mid-glide (Linux
// WebKit does), and a glide that stalls looks settled to a timer.
async function settled(page) {
  let last = null;
  await expect.poll(async () => {
    last = await page.evaluate(async () => {
      const svg = document.querySelector('#grid-pane svg');
      const before = svg.getAttribute('viewBox');
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
      return svg.getAttribute('viewBox') === before ? before : null;
    });
    return last !== null;
  }, { intervals: [50], timeout: 5000 }).toBe(true);
  return last;
}

// Presses `key` `n` times as the drawn keyboard does (a keydown on document), then reads
// the viewBox at once and one animation frame later, all in one evaluate.
function pressKeys(page, key, n) {
  return page.evaluate(async ({ key: k, n: count }) => {
    for (let i = 0; i < count; i++) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    }
    const svg = document.querySelector('#grid-pane svg');
    const atOnce = svg.getAttribute('viewBox');
    await new Promise(requestAnimationFrame);
    return { atOnce, afterFrame: svg.getAttribute('viewBox') };
  }, { key, n });
}

// Whether every element matching `selector` lies within the grid SVG's box, to 1px.
const inside = (page, selector) => page.evaluate(sel => {
  const box = document.querySelector('#grid-pane svg').getBoundingClientRect();
  const els = [...document.querySelectorAll(sel)];
  return els.length > 0 && els.every(el => {
    const r = el.getBoundingClientRect();
    return r.left >= box.left - 1 && r.right <= box.right + 1
      && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
  });
}, selector);

// Whether the center of the element matching `selector` lies within the grid SVG's box.
const centerInside = (page, selector) => page.evaluate(sel => {
  const box = document.querySelector('#grid-pane svg').getBoundingClientRect();
  const r = document.querySelector(sel).getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}, selector);

// A `.cell` other than the active one whose center is inside the grid SVG's box and is
// what a tap there would hit: { id, x, y }, the center in viewport px.
const tappableCell = page => page.evaluate(() => {
  const box = document.querySelector('#grid-pane svg').getBoundingClientRect();
  for (const el of document.querySelectorAll('.cell:not(.active-cell)')) {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && hit.closest('.cell') === el) return { id: el.id, x, y };
  }
  return null;
});

const center = async (page, selector) => {
  const b = await page.locator(selector).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

// The drawn keyboard's key that steps the cursor one cell on (Marching Bands has no ›
// in its bar; Crushword's is the Enter that commits the cell).
const nextCellKey = page => page.locator('#drawn-kb button[aria-label="Next cell"]');
const MODE_TOGGLE = '#mode-toggle .toggle-opt.active';

for (const { tool } of TOOL_FIXTURES) {
  test.describe(`[${tool}] grid zoom`, () => {
    // Zoomed, stepping 20 cells keeps the cursor's cell in view, and the view does move.
    async function stepsKeepCursorInView(page) {
      const seen = new Set([await viewBoxAttr(page)]);
      for (let i = 0; i < 20; i++) {
        await nextCellKey(page).tap();
        expect(await inside(page, '.active-cell')).toBe(true);
        seen.add(await viewBoxAttr(page));
      }
      expect(seen.size).toBeGreaterThan(1);
    }

    test(`[${tool}] following keeps the cursor in view`, async ({ page }) => {
      await load(page, tool);
      await pinch(page, { fx: 0.25, fy: 0.25 }, 50, 150);
      await settle(page);
      await stepsKeepCursorInView(page);
    });

    if (tool === 'marching-bands') {
      // A band is often wider than the view, which is why the check is on the cursor.
      test(`[${tool}] following keeps the cursor in view in band mode`, async ({ page }) => {
        await load(page, tool);
        const mode = await page.locator(MODE_TOGGLE).textContent();
        await pinch(page, { fx: 0.25, fy: 0.25 }, 50, 150);
        await settle(page);
        // The `.` key, not a tap on the active cell: zooming around that cell can drift
        // it under the top bar, and the cell's own tap is covered on Crushword.
        await page.locator('#drawn-kb [data-key="."]').tap();
        await expect(page.locator(MODE_TOGGLE)).not.toHaveText(mode);
        await stepsKeepCursorInView(page);
      });
    }

    test(`[${tool}] unzoomed, the viewBox is the engine's own`, async ({ page }) => {
      await load(page, tool);
      const original = await viewBoxAttr(page);
      await pinch(page, { fx: 0.5, fy: 0.5 }, 150, 50);
      expect(await viewBoxAttr(page)).toBe(original);
      const touchAction = await page.locator('#grid-pane').evaluate(el => getComputedStyle(el).touchAction);
      expect(touchAction).toBe('none');
    });

    test(`[${tool}] pinch zooms in and taps still select cells`, async ({ page }) => {
      await load(page, tool);
      const before = await viewBox(page);
      // Around a cell, and only 1.5x: an axis on which the grid fits stays centered,
      // so a deeper pinch can leave a ring's hollow middle in view with no cell in it.
      await pinch(page, '.cell:not(.active-cell)', 100, 150);
      expect((await viewBox(page)).width).toBeLessThan(before.width);
      await settle(page);
      const cell = await tappableCell(page);
      expect(cell).toBeTruthy();
      await page.touchscreen.tap(cell.x, cell.y);
      await expect(page.locator('#' + cell.id)).toHaveClass(/active-cell/);
    });
  });
}

// The grid SVG's color at each of `points` ({ x, y } in CSS px from its top-left
// corner), as [r, g, b], read by decoding a screenshot in the page.
async function svgColorsAt(page, points) {
  const png = (await page.locator('#grid-pane svg').first().screenshot()).toString('base64');
  return page.evaluate(async ({ b64, pts }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const scale = img.width / document.querySelector('#grid-pane svg').getBoundingClientRect().width;
    return pts.map(p => [...ctx.getImageData(Math.round(p.x * scale), Math.round(p.y * scale), 1, 1).data.slice(0, 3)]);
  }, { b64: png, pts: points });
}

test.describe('[spiral] edge shadow', () => {
  test('[spiral] the shadow falls on cells and never on the page around the grid', async ({ page }) => {
    await load(page, 'spiral');
    // Into the grid's top-left corner, where the round grid leaves its box's corner bare.
    await pinch(page, { fx: 0.02, fy: 0.02 }, 50, 200);
    await settle(page);
    await expect(page.locator('#grid-pane')).toHaveAttribute('data-more', /\bright\b.*\bbottom\b|\bbottom\b.*\bright\b/);
    // Points 2px inside the right and bottom sides, each marked as over a cell or not.
    const points = await page.evaluate(() => {
      const box = document.querySelector('#grid-pane svg').getBoundingClientRect();
      const out = [];
      for (let t = 0.02; t < 1; t += 0.02) {
        out.push({ x: box.width - 2, y: box.height * t }, { x: box.width * t, y: box.height - 2 });
      }
      return out.map(p => {
        const hit = document.elementFromPoint(box.left + p.x, box.top + p.y);
        return { ...p, cell: Boolean(hit && hit.closest('svg *')) };
      });
    });
    const hidden = await page.addStyleTag({ content: '.edge-shadow { opacity: 0 !important; }' });
    const without = await svgColorsAt(page, points);
    await hidden.evaluate(el => el.remove());
    const shaded = await svgColorsAt(page, points);
    points.forEach((p, i) => { p.shaded = [0, 1, 2].some(c => Math.abs(without[i][c] - shaded[i][c]) > 2); });
    const bare = points.filter(p => !p.cell);
    expect(bare.length).toBeGreaterThan(0);
    expect(bare.filter(p => p.shaded)).toEqual([]);
    expect(points.some(p => p.cell && p.shaded)).toBe(true);
  });
});

test.describe('[crushword] grid zoom', () => {
  test.beforeEach(async ({ page }) => load(page, 'crushword'));

  test('[crushword] double-tap toggles zoom without switching direction', async ({ page }) => {
    const original = await viewBoxAttr(page);
    const before = await viewBox(page);
    const direction = await page.locator(DIRECTION_LABEL).textContent();
    const id = await page.evaluate(
      () => document.querySelector('.active-entry:not(.active-cell)').id);
    const first = await center(page, '#' + id);
    await page.touchscreen.tap(first.x, first.y);
    await page.touchscreen.tap(first.x, first.y);
    expect((await viewBox(page)).width).toBeLessThan(before.width);
    await expect(page.locator('#' + id)).toHaveClass(/active-cell/);
    await expect(page.locator(DIRECTION_LABEL)).toHaveText(direction);

    // Zoomed, the cell is the active one: the first tap acts as a single tap does, and
    // the second only zooms back out.
    await page.waitForTimeout(350);
    const second = await center(page, '#' + id);
    await page.touchscreen.tap(second.x, second.y);
    await page.touchscreen.tap(second.x, second.y);
    expect(await viewBoxAttr(page)).toBe(original);
  });

  test('[crushword] a single tap on the active cell switches direction at once', async ({ page }) => {
    const before = await viewBox(page);
    const direction = await page.locator(DIRECTION_LABEL).textContent();
    // 1.5x: the grid is wider than tall, so its height still fits and stays centered,
    // keeping the active cell (in the top row) in view.
    await pinch(page, '.active-cell', 100, 150);
    expect((await viewBox(page)).width).toBeLessThan(before.width);
    await settle(page);
    const cell = await center(page, '.active-cell');
    await page.touchscreen.tap(cell.x, cell.y);
    // Not after a double-tap window: nothing holds the tap back.
    await expect(page.locator(DIRECTION_LABEL)).not.toHaveText(direction, { timeout: 200 });
  });

  test('[crushword] a hand pan stays put', async ({ page }) => {
    const before = await viewBox(page);
    await pinch(page, { fx: 0.5, fy: 0.5 }, 50, 150);
    await settle(page);
    await drag(page, { fx: 0.5, fy: 0.5 }, [0, 0], [60, 0]);
    await settle(page);
    const panned = await viewBoxAttr(page);
    expect((await viewBox(page)).width).toBeLessThan(before.width);
    await page.locator('#menu-btn').tap();
    await page.locator('#menu-btn').tap();
    expect(await viewBoxAttr(page)).toBe(panned);
  });

  test('[crushword] Clues and back keeps the view', async ({ page }) => {
    const before = await viewBox(page);
    await pinch(page, { fx: 0.5, fy: 0.5 }, 50, 150);
    await settle(page);
    const zoomed = await viewBoxAttr(page);
    expect((await viewBox(page)).width).toBeLessThan(before.width);
    await page.locator('#clues-btn').tap();
    await page.locator('#clues-btn').tap();
    expect(await viewBoxAttr(page)).toBe(zoomed);
  });

  test('[crushword] resize keeps zoom and re-clamps', async ({ page }) => {
    const before = await viewBox(page);
    await pinch(page, { fx: 0.5, fy: 0.5 }, 50, 150);
    await settle(page);
    await page.setViewportSize({ width: 800, height: 380 });
    await expect.poll(async () => {
      const vb = await viewBox(page);
      const box = await page.locator('#grid-pane svg').boundingBox();
      return Math.abs(vb.width / vb.height / (box.width / box.height) - 1) < 0.01;
    }).toBe(true);
    expect((await viewBox(page)).width).toBeLessThan(before.width);
  });

  test('[crushword] beforeprint restores the whole grid', async ({ page }) => {
    const original = await viewBoxAttr(page);
    await pinch(page, { fx: 0.5, fy: 0.5 }, 50, 150);
    await settle(page);
    const zoomed = await viewBoxAttr(page);
    expect(zoomed).not.toBe(original);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    expect(await viewBoxAttr(page)).toBe(original);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    expect(await viewBoxAttr(page)).toBe(zoomed);
  });

  test('[crushword] following keeps the cursor in view through ‹ ›', async ({ page }) => {
    const before = await viewBoxAttr(page);
    await pinch(page, { fx: 0.25, fy: 0.25 }, 50, 150);
    await settle(page);
    const seen = new Set([await viewBoxAttr(page)]);
    for (let i = 0; i < 20; i++) {
      await page.locator('#clue-next').tap();
      expect(await inside(page, '.active-cell')).toBe(true);
      seen.add(await viewBoxAttr(page));
    }
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has(before)).toBe(false);
  });

  test('[crushword] a short entry is shown whole', async ({ page }) => {
    await pinch(page, { fx: 0.5, fy: 0.5 }, 100, 130);
    await settle(page);
    let wholeEntries = 0;
    for (let i = 0; i < 20; i++) {
      await page.locator('#clue-next').tap();
      // Whether the entry's cells together are small enough for the view at this zoom;
      // an entry that isn't gets only its cursor shown (the next test's rule).
      const fits = await page.evaluate(() => {
        const box = document.querySelector('#grid-pane svg').getBoundingClientRect();
        const rs = [...document.querySelectorAll('.active-entry, .active-cell')]
          .map(el => el.getBoundingClientRect());
        return Math.max(...rs.map(r => r.right)) - Math.min(...rs.map(r => r.left)) <= box.width
          && Math.max(...rs.map(r => r.bottom)) - Math.min(...rs.map(r => r.top)) <= box.height;
      });
      if (fits) wholeEntries++;
      expect(await inside(page, fits ? '.active-entry, .active-cell' : '.active-cell')).toBe(true);
    }
    expect(wholeEntries).toBeGreaterThan(0);
  });

  test('[crushword] a hand pan stays until the cursor moves or a letter is typed', async ({ page }) => {
    await pinch(page, '.active-cell', 50, 150);
    await settle(page);
    await drag(page, { fx: 0.5, fy: 0.5 }, [0, 0], [250, 0]);
    await settle(page);
    expect(await inside(page, '.active-cell')).toBe(false);
    const panned = await viewBoxAttr(page);
    await page.locator('#menu-btn').tap();
    await page.locator('#menu-btn').tap();
    expect(await viewBoxAttr(page)).toBe(panned);
    await page.locator('#drawn-kb [data-char="A"]').tap();
    expect(await inside(page, '.active-cell')).toBe(true);
  });

  test('[crushword] a change made on the Clues screen is followed on return', async ({ page }) => {
    await pinch(page, { fx: 0.25, fy: 0.25 }, 50, 150);
    await settle(page);
    await page.locator('#clues-btn').tap();
    await page.locator('#list-pane .list-cell').last().tap();
    await page.locator('#clues-btn').tap();
    expect(await inside(page, '.active-cell')).toBe(true);
  });

  test('[crushword] caret stays in the active cell while zoomed', async ({ page }) => {
    await pinch(page, { fx: 0.5, fy: 0.5 }, 50, 150);
    await settle(page);
    const cell = await tappableCell(page);
    await page.touchscreen.tap(cell.x, cell.y);
    await page.locator('#drawn-kb [data-char="A"]').tap();
    await page.locator('#drawn-kb [data-char="B"]').tap();
    const fits = await page.evaluate(() => {
      const c = document.querySelector('.cell-caret').getBoundingClientRect();
      const a = document.querySelector('.active-cell').getBoundingClientRect();
      return c.left >= a.left - 1 && c.right <= a.right + 1
        && c.top >= a.top - 1 && c.bottom <= a.bottom + 1;
    });
    expect(fits).toBe(true);
  });

  test('[crushword] a tap with a few px of jitter still selects its cell', async ({ page }) => {
    const id = await page.evaluate(() => {
      const el = document.querySelector('.cell:not(.active-cell):not(.active-entry)');
      const r = el.getBoundingClientRect();
      const pane = document.getElementById('grid-pane');
      const fire = (type, x) => pane.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x,
        clientY: r.top + r.height / 2, bubbles: true, cancelable: true,
      }));
      const x = r.left + r.width / 2;
      // 8px of movement: inside the tap slop, so it stays a tap and never pans.
      fire('pointerdown', x);
      fire('pointermove', x + 8);
      fire('pointerup', x + 8);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return el.id;
    });
    await expect(page.locator('#' + id)).toHaveClass(/active-cell/);
  });
});

// The glides themselves, with motion allowed. Each reads the view at once or one frame
// after an action inside the same evaluate, and waits for it to settle by polling.
test.describe('[crushword] animated zoom', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ page }) => load(page, 'crushword'));

  // Zooms in near the top-left corner and waits out the stray-click window.
  async function zoomIn(page) {
    await pinch(page, { fx: 0.25, fy: 0.25 }, 50, 150);
    await settle(page);
    return settled(page);
  }
  // Where `n` Tabs from a fresh load land when every move jumps: the same steps under
  // reduced motion, on a reloaded page (the cursor isn't saved; Tabs type nothing).
  async function jumpTarget(page, n) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await load(page, 'crushword');
    await zoomIn(page);
    const { atOnce } = await pressKeys(page, 'Tab', n);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    return atOnce;
  }
  // The grid SVG's px per user unit, and the settled x a view panned fully left rests at.
  const restingLeftX = page => page.evaluate(() => {
    const svg = document.querySelector('#grid-pane svg');
    const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    return -Math.max(2, 12 / k);
  });

  test('[crushword] following glides and settles where a jump lands', async ({ page }) => {
    const start = await zoomIn(page);
    const { atOnce, afterFrame } = await pressKeys(page, 'Tab', 6);
    expect(atOnce).toBe(start);
    const end = await settled(page);
    expect(end).not.toBe(start);
    expect(afterFrame).not.toBe(start);
    expect(afterFrame).not.toBe(end);
    expect(await inside(page, '.active-cell')).toBe(true);
    expect(await jumpTarget(page, 6)).toBe(end);
  });

  test('[crushword] a drag past the left edge overshoots, then rests a margin past it', async ({ page }) => {
    await zoomIn(page);
    const { atOnce } = await drag(page, { fx: 0.5, fy: 0.5 }, [0, 0], [400, 0]);
    await settle(page);
    const rest = await viewBox(page);
    await settled(page);
    const x = (await viewBox(page)).x;
    expect(Number(atOnce.split(' ')[0])).toBeLessThan(x);
    expect(Math.abs(x - await restingLeftX(page))).toBeLessThan(0.5);
    expect(rest.x).toBeCloseTo(x, 1);
    await drag(page, { fx: 0.5, fy: 0.5 }, [0, 0], [200, 0]);
    await settle(page);
    expect((await viewBox(page)).x).toBeCloseTo(x, 1);
  });

  test('[crushword] a tap during a spring-back still rests in bounds', async ({ page }) => {
    await zoomIn(page);
    await drag(page, { fx: 0.5, fy: 0.5 }, [0, 0], [400, 0], { thenTap: true });
    await settle(page);
    await settled(page);
    expect(Math.abs((await viewBox(page)).x - await restingLeftX(page))).toBeLessThan(0.5);
  });

  test('[crushword] a tap during a pinch-out spring-back rests on the whole grid', async ({ page }) => {
    const original = await viewBoxAttr(page);
    const { atOnce } = await pinch(page, { fx: 0.5, fy: 0.5 }, 150, 50, { thenTap: true });
    expect(atOnce).not.toBe(original);
    await settle(page);
    expect(await settled(page)).toBe(original);
  });

  test('[crushword] a drag on the whole grid stretches, then springs back to the engine\'s viewBox', async ({ page }) => {
    const original = await viewBoxAttr(page);
    const before = await viewBox(page);
    const { atOnce } = await drag(page, { fx: 0.5, fy: 0.5 }, [0, 0], [120, 80]);
    const [x, y] = atOnce.split(' ').map(Number);
    // Moved the way the finger went, but by less than the finger, with resistance.
    expect(x).toBeLessThan(before.x);
    expect(y).toBeLessThan(before.y);
    expect(before.x - x).toBeLessThan(120 * before.width / (await page.locator('#grid-pane svg').boundingBox()).width);
    await settle(page);
    expect(await settled(page)).toBe(original);
  });

  test('[crushword] an over-pinch springs back around the fingers\' last midpoint', async ({ page }) => {
    const box = await page.locator('#grid-pane svg').boundingBox();
    const mx = box.x + box.width * 0.4, my = box.y + box.height * 0.5;
    const { atOnce } = await pinch(page, { fx: 0.4, fy: 0.5 }, 40, 400);
    const [vx, vy, vw, vh] = atOnce.split(' ').map(Number);
    // The grid point under the midpoint as the fingers lift, and where it ends up.
    const px = vx + (mx - box.x) * vw / box.width, py = vy + (my - box.y) * vh / box.height;
    await settle(page);
    await settled(page);
    const end = await viewBox(page);
    expect(end.width).toBeGreaterThan(vw);
    expect(Math.abs(box.x + (px - end.x) * box.width / end.width - mx)).toBeLessThan(2);
    expect(Math.abs(box.y + (py - end.y) * box.height / end.height - my)).toBeLessThan(2);
  });

  test('[crushword] a tap mid-glide selects the cell under the finger', async ({ page }) => {
    const start = await zoomIn(page);
    const box = await page.locator('#grid-pane svg').boundingBox();
    const x = box.x + box.width * 0.5, y = box.y + box.height * 0.5;
    // What the finger lands on and the view it lands in, read as it lands: the tap's own
    // follow may move the view again afterwards.
    await page.evaluate(() => window.addEventListener('pointerdown', e => {
      const el = document.elementFromPoint(e.clientX, e.clientY).closest('.cell, .cell-block');
      window.landedOn = el && el.id;
      window.landedIn = document.querySelector('#grid-pane svg').getAttribute('viewBox');
    }, { capture: true, once: true }));
    await pressKeys(page, 'Tab', 6);
    await page.touchscreen.tap(x, y);
    await settled(page);
    const { id, landedIn } = await page.evaluate(() => ({ id: window.landedOn, landedIn: window.landedIn }));
    // A block can't be selected: the fixed point must land on a cell for the test to
    // mean anything.
    expect(id).toMatch(/^cell-/);
    await expect(page.locator('#' + id)).toHaveClass(/active-cell/);
    // The finger landed mid-glide, neither where it began nor where it was heading.
    expect(landedIn).not.toBe(start);
    expect(landedIn).not.toBe(await jumpTarget(page, 6));
  });

  test('[crushword] Clues mid-glide shows where the glide was heading', async ({ page }) => {
    await zoomIn(page);
    await pressKeys(page, 'Tab', 6);
    // A few frames go by while the grid is hidden, as they would for a real visit.
    await page.evaluate(async () => {
      document.getElementById('clues-btn').click();
      for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
      document.getElementById('clues-btn').click();
    });
    const end = await settled(page);
    expect(await jumpTarget(page, 6)).toBe(end);
  });

  test('[crushword] reduced motion switched on mid-glide ends the glide at its target', async ({ page }) => {
    await zoomIn(page);
    await pressKeys(page, 'Tab', 6);
    // No further move: the switch alone ends the glide, by the next frame.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const shown = await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      return document.querySelector('#grid-pane svg').getAttribute('viewBox');
    });
    expect(await jumpTarget(page, 6)).toBe(shown);
  });

  test('[crushword] edge shadow marks the sides with more grid', async ({ page }) => {
    const pane = page.locator('#grid-pane');
    const shadow = side => page.locator(`.edge-shadow[data-side="${side}"]`);
    const opacity = side => shadow(side).evaluate(el => getComputedStyle(el).opacity);
    await expect(pane).not.toHaveAttribute('data-more');
    await pinch(page, { fx: 0.5, fy: 0.5 }, 50, 150);
    await settle(page);
    await settled(page);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(pane).toHaveAttribute('data-more', new RegExp(`\\b${side}\\b`));
    }
    await drag(page, { fx: 0.5, fy: 0.5 }, [0, 0], [400, 0]);
    await settle(page);
    await settled(page);
    await expect(pane).not.toHaveAttribute('data-more', /\bleft\b/);
    await expect.poll(() => opacity('left')).toBe('0');
    await expect.poll(() => opacity('right')).toBe('1');
    const point = await center(page, '#grid-pane svg');
    await page.touchscreen.tap(point.x, point.y);
    await page.touchscreen.tap(point.x, point.y);
    await expect(pane).not.toHaveAttribute('data-more');
  });

  test('[crushword] print shows the whole grid and no shadow, then returns to the target', async ({ page }) => {
    const original = await viewBoxAttr(page);
    await zoomIn(page);
    await pressKeys(page, 'Tab', 6);
    // A print's order: beforeprint, the print layout, the screen layout again,
    // afterprint. Two frames after each layout change let its resize arrive.
    const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.emulateMedia({ media: 'print' });
    await frames();
    expect(await viewBoxAttr(page)).toBe(original);
    await expect(page.locator('.edge-shadow')).toHaveCount(4);
    for (const el of await page.locator('.edge-shadow').all()) await expect(el).toBeHidden();
    await page.emulateMedia({ media: null });
    await frames();
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    const after = await settled(page);
    expect(await jumpTarget(page, 6)).toBe(after);
  });

  test('[crushword] typing keeps the cursor in view', async ({ page }) => {
    await pinch(page, '.active-cell', 50, 150);
    await settle(page);
    await settled(page);
    const cells = await page.locator('.cell.active-entry, .cell.active-cell').count();
    // The viewBox's x at every frame while typing across: the view never steps back.
    await page.evaluate(() => {
      window.frameXs = [];
      const svg = document.querySelector('#grid-pane svg');
      const record = () => {
        window.frameXs.push(Number(svg.getAttribute('viewBox').split(/\s+/)[0]));
        window.recording = requestAnimationFrame(record);
      };
      record();
    });
    for (let i = 0; i < cells - 1; i++) {
      await page.locator('#drawn-kb [data-char="A"]').tap();
      await nextCellKey(page).tap();
      await page.waitForTimeout(150);
      // Mid-glide the cell may still be sliding in; it is on screen, its center inside.
      expect(await centerInside(page, '.active-cell')).toBe(true);
    }
    await settled(page);
    const xs = await page.evaluate(() => {
      cancelAnimationFrame(window.recording);
      return window.frameXs;
    });
    expect(xs.length).toBeGreaterThan(cells);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 0.01);
    expect(xs[xs.length - 1]).toBeGreaterThan(xs[0]);
    expect(await inside(page, '.active-cell')).toBe(true);
    await pressKeys(page, 'Tab', 10);
    await settled(page);
    expect(await inside(page, '.active-cell')).toBe(true);
  });
});
