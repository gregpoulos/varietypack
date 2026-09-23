'use strict';

// Browser engine behavior for Spiral — the part node:test cannot cover. Covers:
// state-derived banners + hidden partial correctness; Tab entry navigation in both
// directions; Backspace's filled-vs-empty semantics; the hashed-mode per-keystroke
// cursor-advance invariant; the print-media reset of .correct cell fills; the
// per-puzzle letter/number font-size; board-lock after solve; rebus composing
// (Enter open/commit, suppressed completion mid-compose, autosave-restore-while-
// composing, non-hashed rebus scoring); and solved-board clue-item restore.
//
// Behavior Spiral shares byte-for-byte with one or more of the other engines —
// keyboard-shortcuts modal, options menu, congrats/Play-again, completion-event
// payload, Check Cell localStorage writes, rebus-button label resync, rebus-button
// presence, and hashed-rebus preimage — lives in e2e/shared.spec.js instead.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../spiral/src/builder');
const { typeCell } = require('./helpers');

const FIX = path.join(__dirname, '..', 'spiral', 'test', 'fixtures');

let htmlPath;     // non-hashed → PUZZLE_DATA.letters present (one char per cell, 1→N)
let hashedPath;   // hashed     → no letters; correctness via boardHash
let rebusPath;        // non-hashed rebus fixture
let rebusHashedPath;  // hashed rebus fixture
let tmpDir;       // unique temp directory per worker

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  hashedPath = path.join(tmpDir, 'puzzle-hashed.html');
  buildPuzzle(path.join(FIX, 'test-78.yaml'),         htmlPath);
  buildPuzzle(path.join(FIX, 'test-78.muddled.yaml'), hashedPath);

  rebusPath       = path.join(tmpDir, 'rebus.html');
  rebusHashedPath = path.join(tmpDir, 'rebus-hashed.html');
  buildPuzzle(path.join(FIX, 'rebus-40.yaml'),         rebusPath);
  buildPuzzle(path.join(FIX, 'rebus-40.muddled.yaml'), rebusHashedPath);
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
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

test('the menu button sits within the active-clue bar, vertically centered against its height', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const [btn, bar] = await Promise.all([
    page.locator('#menu-btn').boundingBox(),
    page.locator('#active-clue-bar').boundingBox(),
  ]);
  // The button used to float below the bar as a separate row, costing an
  // entire extra row of vertical space on mobile; it now sits within the
  // bar's own band instead, costing nothing extra.
  expect(btn.y).toBeGreaterThanOrEqual(bar.y);
  expect(btn.y + btn.height).toBeLessThanOrEqual(bar.y + bar.height);
  expect(btn.y - bar.y).toBeCloseTo((bar.y + bar.height) - (btn.y + btn.height), 1); // centered
});

test('board is locked after solve — letter input is ignored', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  for (const ch of letters) await page.keyboard.type(ch);
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  // Close dialog without play-again so the board stays locked
  await page.keyboard.press('Escape');
  await expect(page.locator('#congrats-dialog')).toBeHidden();

  // Snapshot all cell letters — position-independent, safe across all tools
  const before = await page.locator('.cell-letter').allTextContents();
  await page.keyboard.type('ZZZZZ');
  expect(await page.locator('.cell-letter').allTextContents()).toEqual(before);
});

// Inward cell contents, cells 1 → 40, for spiral/test/fixtures/rebus-40.yaml.
const REBUS_CELLS = [
  'A', 'B', 'C', 'D', 'EE', 'F', 'G', 'H', 'I', 'J',
  'K', 'LLL', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'YYYY', 'Z', 'A', 'B', 'C', 'D',
  'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
];

test('Enter opens a multi-letter cell; a second Enter commits without advancing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Cell 5 is the two-letter cell; arrow there first.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-5')).toHaveClass(/composing/);

  for (const ch of ['E', 'E']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-5')).toHaveText('EE');
  await expect(page.locator('#letter-5')).toHaveClass(/len-2/);
  // Capacity must never auto-advance.
  await expect(page.locator('#cell-5')).toHaveClass(/active-cell/);

  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-5')).not.toHaveClass(/composing/);
  // Committing no longer advances either: the cursor stays on the cell.
  await expect(page.locator('#cell-5')).toHaveClass(/active-cell/);
});

test('a composing prefix that would complete the board does not fire completion', async ({ page }) => {
  await page.goto('file://' + rebusHashedPath);
  await ready(page);

  const events = [];
  await page.exposeFunction('__vpComplete', d => events.push(d));
  await page.evaluate(() => {
    document.querySelector('.puzzle-main')
      .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
  });

  for (let i = 0; i < REBUS_CELLS.length - 1; i++) await typeCell(page, REBUS_CELLS[i]);

  // Final cell (40, single-letter 'N') entered as a rebus and left uncommitted: every
  // cell now holds correct content, but the board must not read as solved.
  await page.keyboard.press('Enter');
  await page.locator('#hidden-input').fill('N');

  // The dialog assertions are what actually catch the regression. `events` is fed by an
  // async exposeFunction bridge, so a bare length check here races it — and because the
  // latch is one-way, a premature fire still leaves events.length at 1 for the final
  // poll, making that assertion unable to tell premature from correct. The auto-retrying
  // DOM assertions below have neither problem: the dialog opens synchronously inside the
  // completion handler, so it is already open by the time fill() resolves.
  await expect(page.locator('#congrats-dialog')).toHaveCount(1);
  await expect(page.locator('#congrats-dialog')).not.toHaveJSProperty('open', true);
  expect(events).toHaveLength(0);

  // Committing the same content completes the board — proving the suppression was the
  // composing state, not wrong content.
  await page.keyboard.press('Enter');
  await expect(page.locator('#congrats-dialog')).toHaveJSProperty('open', true);
  await expect.poll(() => events.length).toBe(1);
});

