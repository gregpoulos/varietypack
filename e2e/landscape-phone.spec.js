'use strict';

// The landscape arrangement of the phone solving view: a strip across the top, the
// stage at the left and the drawn keyboard at the right. The view's behavior is
// e2e/phone.spec.js's and its portrait layout e2e/mobile.spec.js's; this file only
// covers where things sit once the screen is short and wide. Run under the mobile
// projects in playwright.config.js.
//
// Resizing the viewport inside a phone project shows the layout only; it says nothing
// about the safe areas, the notch or the home indicator, which need a real device.

const { test, expect } = require('@playwright/test');
const { buildPuzzleFile } = require('../test/helpers');
const yaml = require('js-yaml');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const {
  TOOL_FIXTURES, LONG_CLUE, MUDDLED_CW, BAR_TEXT, buildClueVariant, dismissIntro, obstructed, LANDSCAPE,
  TABLET_LANDSCAPE,
} = require('./mobile');
const { solveCrushwordBoard, solveRingBoard } = require('./helpers');

const EPS = 1;

let tmpDir;
const htmlPaths = {};
test.beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'landscape-'));
  for (const f of TOOL_FIXTURES) {
    htmlPaths[f.tool] = path.join(tmpDir, f.tool + '.html');
    buildPuzzleFile(f.yamlPath, htmlPaths[f.tool]);
  }
  htmlPaths['crushword-muddled'] = path.join(tmpDir, 'crushword-muddled.html');
  buildPuzzleFile(MUDDLED_CW, htmlPaths['crushword-muddled']);
  for (const f of TOOL_FIXTURES) htmlPaths[f.tool + '-long'] = buildClueVariant(f, LONG_CLUE, f.tool + '-long', tmpDir);
  // Crushword again with a different title / with instructions (its fixture has neither).
  const cw = TOOL_FIXTURES.find(f => f.tool === 'crushword');
  for (const [name, extra] of [
    ['crushword-long-title', { title: 'An exceedingly long title that could never fit on a single line of the strip' }],
    ['crushword-instructions', { instructions: 'Every answer reads in both directions.' }],
  ]) {
    const yamlPath = path.join(tmpDir, name + '.yaml');
    fs.writeFileSync(yamlPath, yaml.dump({ ...yaml.load(fs.readFileSync(cw.yamlPath, 'utf8')), ...extra }));
    htmlPaths[name] = path.join(tmpDir, name + '.html');
    buildPuzzleFile(yamlPath, htmlPaths[name]);
  }
});
test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function open(page, key, size, { keepIntro = false } = {}) {
  await page.setViewportSize(size);
  await page.goto('file://' + htmlPaths[key]);
  await expect(page.locator('#drawn-kb')).toBeVisible();
  if (!keepIntro) await dismissIntro(page);
}

function rect(page, sel) {
  return page.locator(sel).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  });
}

// The strip's height, read from the --strip-h the landscape block sets, so a size tweak
// in the CSS moves these assertions with it.
function stripH(page) {
  return page.locator('#solve-view').evaluate(el => parseFloat(getComputedStyle(el).getPropertyValue('--strip-h')));
}

// The strip's rule: the border-bottom of #solve-view::before (theme-components).
function ruleW(page) {
  return page.locator('#solve-view').evaluate(el => parseFloat(getComputedStyle(el, '::before').borderBottomWidth));
}

function vp(page) {
  return page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
}

const sizes = testInfo => [['short', LANDSCAPE.short], ['device', LANDSCAPE.device(testInfo.project.name)]];

