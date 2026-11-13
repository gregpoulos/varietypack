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
// five steps, and a settle() should follow before the next tap.
function gesture(page, center, fingers) {
  return page.evaluate(({ center: c, fingers: f }) => {
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
  }, { center, fingers });
}

// Two fingers either side of `center`, `fromDist` apart at first and `toDist` at the end:
// zooms by toDist / fromDist.
const pinch = (page, center, fromDist, toDist) => gesture(page, center, [
  { dx0: -fromDist / 2, dy0: 0, dx1: -toDist / 2, dy1: 0 },
  { dx0: fromDist / 2, dy0: 0, dx1: toDist / 2, dy1: 0 },
]);

// One finger from `center` offset by (dx0, dy0) to (dx1, dy1).
const drag = (page, center, [dx0, dy0], [dx1, dy1]) => gesture(page, center, [{ dx0, dy0, dx1, dy1 }]);

// Waits out the stray-click window, so the next tap is not eaten as a gesture's click.
const settle = page => page.waitForTimeout(450);

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
      // 8px of movement: past the tap slop, but the whole grid fits, so nothing can pan.
      fire('pointerdown', x);
      fire('pointermove', x + 8);
      fire('pointerup', x + 8);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return el.id;
    });
    await expect(page.locator('#' + id)).toHaveClass(/active-cell/);
  });
});