// The auto-save payload records cell correctness only, so a solved board used to come
// back with green cells and unmarked clue items. checker.repaintIfSolved() re-derives
// the rest of the solved painting at restore time.
test('a solved board restores with its clue items still marked correct', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  for (const ch of letters) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  const clueCount = await page.locator('.clue-item').count();
  await expect(page.locator('.clue-item.correct')).toHaveCount(clueCount);

  await page.reload();
  await ready(page);

  await expect(page.locator('.cell.correct')).toHaveCount(letters.length);
  await expect(page.locator('.clue-item.correct')).toHaveCount(clueCount);
  // This guards the emission guarantee, and nothing about the repaint: focusCell's
  // syncUI does call latch.check(true) here, and sealIfSolved() is the only reason the
  // dialog stays shut. The repaint's own no-syncUI contract is pinned in
  // shared/test/engine-state.checker.test.js, not here.
  await expect(page.locator('#congrats-dialog')).toBeHidden();

  // The composing exclusion that syncUI's latch.check() lacks (see docs/CROSS_TOOL_SPEC.md
  // → Answer checking): a solved board is safe only because latch.solved makes every
  // keydown handler return before the Enter branch that opens composition. This is the
  // one place it can be exercised on a page that never touched a dialog — post-reload
  // the latch is sealed by sealIfSolved(), so CDP key injection is unimpaired. Enter
  // opens composition on any cell regardless of fixture (composer.enter marks whatever
  // cell is active); the rebus spec's Enter test is the control for that.
  await page.keyboard.press('Enter');
  await expect(page.locator('.cell.composing')).toHaveCount(0);

  // #rebus-btn reaches composition without going through setupKeydown at all, so the
  // latch.solved argument above does not cover it — setupRebusButton carries its own
  // guard. Removing that guard must turn this red.
  await page.locator('#rebus-btn').click();
  await expect(page.locator('.cell.composing')).toHaveCount(0);
});

test('the rebus button opens and commits composition without a keydown', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  const startCell = await activeCellNum(page);
  await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
  await page.locator('#rebus-btn').click();
  await expect(page.locator('.cell.composing')).toHaveCount(1);
  await expect(page.locator('#rebus-btn')).toHaveText('Done');

  // Letters must still reach the composing cell: the click preserves hidden-input focus.
  for (const ch of 'HAR') await page.locator('#hidden-input').fill(ch);
  await expect(page.locator(`#letter-${startCell}`)).toHaveText('HAR');

  await page.locator('#rebus-btn').click();
  await expect(page.locator('.cell.composing')).toHaveCount(0);
  await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
  expect(await activeCellNum(page)).toBe(startCell);   // commit doesn't move the cursor, matching Enter
});

// Per-engine wiring for the shared composing-restore contract: getState/applyState carry
// `composing`, and the Restore & focus epilogue resumes the cursor on that cell. Without
// the resume, focusCell's commitIfMoved would commit it on the way to the default cell
// and re-save with composing:null, silently undoing the restore.
test('a half-composed cell restores from autosave still composing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  const cell = await activeCellNum(page);
  await page.keyboard.press('Enter');
  for (const ch of ['B', 'B']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator(`#cell-${cell}`)).toHaveClass(/composing/);

  await page.reload();
  await ready(page);

  await expect(page.locator(`#letter-${cell}`)).toHaveText('BB');
  await expect(page.locator(`#cell-${cell}`)).toHaveClass(/composing/);
  await expect(page.locator(`#cell-${cell}`)).toHaveClass(/active-cell/);
  await expect(page.locator('#rebus-btn')).toHaveText('Done');

  // Still composing means still not filled: typing appends rather than replacing.
  await page.locator('#hidden-input').fill('C');
  await expect(page.locator(`#letter-${cell}`)).toHaveText('BBC');
});

test('a non-hashed rebus puzzle marks every cell and clue item correct on solve', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  for (const cell of REBUS_CELLS) await typeCell(page, cell);

  await expect(page.locator('#congrats')).toBeVisible();
  // 40 cells (rebus-40.yaml) — non-hashed mode must mark them .correct just like
  // hashed mode does, per the levelled-up completion behavior.
  await expect(page.locator('.cell.correct')).toHaveCount(40);
  // 8 inward + 8 outward entries (rebus-40.yaml) — previously only the hashed path
  // marked clue items.
  await expect(page.locator('.clue-item.correct')).toHaveCount(16);
});

