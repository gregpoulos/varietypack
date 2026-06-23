'use strict';

// Browser engine behavior for Marching Bands — the part node:test cannot cover.
// Covers: state-derived banners + hidden partial correctness; Tab navigation by
// row/band; Backspace's filled-vs-empty semantics; the hashed-mode per-keystroke
// cursor-advance invariant; and the print-media reset of .correct cell fills.

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../marching-bands/src/builder');

const FIX = path.join(__dirname, '..', 'marching-bands', 'test', 'fixtures');

let htmlPath;       // non-hashed mb-5 → PUZZLE_DATA.letters present
let hashedPath;     // hashed mb-5     → no letters; correctness via boardHash

test.beforeAll(() => {
  const stamp = Date.now();
  htmlPath   = path.join(os.tmpdir(), `mb-e2e-${stamp}.html`);
  hashedPath = path.join(os.tmpdir(), `mb-e2e-hashed-${stamp}.html`);
  buildPuzzle(path.join(FIX, 'mb-5.yaml'),         htmlPath);
  buildPuzzle(path.join(FIX, 'mb-5.muddled.yaml'), hashedPath);
});

test.afterAll(() => {
  for (const p of [htmlPath, hashedPath]) if (p) fs.rmSync(p, { force: true });
});

// Geometry helpers mirroring the engine's derivation from N. Expressing expected
// navigation targets as formulas (not hardcoded cell numbers) keeps these tests
// fixture-size-agnostic and tied to the contract rather than a snapshot.
const rowOf  = (n, N) => Math.ceil(n / N);
const colOf  = (n, N) => ((n - 1) % N) + 1;
const bandOf = (n, N) => Math.min(rowOf(n, N) - 1, colOf(n, N) - 1, N - rowOf(n, N), N - colOf(n, N));
const cellId = (r, c, N) => (r - 1) * N + c;

async function activeCellNum(page) {
  const id = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
  return Number(id.slice('cell-'.length));
}

async function ready(page) {
  await expect(page.locator('#puzzle-svg .cell').first()).toBeVisible();
  await page.evaluate(() => document.getElementById('hidden-input').focus());
}

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

test('Tab in row mode advances to the first cell of the next row, wrapping; Shift+Tab reverses', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const N = await page.evaluate(() => window.PUZZLE_DATA.size);

  // Default mode is row; the cursor starts at the first cell of row 1.
  expect(rowOf(await activeCellNum(page), N)).toBe(1);

  // Tab visits each subsequent row's first cell (always column 1), then wraps to row 1.
  const seq = [];
  for (let r = 2; r <= N; r++) seq.push(r);
  seq.push(1);
  for (const expectedRow of seq) {
    await page.keyboard.press('Tab');
    const n = await activeCellNum(page);
    expect(rowOf(n, N)).toBe(expectedRow);
    expect(colOf(n, N)).toBe(1);
  }

  // Shift+Tab steps back from row 1 to the last row.
  await page.keyboard.press('Shift+Tab');
  expect(rowOf(await activeCellNum(page), N)).toBe(N);
});

test('Tab in band mode advances to the first (top-left) cell of the next band, wrapping', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const N = await page.evaluate(() => window.PUZZLE_DATA.size);
  const numBands = Math.floor(N / 2);

  // Period key switches to band mode; the cursor stays on the row-1 start cell (band 0).
  await page.keyboard.press('.');
  expect(bandOf(await activeCellNum(page), N)).toBe(0);

  // Each Tab lands on the next band's first cell — its top-left corner, cellId(k+1, k+1).
  for (let step = 1; step <= numBands; step++) {
    await page.keyboard.press('Tab');
    const n = await activeCellNum(page);
    const expectedBand = step % numBands; // wraps to 0 on the final step
    expect(bandOf(n, N)).toBe(expectedBand);
    expect(n).toBe(cellId(expectedBand + 1, expectedBand + 1, N));
  }
});

