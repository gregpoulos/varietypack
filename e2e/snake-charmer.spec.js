'use strict';

// Browser engine behavior for Snake Charmer — the part node:test cannot cover. Covers:
// state-derived banners + hidden partial correctness; Tab entry navigation (wrapping,
// Shift+Tab); Backspace's filled-vs-empty semantics; the hashed-mode per-keystroke
// cursor-advance invariant; and the print-media reset of .correct cell fills.
//
// Note: Snake Charmer cell/letter ids are 0-indexed (cell-0 is the first ring cell),
// unlike Spiral and Marching Bands.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../snake-charmer/src/builder');

const FIX = path.join(__dirname, '..', 'snake-charmer', 'test', 'fixtures');

let htmlPath;     // non-hashed → PUZZLE_DATA.letters present (one char per ring position)
let hashedPath;   // hashed     → no letters; correctness via boardHash

test.beforeAll(() => {
  const stamp = Date.now();
  htmlPath   = path.join(os.tmpdir(), `sc-e2e-${stamp}.html`);
  hashedPath = path.join(os.tmpdir(), `sc-e2e-hashed-${stamp}.html`);
  buildPuzzle(path.join(FIX, 'circle-8.yaml'),         htmlPath);
  buildPuzzle(path.join(FIX, 'circle-8.muddled.yaml'), hashedPath);
});

test.afterAll(() => {
  for (const p of [htmlPath, hashedPath]) if (p) fs.rmSync(p, { force: true });
});

async function activeCellNum(page) {
  const id = await page.locator('.cell.active-cell').getAttribute('id');
  return Number(id.slice('cell-'.length));
}

// Clue DOM order equals entry index, so Tab navigation can be asserted at the
// contract level (which entry is active) without recomputing ring geometry.
async function activeClueIdx(page) {
  return page.evaluate(() => {
    const items = [...document.querySelectorAll('#clues .clue-item')];
    return items.findIndex(li => li.classList.contains('active-clue'));
  });
}

async function ready(page) {
  await expect(page.locator('.cell').first()).toBeVisible();
  await page.evaluate(() => document.getElementById('hidden-input').focus());
}

test('banners are state-derived and partial correctness stays hidden', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#done-wrong')).toBeHidden();

  // letters holds one char per ring position; the cursor starts at ring position 0,
  // so typing them in order fills the ring. Make the first cell wrong.
  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  const wrongFirst = letters[0].toLowerCase() === 'z' ? 'y' : 'z';
  for (const ch of [wrongFirst, ...letters.slice(1)]) await page.keyboard.type(ch);

  // Full but wrong: done-wrong shows, congrats does not, nothing marked correct.
  await expect(page.locator('#done-wrong')).toBeVisible();
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('.cell.correct')).toHaveCount(0);

  // The cursor wrapped back to ring position 0 (the wrong one). Clearing it empties a
  // cell, so the banner must hide immediately (state-derived, no timeout).
  await page.keyboard.press('Backspace');
  await expect(page.locator('#done-wrong')).toBeHidden();

  // Re-type the correct first letter → ring full and entirely correct → congrats.
  await page.keyboard.type(letters[0]);
  await expect(page.locator('#congrats')).toBeVisible();
  await expect(page.locator('#done-wrong')).toBeHidden();
});

test('Tab cycles through every entry (wrapping) and Shift+Tab reverses', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const n = await page.evaluate(() => window.PUZZLE_DATA.entries.length);

  // Starts on entry 0.
  expect(await activeClueIdx(page)).toBe(0);

  // Tab visits every entry in order and wraps back to entry 0.
  for (let i = 1; i <= n; i++) {
    await page.keyboard.press('Tab');
    expect(await activeClueIdx(page)).toBe(i % n);
  }

  // Shift+Tab steps back from entry 0 to the last entry.
  await page.keyboard.press('Shift+Tab');
  expect(await activeClueIdx(page)).toBe(n - 1);
});

test('Backspace clears a filled cell in place, then retreats and clears the previous cell when empty', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  // Fill ring positions 0–2; the cursor advances to position 3.
  await page.keyboard.type('ABC');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await activeCellNum(page)).toBe(1);
  await expect(page.locator('#letter-1')).toHaveText('B');

  // Backspace on a filled cell clears it; the cursor stays put.
  await page.keyboard.press('Backspace');
  await expect(page.locator('#letter-1')).toHaveText('');
  expect(await activeCellNum(page)).toBe(1);

  // Backspace again on the now-empty cell retreats to the previous cell and clears it.
  await page.keyboard.press('Backspace');
  expect(await activeCellNum(page)).toBe(0);
  await expect(page.locator('#letter-0')).toHaveText('');
});

test('hashed mode advances the cursor on every keystroke, independent of the board-complete check', async ({ page }) => {
  await page.goto('file://' + hashedPath);
  await ready(page);

  expect(await activeCellNum(page)).toBe(0);

  // A single, non-final keystroke moves the cursor immediately (position 0 → 1): the
  // engine advances via advanceCell() before, and regardless of, the hash check. No
  // correctness is revealed until the whole ring is filled.
  await page.keyboard.type('Z');
  expect(await activeCellNum(page)).toBe(1);
  await expect(page.locator('.cell.correct')).toHaveCount(0);
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#done-wrong')).toBeHidden();
  await expect(page.locator('#check-btn')).toBeHidden();
});

test('.correct cells render with white fill under print media', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  for (const ch of letters) await page.keyboard.type(ch);
  await expect(page.locator('#congrats')).toBeVisible();
  await expect(page.locator('#cell-0')).toHaveClass(/correct/);

  // On screen a correct cell carries the highlight fill (not white).
  const screenFill = await page.evaluate(() => getComputedStyle(document.getElementById('cell-0')).fill);
  expect(screenFill).not.toBe('rgb(255, 255, 255)');

  // Under print the correct-state fill must reset to white (shared/themes/print-base.css).
  await page.emulateMedia({ media: 'print' });
  const printFill = await page.evaluate(() => getComputedStyle(document.getElementById('cell-0')).fill);
  expect(printFill).toBe('rgb(255, 255, 255)');
});

test('? button and ? key open keyboard-shortcuts modal; Esc closes it', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await page.evaluate(() => document.getElementById('hidden-input').focus());

  const overlay = page.locator('#keys-overlay');
  await expect(overlay).toBeHidden();

  // Button click opens; Esc closes.
  await page.click('#keys-btn');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#keys-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();

  // ? key opens; backdrop click closes.
  await page.keyboard.press('?');
  await expect(overlay).toBeVisible();
  await overlay.click({ position: { x: 5, y: 5 } });
  await expect(overlay).toBeHidden();
});

test('keystrokes are suppressed while the shortcuts modal is open', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await page.evaluate(() => document.getElementById('hidden-input').focus());

  const firstCell = page.locator('#letter-0'); // cursor starts at ring position 0
  await expect(firstCell).toHaveText('');

  // With the modal open, focus parks on the close button and the keydown guard is
  // active — a typed letter must not reach the grid.
  await page.click('#keys-btn');
  await expect(page.locator('#keys-overlay')).toBeVisible();
  await page.keyboard.type('A');
  await expect(firstCell).toHaveText('');

  // Closing restores puzzle focus, so the same keystroke now lands.
  await page.keyboard.press('Escape');
  await expect(page.locator('#keys-overlay')).toBeHidden();
  await page.keyboard.type('A');
  await expect(firstCell).toHaveText('A');
});