for (const { tool } of TOOL_FIXTURES) {
  test.describe(tool, () => {
    test('the grid is left of the keyboard and the whole view is on screen', async ({ page }, testInfo) => {
      for (const [label, size] of sizes(testInfo)) {
        await open(page, tool, size);
        const [stage, kb, view, v] = await Promise.all([
          rect(page, '#solve-stage'), rect(page, '#drawn-kb'), rect(page, '#solve-view'), vp(page)]);
        expect(stage.right, `${label}: stage left of keyboard`).toBeLessThanOrEqual(kb.left + EPS);
        expect(kb.right, `${label}: keyboard right`).toBeLessThanOrEqual(v.width + EPS);
        expect(kb.bottom, `${label}: keyboard bottom`).toBeLessThanOrEqual(v.height + EPS);
        expect(Math.abs(view.height - v.height), `${label}: view height`).toBeLessThanOrEqual(EPS);
        const scroll = await page.evaluate(() => {
          const de = document.documentElement;
          return { sh: de.scrollHeight, ch: de.clientHeight, sw: de.scrollWidth, cw: de.clientWidth };
        });
        expect(scroll.sh, `${label}: page scrolls vertically`).toBeLessThanOrEqual(scroll.ch);
        expect(scroll.sw, `${label}: page scrolls horizontally`).toBeLessThanOrEqual(scroll.cw);
      }
    });

    test('the stage takes the full height below the strip', async ({ page }, testInfo) => {
      for (const [label, size] of sizes(testInfo)) {
        await open(page, tool, size);
        const stage = await rect(page, '#solve-stage');
        const v = await vp(page);
        const STRIP = await stripH(page);
        expect(Math.abs(stage.top - STRIP), `${label}: stage top`).toBeLessThanOrEqual(EPS);
        expect(stage.bottom, `${label}: stage bottom`).toBeGreaterThanOrEqual(v.height - EPS);
      }
    });

    test('every key is at least 44px high and every letter key at least 31px wide', async ({ page }) => {
      await open(page, tool, LANDSCAPE.short);
      const { tooShort, tooNarrow } = await page.evaluate(() => {
        const sizeOf = sel => [...document.querySelectorAll(sel)]
          .filter(el => el.checkVisibility())
          .map(el => ({ el: el.dataset.char || el.dataset.key || el.getAttribute('aria-label') || el.textContent.trim(),
            w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
        return {
          tooShort: sizeOf('#drawn-kb button').filter(k => k.h < 44),
          tooNarrow: sizeOf('#drawn-kb [data-char]').filter(k => k.w < 31),
        };
      });
      expect(tooShort).toEqual([]);
      expect(tooNarrow).toEqual([]);
    });

    test('the buttons clear the strip\'s rule', async ({ page }, testInfo) => {
      for (const [label, size] of sizes(testInfo)) {
        await open(page, tool, size);
        const stage = await rect(page, '#solve-stage');
        const RULE = await ruleW(page);
        for (const sel of ['#clues-btn', '#help-btn', '#menu-btn']) {
          const r = await rect(page, sel);
          expect(stage.top - RULE - r.bottom, `${label}: ${sel} under`).toBeGreaterThanOrEqual(4 - EPS);
          expect(r.top, `${label}: ${sel} above`).toBeGreaterThanOrEqual(4 - EPS);
        }
      }
    });

    test('the lowest key sits at least 10px above the screen\'s bottom edge', async ({ page }, testInfo) => {
      for (const [label, size] of sizes(testInfo)) {
        await open(page, tool, size);
        const v = await vp(page);
        const bottom = await page.evaluate(() => Math.max(
          ...[...document.querySelectorAll('#drawn-kb button')]
            .filter(b => b.checkVisibility()).map(b => b.getBoundingClientRect().bottom)));
        expect(v.height - bottom, label).toBeGreaterThanOrEqual(10 - EPS);
      }
    });

    test('the title and the buttons share the strip, in that order', async ({ page }, testInfo) => {
      for (const [label, size] of sizes(testInfo)) {
        await open(page, tool, size);
        const STRIP = await stripH(page);
        const sels = ['.solve-head-slot', '#clues-btn', '#help-btn', '#menu-btn'];
        const rects = [];
        for (const sel of sels) rects.push(await rect(page, sel));
        rects.forEach((r, i) => {
          expect(r.top, `${label}: ${sels[i]} top`).toBeGreaterThanOrEqual(0);
          expect(r.bottom, `${label}: ${sels[i]} bottom`).toBeLessThanOrEqual(STRIP + EPS);
          if (i > 0) expect(r.left, `${label}: ${sels[i]} after ${sels[i - 1]}`).toBeGreaterThan(rects[i - 1].left);
        });
        expect(rects[0].right, `${label}: title before the buttons`).toBeLessThanOrEqual(rects[1].left + EPS);
      }
    });

    test('the clue bar sits above the keyboard, as wide as it, and at least 44px high', async ({ page }, testInfo) => {
      for (const [label, size] of sizes(testInfo)) {
        await open(page, tool, size);
        const [bar, kb] = await Promise.all([rect(page, '#solve-bar'), rect(page, '#drawn-kb')]);
        const STRIP = await stripH(page);
        expect(bar.top, `${label}: below the strip`).toBeGreaterThanOrEqual(STRIP - EPS);
        expect(bar.bottom, `${label}: above the keys`).toBeLessThanOrEqual(kb.top + EPS);
        expect(Math.abs(bar.left - kb.left), `${label}: left edge`).toBeLessThanOrEqual(EPS);
        expect(Math.abs(bar.right - kb.right), `${label}: right edge`).toBeLessThanOrEqual(EPS);
        expect(bar.height, `${label}: height`).toBeGreaterThanOrEqual(44);
      }
    });

    test('no button or cell is covered', async ({ page }, testInfo) => {
      for (const [label, size] of sizes(testInfo)) {
        await open(page, tool, size);
        expect(await obstructed(page), label).toEqual([]);
      }
    });

    test('rotating switches the layout live, and typing still works', async ({ page }, testInfo) => {
      const { width: w, height: h } = LANDSCAPE.device(testInfo.project.name);
      await open(page, tool, { width: w, height: h });
      const sideBySide = async label => {
        const [stage, kb] = await Promise.all([rect(page, '#solve-stage'), rect(page, '#drawn-kb')]);
        expect(stage.right, label).toBeLessThanOrEqual(kb.left + EPS);
      };
      await sideBySide('landscape');
      await page.setViewportSize({ width: h, height: w });
      const [stage, kb] = await Promise.all([rect(page, '#solve-stage'), rect(page, '#drawn-kb')]);
      expect(kb.top, 'portrait: stacked').toBeGreaterThanOrEqual(stage.bottom - EPS);
      await page.setViewportSize({ width: w, height: h });
      await sideBySide('landscape again');
      await page.locator('#drawn-kb [data-char="Q"]').tap();
      await expect(page.locator('.cell-letter', { hasText: 'Q' }).first()).toBeVisible();
    });
  });
}

test.describe('crushword', () => {
  test('the keyboard is min(55%, 400px) wide', async ({ page }, testInfo) => {
    for (const [label, size] of sizes(testInfo)) {
      await open(page, 'crushword', size);
      const [kb, v] = await Promise.all([rect(page, '#drawn-kb'), vp(page)]);
      expect(Math.abs(kb.width - Math.min(0.55 * v.width, 400)), label).toBeLessThanOrEqual(EPS);
    }
  });

  test('a tablet-sized landscape screen keeps the stacked layout', async ({ page }) => {
    await open(page, 'crushword', TABLET_LANDSCAPE);
    const [stage, kb] = await Promise.all([rect(page, '#solve-stage'), rect(page, '#drawn-kb')]);
    expect(kb.top).toBeGreaterThanOrEqual(stage.bottom - EPS);
  });

  test('a hashed page, with no help button, keeps ☰ at the right edge', async ({ page }) => {
    await open(page, 'crushword-muddled', LANDSCAPE.short);
    expect(await page.locator('#help-btn').count()).toBe(0);
    const [clues, menu, v] = await Promise.all([rect(page, '#clues-btn'), rect(page, '#menu-btn'), vp(page)]);
    expect(clues.right).toBeLessThanOrEqual(menu.left + EPS);
    const gap = v.width - menu.right;
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(8);
  });
});

// Screens shorter than the strip, a 44px bar and four 44px key rows: the rows shrink
// (to 32px at the least), so the bar keeps its height and the keyboard stays on screen.
test.describe('short screens', () => {
  for (const { tool } of TOOL_FIXTURES) {
    for (const height of [300, 280, 260]) {
      test(`[${tool}] at ${height}px high the bar keeps 44px and the keyboard fits`, async ({ page }) => {
        await open(page, tool, { width: 658, height });
        const [bar, kb, key] = await Promise.all([
          rect(page, '#solve-bar'), rect(page, '#drawn-kb'), rect(page, '#drawn-kb button[data-char="Q"]')]);
        expect(bar.height, 'bar height').toBeGreaterThanOrEqual(44 - EPS);
        expect(kb.bottom, 'keyboard bottom').toBeLessThanOrEqual(height + EPS);
        expect(key.height, 'key height').toBeGreaterThanOrEqual(32 - EPS);
      });
    }
  }
});

test.describe('strip details', () => {
  // The clue shows as many lines as the bar has height for (the container query steps in
  // base.css), never a partly cut one. A taller screen leaves the bar more height.
  for (const { tool } of TOOL_FIXTURES) {
    test(`[${tool}] the clue fills the bar's height in whole lines`, async ({ page }) => {
      let prev = 0;
      for (const height of [320, 360, 400]) {
        await open(page, tool + '-long', { width: 658, height });
        const text = page.locator(BAR_TEXT(tool));
        const [bar, box] = await Promise.all([rect(page, '#solve-bar'), rect(page, BAR_TEXT(tool))]);
        const lineH = await text.evaluate(el => parseFloat(getComputedStyle(el).lineHeight));
        const lines = Math.round(box.height / lineH);
        expect(box.height, `${height}: whole lines`).toBeLessThanOrEqual(lines * lineH + EPS);
        expect(box.height, `${height}: whole lines`).toBeGreaterThanOrEqual(lines * lineH - EPS);
        expect(box.top, `${height}: inside the bar`).toBeGreaterThanOrEqual(bar.top - EPS);
        expect(box.bottom, `${height}: inside the bar`).toBeLessThanOrEqual(bar.bottom + EPS);
        expect(lines, `${height}: lines`).toBeGreaterThanOrEqual(Math.max(prev, 2));
        prev = lines;
      }
      expect(prev, 'the tallest screen shows more than two').toBeGreaterThan(2);
    });
  }

  for (const { tool } of TOOL_FIXTURES) {
    test(`[${tool}] a cut-off clue opens in full below the strip, over the keyboard, and closes on a tap`, async ({ page }) => {
      await open(page, tool + '-long', LANDSCAPE.short);
      const stageBefore = await rect(page, '#solve-stage');
      const textEl = page.locator(BAR_TEXT(tool));
      const clue = (await textEl.textContent()).trim();
      await textEl.tap();
      await expect(page.locator('#clue-full')).toBeVisible();
      const [full, kb, v] = await Promise.all([rect(page, '#clue-full'), rect(page, '#drawn-kb'), vp(page)]);
      const STRIP = await stripH(page);
      expect(Math.abs(full.top - STRIP), 'top').toBeLessThanOrEqual(EPS);
      expect(Math.abs(full.left - kb.left), 'left').toBeLessThanOrEqual(2);
      expect(full.right, 'right').toBeLessThanOrEqual(v.width + EPS);
      expect(full.bottom, 'bottom').toBeLessThanOrEqual(v.height + EPS);
      expect((await page.locator('#clue-full').textContent()).trim()).toContain(clue.replace(/…$/, '').slice(0, 20));
      expect(await rect(page, '#solve-stage'), 'stage unmoved').toEqual(stageBefore);
      await page.locator('#clue-full').tap();
      await expect(page.locator('#clue-full')).toBeHidden();
    });
  }

  test('a long title stays on one line and the strip keeps its height', async ({ page }) => {
    await open(page, 'crushword-long-title', LANDSCAPE.short);
    const [title, slot, stage] = await Promise.all([
      rect(page, '.solve-title'), rect(page, '.solve-head-slot'), rect(page, '#solve-stage')]);
    const STRIP = await stripH(page);
    expect(title.height).toBeLessThanOrEqual(24);
    expect(slot.bottom).toBeLessThanOrEqual(STRIP + EPS);
    expect(Math.abs(stage.top - STRIP)).toBeLessThanOrEqual(EPS);
  });

  for (const [panel, button] of [['#help-panel', '#help-btn'], ['#menu-panel', '#menu-btn']]) {
    test(`the ${panel} opens under the strip, inside the screen`, async ({ page }) => {
      await open(page, 'crushword', LANDSCAPE.short);
      await page.locator(button).tap();
      await expect(page.locator(panel)).toBeVisible();
      const [r, v] = await Promise.all([rect(page, panel), vp(page)]);
      const STRIP = await stripH(page);
      expect(Math.abs(r.top - STRIP), 'top').toBeLessThanOrEqual(4);
      expect(r.bottom, 'bottom').toBeLessThanOrEqual(v.height + EPS);
      expect(r.right, 'right').toBeLessThanOrEqual(v.width + EPS);
      if (panel === '#help-panel') {
        await page.locator('#reveal-puzzle-btn').scrollIntoViewIfNeeded();
        expect((await rect(page, '#reveal-puzzle-btn')).bottom, 'last row').toBeLessThanOrEqual(v.height + EPS);
      }
      const scroll = await page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight);
      expect(scroll, 'the page itself did not grow').toBe(true);
    });
  }

  for (const tool of ['crushword', 'marching-bands']) {
    test(`[${tool}] the done-wrong banner fits the title slot and covers no clue`, async ({ page }) => {
      await open(page, tool, LANDSCAPE.short);
      const bar = await rect(page, '#solve-bar');
      if (tool === 'crushword') await solveCrushwordBoard(page, { toTyped: ch => (ch.toLowerCase() === 'a' ? 'B' : 'A') });
      else await solveRingBoard(page, { wrong: 'z' });
      await expect(page.locator('#done-wrong')).toBeVisible();
      const [banner, slot] = await Promise.all([rect(page, '#done-wrong'), rect(page, '.solve-head-slot')]);
      expect(banner.left).toBeGreaterThanOrEqual(slot.left - EPS);
      expect(banner.right).toBeLessThanOrEqual(slot.right + EPS);
      expect(banner.top).toBeGreaterThanOrEqual(slot.top - EPS);
      expect(banner.bottom).toBeLessThanOrEqual(slot.bottom + EPS);
      const clipped = await page.locator('#done-wrong').evaluate(el =>
        el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
      expect(clipped, 'banner text cut off').toBe(false);
      expect(await rect(page, '#solve-bar'), 'clue bar unmoved').toEqual(bar);
    });
  }

  test('the first-visit instructions fit the screen and a tap closes them', async ({ page }) => {
    await open(page, 'crushword-instructions', LANDSCAPE.short, { keepIntro: true });
    await expect(page.locator('#intro')).toBeVisible();
    const [card, v] = await Promise.all([rect(page, '.intro-card'), vp(page)]);
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.top).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(v.width + EPS);
    expect(card.bottom).toBeLessThanOrEqual(v.height + EPS);
    await page.locator('#intro').tap();
    await expect(page.locator('#intro')).toBeHidden();
  });
});

// The Clues screen: #solve-bar is hidden on it, and Marching Bands (a plain list) hides
// the keyboard too.
test.describe('Clues screen', () => {
  const openList = async (page, tool) => {
    await open(page, tool, LANDSCAPE.short);
    await page.locator('#clues-btn').tap();
    await expect(page.locator('#list-pane')).toBeVisible();
  };

  for (const tool of ['crushword', 'spiral', 'snake-charmer']) {
    test(`[${tool}] a fill-in list sits left of the keyboard, which stays`, async ({ page }) => {
      await openList(page, tool);
      await expect(page.locator('#drawn-kb')).toBeVisible();
      const [list, kb, v] = await Promise.all([rect(page, '#list-pane'), rect(page, '#drawn-kb'), vp(page)]);
      expect(list.right).toBeLessThanOrEqual(kb.left + EPS);
      expect(list.bottom).toBeLessThanOrEqual(v.height + EPS);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight)).toBe(true);
    });
  }

  test("Marching Bands' plain list spans the screen, with no keyboard", async ({ page }) => {
    await openList(page, 'marching-bands');
    await expect(page.locator('#drawn-kb')).toBeHidden();
    const [list, v] = await Promise.all([rect(page, '#list-pane'), vp(page)]);
    expect(list.width).toBeGreaterThanOrEqual(0.95 * v.width);
  });

  test("Marching Bands' navigator fills the clue bar above the keyboard", async ({ page }) => {
    await open(page, 'marching-bands', LANDSCAPE.short);
    const [nav, kb] = await Promise.all([rect(page, '#clue-navigator'), rect(page, '#drawn-kb')]);
    expect(nav.left).toBeGreaterThanOrEqual(kb.left - EPS);
    expect(nav.right).toBeLessThanOrEqual(kb.right + EPS);
    expect(nav.bottom).toBeLessThanOrEqual(kb.top + EPS);
    expect(nav.width).toBeGreaterThanOrEqual(180);
  });

  test("Crushword's bottom-row keys hold their labels", async ({ page }) => {
    await open(page, 'crushword', LANDSCAPE.short);
    const clipped = await page.evaluate(() => [...document.querySelectorAll('#drawn-kb .kb-bottom button')]
      .filter(b => b.scrollWidth > b.clientWidth || b.scrollHeight > b.clientHeight)
      .map(b => b.textContent.trim()));
    expect(clipped).toEqual([]);
  });

  test('back on the grid, the layout is side by side again', async ({ page }) => {
    await openList(page, 'marching-bands');
    await page.locator('#clues-btn').tap();
    await expect(page.locator('#list-pane')).toBeHidden();
    const [stage, kb] = await Promise.all([rect(page, '#solve-stage'), rect(page, '#drawn-kb')]);
    expect(stage.right).toBeLessThanOrEqual(kb.left + EPS);
  });
});