test('Backspace clears a filled cell in place, then retreats and clears the previous cell when empty', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const N = await page.evaluate(() => window.PUZZLE_DATA.size);

  // Fill the first three cells of row 1; the cursor auto-advances past them.
  await page.keyboard.type('ABC');

  // Step back onto the filled cell holding 'B' (row 1, column 2).
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(await activeCellNum(page)).toBe(cellId(1, 2, N));
  await expect(page.locator(`#letter-${cellId(1, 2, N)}`)).toHaveText('B');

  // Backspace on a filled cell clears it; the cursor stays put.
  await page.keyboard.press('Backspace');
  await expect(page.locator(`#letter-${cellId(1, 2, N)}`)).toHaveText('');
  expect(await activeCellNum(page)).toBe(cellId(1, 2, N));

  // Backspace again on the now-empty cell retreats to the previous cell and clears it.
  await page.keyboard.press('Backspace');
  expect(await activeCellNum(page)).toBe(cellId(1, 1, N));
  await expect(page.locator(`#letter-${cellId(1, 1, N)}`)).toHaveText('');
});

test('hashed mode advances the cursor on every keystroke, independent of the board-complete check', async ({ page }) => {
  await page.goto('file://' + hashedPath);
  await ready(page);
  const N = await page.evaluate(() => window.PUZZLE_DATA.size);

  expect(await activeCellNum(page)).toBe(cellId(1, 1, N));

  // A single, non-final keystroke must move the cursor immediately: the engine advances
  // via focusCell()/syncUI() before (and regardless of) the hash check. No correctness is
  // revealed until the whole board is filled — guards against coalescing the two syncUI()s.
  await page.keyboard.type('Z');
  expect(await activeCellNum(page)).toBe(cellId(1, 2, N));
  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(0);
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#done-wrong')).toBeHidden();

  // Hashed mode never shows the Check Cell button.
  await expect(page.locator('#check-btn')).toBeHidden();
});

test('.correct cells render with white fill under print media', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  // Solve the board correctly so every active cell carries .correct.
  const correct = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const ch of correct) await page.keyboard.type(ch);
  await expect(page.locator('#congrats')).toBeVisible();
  await expect(page.locator('#cell-1')).toHaveClass(/correct/);

  // On screen a correct cell is filled with the highlight colour (not white).
  const screenFill = await page.evaluate(() => getComputedStyle(document.getElementById('cell-1')).fill);
  expect(screenFill).not.toBe('rgb(255, 255, 255)');

  // Under print the correct-state fill must reset to white (shared/themes/print-base.css).
  await page.emulateMedia({ media: 'print' });
  const printFill = await page.evaluate(() => getComputedStyle(document.getElementById('cell-1')).fill);
  expect(printFill).toBe('rgb(255, 255, 255)');
});

test('? button and ? key open keyboard-shortcuts modal; Esc closes it', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  const overlay = page.locator('#keys-overlay');
  await expect(overlay).toBeHidden();

  // Button click opens; Esc closes.
  await page.click('#keys-btn');
  await expect(overlay).toBeVisible();
  await expect(page.locator('#keys-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();

  // ? key opens; backdrop click closes. The native dialog centers as a card, so the
  // backdrop is the dimmed area around it — click a viewport corner to hit it.
  await page.keyboard.press('?');
  await expect(overlay).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(overlay).toBeHidden();
});

test('the open shortcuts modal keeps Tab focus off the grid input (native dialog)', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#keys-btn');
  await expect(page.locator('#keys-overlay')).toBeVisible();

  // showModal() makes the background inert, so Tab can't walk focus into the grid's
  // hidden input — the property the old non-modal <div> overlay didn't guarantee.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const onInput = await page.evaluate(() => document.activeElement.id === 'hidden-input');
    expect(onInput, `focus must not reach the grid input after Tab #${i + 1}`).toBe(false);
  }
});

