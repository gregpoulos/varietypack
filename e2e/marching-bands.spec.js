'use strict';

// Browser engine behavior for Marching Bands — the part node:test cannot cover.
// Covers: the shared clue-markdown wiring reaching MB's own clue list; state-derived
// banners + hidden partial correctness; Tab navigation by row/band; Backspace's
// filled-vs-empty semantics; the hashed-mode per-keystroke cursor-advance invariant;
// the print-media reset of .correct cell fills; the options menu's Clear-arming
// geometry and its own Check-Cell-visibility toggle (including its hashed-mode
// absence and survival across Clear/reload); board-lock after solve (input AND
// Backspace); rebus composing (Enter open/commit, the len-long size class,
// suppressed completion mid-compose, autosave-restore-while-composing, and
// non-hashed rebus scoring with no clue items marked — MB's own divergence there);
// and the solved-board Enter-sealed-composition guard.
//
// Behavior Marching Bands shares byte-for-byte with one or more of the other
// engines — keyboard-shortcuts modal, options menu open/close/focus, congrats/
// Play-again, completion-event payload, Check Cell localStorage writes,
// rebus-button label resync, rebus-button presence, and hashed-rebus preimage —
// lives in e2e/shared.spec.js instead.

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const yaml = require('js-yaml');
const { buildPuzzle } = require('../marching-bands/src/builder');
const { typeCell } = require('./helpers');

const FIX = path.join(__dirname, '..', 'marching-bands', 'test', 'fixtures');

let htmlPath;       // non-hashed mb-5 → PUZZLE_DATA.letters present
let hashedPath;     // hashed mb-5     → no letters; correctness via boardHash
let rebusPath;        // non-hashed rebus fixture
let rebusHashedPath;  // hashed rebus fixture
let tmpDir;         // unique temp directory per worker

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  hashedPath = path.join(tmpDir, 'puzzle-hashed.html');
  buildPuzzle(path.join(FIX, 'mb-5.yaml'),         htmlPath);
  buildPuzzle(path.join(FIX, 'mb-5.muddled.yaml'), hashedPath);

  rebusPath       = path.join(tmpDir, 'rebus.html');
  rebusHashedPath = path.join(tmpDir, 'rebus-hashed.html');
  buildPuzzle(path.join(FIX, 'rebus-5.yaml'),         rebusPath);
  buildPuzzle(path.join(FIX, 'rebus-5.muddled.yaml'), rebusHashedPath);
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
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

test('a clue with markdown formatting renders as HTML, not literal syntax', async ({ page }) => {
  // Smoke check that the shared clue-rendering wiring (processEntries ->
  // PUZZLE_DATA -> engine's innerHTML assignment) also reaches Marching
  // Bands' own clue-list code, not just Crushword's — the markdown parsing
  // itself is exhaustively unit-tested in shared/test/renderMarkdown.test.js;
  // e2e/crushword.spec.js has the full formatting-coverage version of this.
  // Reuses mb-5.yaml's exact cell-consistent row/band content (row/band cell
  // agreement is a build-time validation error, not just a warning, so this
  // is far more reliable than hand-authoring a new small grid) with only the
  // first clue's text changed.
  const source = yaml.load(fs.readFileSync(path.join(FIX, 'mb-5.yaml'), 'utf8'));
  source.rows[0].entries[0].clue = '**Bold** clue';
  const yamlPath = path.join(tmpDir, 'markdown-smoke.yaml');
  const htmlPath = path.join(tmpDir, 'markdown-smoke.html');
  fs.writeFileSync(yamlPath, yaml.dump(source));
  buildPuzzle(yamlPath, htmlPath);

  await page.goto('file://' + htmlPath);
  await expect(page.locator('#puzzle-svg .cell').first()).toBeVisible();

  const clueHtml = await page.locator('#rows-clues .clue-item .clue-text').first().innerHTML();
  assert.match(clueHtml, /<strong>Bold<\/strong> clue/);
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

test('the options menu panel does not resize when Clear arms to "Are you sure?"', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#clear-btn')).toHaveText('Clear Puzzle');
  const before = await page.locator('#menu-panel').boundingBox();

  // #clear-btn::after (base.css) reserves the wider of "Clear Puzzle"/"Are you
  // sure?" so #menu-panel's shrink-to-fit width doesn't change across the
  // arm/confirm cycle — without it, the panel visibly narrows and shifts while armed.
  await page.click('#clear-btn');
  await expect(page.locator('#clear-btn')).toHaveText('Are you sure?');
  const after = await page.locator('#menu-panel').boundingBox();

  expect(after).toEqual(before);
});

test('the "Show Check Cell button" toggle hides #check-btn and persists across reload', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#check-btn-toggle-label')).toBeVisible();
  await expect(page.locator('#check-btn-toggle')).toBeChecked();
  await expect(page.locator('#check-btn')).toBeVisible();

  await page.click('#check-btn-toggle');
  await expect(page.locator('#check-btn')).toBeHidden();

  await page.reload();
  await ready(page);
  await page.click('#menu-btn');
  await expect(page.locator('#check-btn-toggle')).not.toBeChecked();
  await expect(page.locator('#check-btn')).toBeHidden();
});