// The keyboard-side preference (setupKeyboardSidePref): a menu row offered only where the
// side-by-side layout applies.
test.describe('keyboard side', () => {
  const kbLeft = async page => {
    const [stage, kb] = await Promise.all([rect(page, '#solve-stage'), rect(page, '#drawn-kb')]);
    return { stage, kb };
  };

  for (const { tool } of TOOL_FIXTURES) {
    test(`[${tool}] the menu row swaps the sides, keeps the strip and survives a reload`, async ({ page }) => {
      await open(page, tool, LANDSCAPE.short);
      const strip = await rect(page, '.solve-head-slot');
      await page.locator('#menu-btn').tap();
      await expect(page.locator('#keyboard-left-toggle')).not.toBeChecked();
      await page.locator('#keyboard-left-toggle-label').tap();
      await page.locator('#menu-btn').tap();
      const v = await vp(page);
      let { stage, kb } = await kbLeft(page);
      expect(kb.right, 'keyboard left of stage').toBeLessThanOrEqual(stage.left + EPS);
      expect(kb.left, 'keyboard at the left edge').toBeLessThanOrEqual(EPS);
      expect(stage.right, 'stage at the right edge').toBeGreaterThanOrEqual(v.width - EPS);
      expect(Math.abs(kb.width - Math.min(0.55 * v.width, 400)), 'keyboard width').toBeLessThanOrEqual(EPS);
      expect(Math.abs(stage.top - await stripH(page)), 'stage top').toBeLessThanOrEqual(EPS);
      expect(await rect(page, '.solve-head-slot'), 'strip unmoved').toEqual(strip);
      const bar = await rect(page, '#solve-bar');
      expect(Math.abs(bar.left - kb.left), 'clue bar with the keyboard').toBeLessThanOrEqual(EPS);
      expect(bar.bottom, 'clue bar above the keys').toBeLessThanOrEqual(kb.top + EPS);
      expect(await obstructed(page), 'nothing covered').toEqual([]);
      await page.reload();
      await expect(page.locator('#drawn-kb')).toBeVisible();
      ({ stage, kb } = await kbLeft(page));
      expect(kb.right, 'still left after reload').toBeLessThanOrEqual(stage.left + EPS);
    });
  }

  test('the row is offered only in landscape; the portrait layout ignores the preference', async ({ page }) => {
    await open(page, 'crushword', LANDSCAPE.short);
    await page.locator('#menu-btn').tap();
    await page.locator('#keyboard-left-toggle-label').tap();
    await page.setViewportSize({ width: LANDSCAPE.short.height, height: LANDSCAPE.short.width });
    await expect(page.locator('#keyboard-left-toggle-label')).toBeHidden();
    const { stage, kb } = await kbLeft(page);
    expect(kb.top, 'stacked').toBeGreaterThanOrEqual(stage.bottom - EPS);
    await page.setViewportSize(LANDSCAPE.short);
    await expect(page.locator('#keyboard-left-toggle-label')).toBeVisible();
  });

  test("Marching Bands' plain list still spans the screen with the keyboard on the left", async ({ page }) => {
    await open(page, 'marching-bands', LANDSCAPE.short);
    await page.locator('#menu-btn').tap();
    await page.locator('#keyboard-left-toggle-label').tap();
    await page.locator('#menu-btn').tap();
    await page.locator('#clues-btn').tap();
    const [list, v] = await Promise.all([rect(page, '#list-pane'), vp(page)]);
    expect(list.width).toBeGreaterThanOrEqual(0.95 * v.width);
  });

  test('a fill-in list sits right of the keyboard when it is on the left', async ({ page }) => {
    await open(page, 'crushword', LANDSCAPE.short);
    await page.locator('#menu-btn').tap();
    await page.locator('#keyboard-left-toggle-label').tap();
    await page.locator('#menu-btn').tap();
    await page.locator('#clues-btn').tap();
    const [list, kb] = await Promise.all([rect(page, '#list-pane'), rect(page, '#drawn-kb')]);
    expect(kb.right).toBeLessThanOrEqual(list.left + EPS);
  });
});