test('keystrokes are suppressed while the shortcuts modal is open', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await page.evaluate(() => document.getElementById('hidden-input').focus());

  const firstCell = page.locator('#letter-1'); // cursor starts at the top-left cell (id 1)
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

test('board is locked after solve — input and Backspace are ignored', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const correct = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const ch of correct) await page.keyboard.type(ch);
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  // Close dialog without play-again so the board stays locked.
  await page.keyboard.press('Escape');
  await expect(page.locator('#congrats-dialog')).toBeHidden();

  // Snapshot all cell letters — position-independent, safe across all tools.
  const before = await page.locator('.cell-letter').allTextContents();

  // Typing is already blocked per-cell (MB rejects overwrites on correct cells), so it
  // can't prove the latch.solved guard on its own. Backspace is gated *only* by
  // latch.solved — the engine's Backspace handler clears the active cell with no
  // correct-cell check — so a no-op Backspace is MB's independent regression signal
  // that the board-lock guard is wired in.
  await page.keyboard.type('ZZZZZ');
  await page.keyboard.press('Backspace');
  expect(await page.locator('.cell-letter').allTextContents()).toEqual(before);
});

test('congrats dialog opens on solve with solve time and action buttons', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  await expect(page.locator('#congrats-dialog')).toBeHidden();

  const correct = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const ch of correct) await page.keyboard.type(ch);

  await expect(page.locator('#congrats-dialog')).toBeVisible();
  await expect(page.locator('#congrats-time')).toBeVisible();
  const timeText = await page.locator('#congrats-time').textContent();
  expect(timeText).toMatch(/^Solved in \d+:\d{2}$/);
  await expect(page.locator('#congrats-copy-btn')).toBeVisible();
  await expect(page.locator('#congrats-play-btn')).toBeVisible();
});

test('Play again button resets the board and re-enables input', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const correct = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const ch of correct) await page.keyboard.type(ch);
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  await page.click('#congrats-play-btn');
  await expect(page.locator('#congrats-dialog')).toBeHidden();

  // All cells empty after reset — position-independent.
  const afterReset = await page.locator('.cell-letter').allTextContents();
  expect(afterReset.every(t => t === '')).toBe(true);

  // Focus returns to the grid after play-again — verify before typing.
  await expect(page.locator('#hidden-input')).toBeFocused();
  // Input re-enabled — exactly one cell fills after a single keystroke.
  // Use fill() rather than keyboard.type(): after clicking a button inside a
  // showModal() dialog, Playwright's synthetic key dispatch doesn't fire input
  // events on background elements even though focus is correct. fill() uses CDP's
  // value-set mechanism and fires the input event the engine listens to directly.
  await page.locator('#hidden-input').fill('A');
  const afterType = await page.locator('.cell-letter').allTextContents();
  expect(afterType.filter(t => t !== '').length).toBe(1);
  expect(afterType.some(t => t === 'A')).toBe(true);
});

test('completion event fires with correct payload on solve', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);

  await page.evaluate(() => {
    window.__vpEvents = [];
    window.__vpMsgs   = [];
    document.querySelector('.puzzle-main').addEventListener('varietypack:complete', e => {
      window.__vpEvents.push(JSON.parse(JSON.stringify(e.detail)));
    });
    window.addEventListener('message', e => {
      if (e.data?.type === 'varietypack:complete') window.__vpMsgs.push(e.data);
    });
  });

  const { N, letters } = await page.evaluate(() => ({
    N:       window.PUZZLE_DATA.size,
    letters: window.PUZZLE_DATA.letters,
  }));

  await page.evaluate(() => {
    document.getElementById('hidden-input').focus();
  });

  for (let i = 0; i < N * N; i++) {
    if (letters[i] === null) continue;
    await page.keyboard.type(letters[i]);
  }

  await page.waitForFunction(() => window.__vpMsgs.length > 0);

  const [events, msgs] = await page.evaluate(() => [window.__vpEvents, window.__vpMsgs]);

  assert.strictEqual(events.length, 1, 'exactly one varietypack:complete event');
  const detail = events[0];
  assert.ok(typeof detail.boardHash === 'string' && detail.boardHash.length === 64);
  assert.strictEqual(detail.kind, 'marching-bands');
  assert.ok(typeof detail.timeMs === 'number' && detail.timeMs >= 0);
  assert.ok(typeof detail.solution === 'string' && detail.solution.length > 0);

  const computedHash = await page.evaluate((sol) => sha256hex(sol), detail.solution);
  assert.strictEqual(computedHash, detail.boardHash, 'sha256hex(solution) === boardHash');

  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].type,     'varietypack:complete');
  assert.strictEqual(msgs[0].solution, undefined);
});
