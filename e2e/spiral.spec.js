'use strict';

// Browser engine behavior for Spiral — the part node:test cannot cover. Covers:
// state-derived banners + hidden partial correctness; Tab entry navigation in both
// directions; Backspace's filled-vs-empty semantics; the hashed-mode per-keystroke
// cursor-advance invariant; and the print-media reset of .correct cell fills.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../spiral/src/builder');

const FIX = path.join(__dirname, '..', 'spiral', 'test', 'fixtures');

let htmlPath;     // non-hashed → PUZZLE_DATA.letters present (one char per cell, 1→N)
let hashedPath;   // hashed     → no letters; correctness via boardHash

test.beforeAll(() => {
  const stamp = Date.now();
  htmlPath   = path.join(os.tmpdir(), `sp-e2e-${stamp}.html`);
  hashedPath = path.join(os.tmpdir(), `sp-e2e-hashed-${stamp}.html`);
  buildPuzzle(path.join(FIX, 'test-78.yaml'),         htmlPath);
  buildPuzzle(path.join(FIX, 'test-78.muddled.yaml'), hashedPath);
});

test.afterAll(() => {
  for (const p of [htmlPath, hashedPath]) if (p) fs.rmSync(p, { force: true });
});

async function activeCellNum(page) {
  const id = await page.locator('.cell.active-cell').getAttribute('id');
  return Number(id.slice('cell-'.length));
}

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

test('banners are state-derived and partial correctness stays hidden', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#done-wrong')).toBeHidden();

  // letters holds one char per cell, cell 1 first; the cursor starts at cell 1 going
  // inward, so typing them in order fills the board. Make the first cell wrong.
  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  const wrongFirst = letters[0].toLowerCase() === 'z' ? 'y' : 'z';
  for (const ch of [wrongFirst, ...letters.slice(1)]) await page.keyboard.type(ch);

  // Full but wrong: done-wrong shows, congrats does not, nothing marked correct.
  await expect(page.locator('#done-wrong')).toBeVisible();
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('.cell.correct')).toHaveCount(0);

  // The cursor wrapped back to cell 1 (the wrong one). Clearing it empties the board,
  // so the banner must hide immediately (state-derived, no timeout).
  await page.keyboard.press('Backspace');
  await expect(page.locator('#done-wrong')).toBeHidden();

  // Re-type the correct first letter → board full and entirely correct → congrats.
  await page.keyboard.type(letters[0]);
  await expect(page.locator('#congrats')).toBeVisible();
  await expect(page.locator('#done-wrong')).toBeHidden();
});

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

  // Period toggles direction; Tab then cycles outward entries (still no cross-direction jump).
  await page.keyboard.press('.');
  const outwardCount = await page.evaluate(() => window.PUZZLE_DATA.outward.length);
  const before = await activeClue(page);
  expect(before.dir).toBe('outward');
  await page.keyboard.press('Tab');
  expect(await activeClue(page)).toEqual({ dir: 'outward', idx: (before.idx + 1) % outwardCount });
});

test('Backspace clears a filled cell in place, then retreats and clears the previous cell when empty', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  // Fill cells 1–3 going inward (contiguous cell numbers); the cursor advances to cell 4.
  await page.keyboard.type('ABC');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await activeCellNum(page)).toBe(2);
  await expect(page.locator('#letter-2')).toHaveText('B');

  // Backspace on a filled cell clears it; the cursor stays put.
  await page.keyboard.press('Backspace');
  await expect(page.locator('#letter-2')).toHaveText('');
  expect(await activeCellNum(page)).toBe(2);

  // Backspace again on the now-empty cell retreats to the previous cell and clears it.
  await page.keyboard.press('Backspace');
  expect(await activeCellNum(page)).toBe(1);
  await expect(page.locator('#letter-1')).toHaveText('');
});

test('hashed mode advances the cursor on every keystroke, independent of the board-complete check', async ({ page }) => {
  await page.goto('file://' + hashedPath);
  await ready(page);

  expect(await activeCellNum(page)).toBe(1);

  // A single, non-final keystroke moves the cursor immediately (cell 1 → cell 2, inward):
  // the engine advances via focusCell() before, and regardless of, the hash check. No
  // correctness is revealed until the whole board is filled.
  await page.keyboard.type('Z');
  expect(await activeCellNum(page)).toBe(2);
  await expect(page.locator('.cell.correct')).toHaveCount(0);
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#done-wrong')).toBeHidden();
  await expect(page.locator('#check-btn')).toBeHidden();
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

test('.correct cells render with white fill under print media', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  for (const ch of letters) await page.keyboard.type(ch);
  await expect(page.locator('#congrats')).toBeVisible();
  await expect(page.locator('#cell-1')).toHaveClass(/correct/);

  // On screen a correct cell carries the highlight fill (not white).
  const screenFill = await page.evaluate(() => getComputedStyle(document.getElementById('cell-1')).fill);
  expect(screenFill).not.toBe('rgb(255, 255, 255)');

  // Under print the correct-state fill must reset to white (shared/themes/print-base.css).
  await page.emulateMedia({ media: 'print' });
  const printFill = await page.evaluate(() => getComputedStyle(document.getElementById('cell-1')).fill);
  expect(printFill).toBe('rgb(255, 255, 255)');
});

test('? button and ? key open keyboard-shortcuts modal; Esc closes it', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

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
  await page.goto('file://' + htmlPath);
  await ready(page);

  const firstCell = page.locator('#letter-1'); // cursor starts at cell 1
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
