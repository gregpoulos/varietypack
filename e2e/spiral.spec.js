'use strict';

// Browser-engine behavior specific to Spiral — what node:test can't cover: Tab within a
// direction, the engine-computed per-puzzle font sizes, the menu button's place in the
// active-clue bar, and the solved-board restore. Behavior it shares with the other
// engines lives in e2e/shared.spec.js.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzleFile } = require('../test/helpers');

const FIX = path.join(__dirname, '..', 'spiral', 'test', 'fixtures');

let htmlPath;     // non-hashed → PUZZLE_DATA.letters present (one char per cell, 1→N)
let tmpDir;       // unique temp directory per worker

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  buildPuzzleFile(path.join(FIX, 'test-78.yaml'),         htmlPath);
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// The active clue carries its direction and entry index in data attributes, so
// Tab navigation can be asserted at the contract level (which entry is active)
// without recomputing cell geometry.
async function activeClue(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.clue-item.active-clue');
    return el ? { dir: el.dataset.direction, idx: Number(el.dataset.entryIndex) } : null;
  });
}

async function ready(page) {
  await expect(page.locator('.cell').first()).toBeVisible();
  await page.evaluate(() => document.getElementById('hidden-input').focus());
}

test('Tab cycles entries within a direction (wrapping, Shift+Tab reverses) and never switches direction', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const inwardCount = await page.evaluate(() => window.PUZZLE_DATA.inward.length);

  // Starts inward on entry 0.
  expect(await activeClue(page)).toEqual({ dir: 'inward', idx: 0 });

  // Tab visits every inward entry in order and wraps — direction stays inward.
  for (let i = 1; i <= inwardCount; i++) {
    await page.keyboard.press('Tab');
    expect(await activeClue(page)).toEqual({ dir: 'inward', idx: i % inwardCount });
  }

  // Shift+Tab steps back from entry 0 to the last inward entry.
  await page.keyboard.press('Shift+Tab');
  expect(await activeClue(page)).toEqual({ dir: 'inward', idx: inwardCount - 1 });

  // Period toggles direction; Tab then cycles outward entries (still no cross-direction
  // jump).
  await page.keyboard.press('.');
  const outwardCount = await page.evaluate(() => window.PUZZLE_DATA.outward.length);
  const before = await activeClue(page);
  expect(before.dir).toBe('outward');
  await page.keyboard.press('Tab');
  expect(await activeClue(page)).toEqual({ dir: 'outward', idx: (before.idx + 1) % outwardCount });
});

test('theme CSS does not override the engine-computed per-puzzle letter/number font-size', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  // The engine sizes letters and numbers per puzzle (letterSize/numSize ∝ 1/N_TURNS)
  // and writes them as SVG font-size presentation attributes. A theme `font-size`
  // rule would win the cascade over those attributes and freeze the scaling, so the
  // rendered size must still match each element's own attribute.
  for (const id of ['#letter-1', '#cellnum-1']) {
    const { attr, computed } = await page.locator(id).evaluate((el) => ({
      attr:     parseFloat(el.getAttribute('font-size')),
      computed: parseFloat(getComputedStyle(el).fontSize),
    }));
    expect(attr).toBeGreaterThan(0);
    expect(computed).toBeCloseTo(attr, 1);
  }
});

// The bar and #menu-btn's place in it are shared CSS (shared/base.css,
// theme-components.css), so one tool covers it.
test('the menu button sits within the active-clue bar, vertically centered against its height', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const [btn, bar] = await Promise.all([
    page.locator('#menu-btn').boundingBox(),
    page.locator('#active-clue-bar').boundingBox(),
  ]);
  // The button used to float below the bar as a separate row, costing an
  // entire extra row of vertical space in a narrow window; it now sits within the
  // bar's own band instead, costing nothing extra.
  expect(btn.y).toBeGreaterThanOrEqual(bar.y);
  expect(btn.y + btn.height).toBeLessThanOrEqual(bar.y + bar.height);
  expect(btn.y - bar.y).toBeCloseTo((bar.y + bar.height) - (btn.y + btn.height), 1); // centered
});