test('the "Show Check Cell button" toggle is absent in a hashed puzzle', async ({ page }) => {
  await page.goto(`file://${hashedPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#check-btn-toggle-label')).toBeHidden();
  await expect(page.locator('#check-btn')).toBeHidden();
});

test('Clear Puzzle does not reset the Check Cell button visibility preference', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await page.click('#check-btn-toggle');
  await expect(page.locator('#check-btn')).toBeHidden();

  await page.click('#clear-btn');
  await page.click('#clear-btn'); // second click confirms
  await expect(page.locator('#check-btn')).toBeHidden();
  await expect(page.locator('#check-btn-toggle')).not.toBeChecked();
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

// Not the clue-restore test its Snake Charmer / Spiral siblings are: MB marks no clue
// items, so checker.repaintIfSolved() is a genuine no-op here. It covers the other half —
// the latch.solved keydown guard, which MB carries identically and which the structural
// safety argument in docs/CROSS_TOOL_SPEC.md → Answer checking relies on in all three
// engines. Without this, MB was the one engine where that guard had no post-reload
// coverage.
test('a solved board restores sealed — Enter cannot open composition', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const correct = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const ch of correct) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  await page.reload();
  await ready(page);

  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(correct.length);
  await expect(page.locator('#congrats-dialog')).toBeHidden();

  // Post-reload the latch is sealed by sealIfSolved() on a page that never opened a
  // dialog, so key injection is unimpaired here — unlike the post-Escape point in
  // 'board is locked after solve', where root CLAUDE.md warns it is unreliable.
  await page.keyboard.press('Enter');
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);

  // #rebus-btn reaches composition without going through setupKeydown at all, so the
  // latch.solved argument above does not cover it — setupRebusButton carries its own
  // guard. Removing that guard must turn this red.
  await page.locator('#rebus-btn').click();
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);
});

test('the rebus button opens and commits composition without a keydown', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Cell 2 holds the two-letter group; step right once from cell 1.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
  await page.locator('#rebus-btn').click();
  await expect(page.locator('#cell-2')).toHaveClass(/composing/);
  await expect(page.locator('#rebus-btn')).toHaveText('Done');

  // Letters must still reach the composing cell: the click preserves hidden-input focus.
  for (const ch of ['B', 'B']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-2')).toHaveText('BB');

  await page.locator('#rebus-btn').click();
  await expect(page.locator('#cell-2')).not.toHaveClass(/composing/);
  await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);   // commit doesn't advance
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

// Row-major cell contents for marching-bands/test/fixtures/rebus-5.yaml, centre
// (cell 13) omitted — the same order the engine's getSolution() walks.
const REBUS_CELLS = [
  'A', 'BB', 'C', 'D', 'E',
  'F', 'G', 'H', 'III', 'J',
  'K', 'L',        'M', 'N',
  'O', 'PPPP', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X',
];

test('Enter opens a multi-letter cell; a second Enter commits without advancing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Cell 2 holds the two-letter group; step right once from cell 1.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-2')).toHaveClass(/composing/);

  for (const ch of ['B', 'B']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-2')).toHaveText('BB');
  await expect(page.locator('#letter-2')).toHaveClass(/len-2/);
  // Capacity must never auto-advance.
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);

  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-2')).not.toHaveClass(/composing/);
  // Committing no longer advances either: the cursor stays on the cell.
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
});

test('a four-letter cell renders with the len-long class', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Cell 17 = row 4, col 2 — the four-letter group.
  await page.locator('#cell-17').click();
  await page.keyboard.press('Enter');
  for (const ch of ['P', 'P', 'P', 'P']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-17')).toHaveText('PPPP');
  await expect(page.locator('#letter-17')).toHaveClass(/len-long/);
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

  // Final cell (25, single-letter 'X') entered as a rebus and left uncommitted: every
  // cell now holds correct content, but the board must not read as solved.
  await page.keyboard.press('Enter');
  await page.locator('#hidden-input').fill('X');

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

test('a non-hashed rebus puzzle marks every cell correct on solve, but no clue item', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  for (const cell of REBUS_CELLS) await typeCell(page, cell);

  await expect(page.locator('#congrats')).toBeVisible();
  // 24 filled cells (rebus-5.yaml, 5x5 minus the null center) — non-hashed mode must
  // mark them .correct just like hashed mode does, per the levelled-up completion behavior.
  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(24);
  // 15 clue items total (10 row entries + 5 band entries, rebus-5.yaml) render in the
  // DOM regardless of active mode — anchors the negative assertion below so it can't
  // pass vacuously against an empty clue list.
  await expect(page.locator('.clue-item')).toHaveCount(15);
  // Marching Bands never marks clue items correct, in either mode: its clue groups
  // intentionally hide entry boundaries, and marking them would spoil the puzzle.
  await expect(page.locator('.clue-item.correct')).toHaveCount(0);
});

