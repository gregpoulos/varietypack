'use strict';

// Browser engine behavior for Marching Bands — the part node:test cannot cover.
// Focuses on the cross-tool contract this change fixed: banners are derived from
// board state in syncUI() (no flag/timeout), and a full-but-wrong board reveals no
// partial correctness.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../marching-bands/src/builder');

let htmlPath;

test.beforeAll(() => {
  const yamlPath = path.join(__dirname, '..', 'marching-bands', 'test', 'fixtures', 'mb-5.yaml');
  htmlPath = path.join(os.tmpdir(), `mb-e2e-${Date.now()}.html`);
  buildPuzzle(yamlPath, htmlPath); // non-hashed → PUZZLE_DATA.letters is present
});

test.afterAll(() => {
  if (htmlPath) fs.rmSync(htmlPath, { force: true });
});

test('banners are state-derived and partial correctness stays hidden', async ({ page }) => {
  await page.goto('file://' + htmlPath);

  // init() ran on DOMContentLoaded if the grid rendered.
  await expect(page.locator('#puzzle-svg .cell').first()).toBeVisible();
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#done-wrong')).toBeHidden();

  // Cell letters come from rows, row-major, null at the center; the engine fills in
  // exactly that order, so typing the filtered letters fills the board correctly.
  const correct = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  await page.evaluate(() => document.getElementById('hidden-input').focus());

  // Fill the whole board with the first cell wrong, the rest correct.
  // PUZZLE_DATA.letters are lowercase; pick a letter that differs from correct[0].
  const wrongFirst = correct[0].toLowerCase() === 'z' ? 'y' : 'z';
  for (const ch of [wrongFirst, ...correct.slice(1)]) {
    await page.keyboard.type(ch);
  }

  // Full but wrong: done-wrong shows, congrats does not, and NO cell is marked correct.
  await expect(page.locator('#done-wrong')).toBeVisible();
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(0);

  // The cursor wrapped back to cell 1 (the wrong one). Backspace clears it, so the
  // board is no longer full — the banner must hide immediately (state-derived, no timeout).
  await page.keyboard.press('Backspace');
  await expect(page.locator('#done-wrong')).toBeHidden();

  // Re-type the correct first letter → board full and entirely correct → congrats.
  await page.keyboard.type(correct[0]);
  await expect(page.locator('#congrats')).toBeVisible();
  await expect(page.locator('#done-wrong')).toBeHidden();
});
