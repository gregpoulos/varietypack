'use strict';

// Browser engine behavior for Snake Charmer — the part node:test cannot cover. Covers:
// state-derived banners + hidden partial correctness; Tab entry navigation (wrapping,
// Shift+Tab); Backspace's filled-vs-empty semantics; the hashed-mode per-keystroke
// cursor-advance invariant; the print-media reset of .correct cell fills; the options
// menu panel's own position/Check-Cell-toggle geometry; board-lock after solve; rebus
// composing (Enter open/commit, arrowing-away commit, Backspace-while-composing,
// suppressed completion mid-compose, autosave-restore-while-composing, commit-by-
// cursor-move completion, non-hashed rebus scoring, and — WebKit-only — tapping
// #rebus-btn); and solved-board clue-item restore.
//
// Note: Snake Charmer cell/letter ids are 0-indexed (cell-0 is the first ring cell),
// unlike Spiral and Marching Bands.
//
// Behavior Snake Charmer shares byte-for-byte with one or more of the other engines —
// keyboard-shortcuts modal, options menu open/close/focus, congrats/Play-again,
// completion-event payload, Check Cell localStorage writes, rebus-button label
// resync, rebus-button presence, and hashed-rebus preimage — lives in
// e2e/shared.spec.js instead.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../snake-charmer/src/builder');
const { typeCell } = require('./helpers');

const FIX = path.join(__dirname, '..', 'snake-charmer', 'test', 'fixtures');

let htmlPath;     // non-hashed → PUZZLE_DATA.letters present (one char per ring position)
let hashedPath;   // hashed     → no letters; correctness via boardHash
let rebusPath;        // non-hashed rebus fixture
let rebusHashedPath;  // hashed rebus fixture
let tmpDir;       // unique temp directory per worker

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  hashedPath = path.join(tmpDir, 'puzzle-hashed.html');
  buildPuzzle(path.join(FIX, 'circle-8.yaml'),         htmlPath);
  buildPuzzle(path.join(FIX, 'circle-8.muddled.yaml'), hashedPath);
  rebusPath       = path.join(tmpDir, 'rebus.html');
  rebusHashedPath = path.join(tmpDir, 'rebus-hashed.html');
  buildPuzzle(path.join(FIX, 'rebus-8.yaml'),         rebusPath);
  buildPuzzle(path.join(FIX, 'rebus-8.muddled.yaml'), rebusHashedPath);
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
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

test('the menu button sits within the active-clue bar, vertically centered against its height', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
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

test('the options menu panel opens below the menu button, not over it', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#menu-panel')).toBeVisible();
  const [btn, panel] = await Promise.all([
    page.locator('#menu-btn').boundingBox(),
    page.locator('#menu-panel').boundingBox(),
  ]);
  // #menu-btn sits below #active-clue-bar in this tool (see the test above), which
  // base.css's plain #menu-panel top:60px has no way to track — without the JS fix,
  // the panel opens overlapping the button, hiding the only control that closes it.
  expect(panel.y).toBeGreaterThanOrEqual(btn.y + btn.height);

  // And #menu-btn must still be clickable to close the menu — the actual symptom
  // a naive geometry check alone wouldn't catch, since it wouldn't know the panel
  // being merely adjacent-but-not-overlapping is what makes the click land on it.
  await page.click('#menu-btn');
  await expect(page.locator('#menu-panel')).toBeHidden();
});

test('hiding the Check Cell button does not move the ring', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  // #check-btn is deliberately styled taller than its #controls siblings ("Primary
  // button", theme-components.css) — hiding it would otherwise shrink #controls'
  // own height and shift #ring-wrap's column, moving the ring, unless that height
  // is reserved first.
  const before = await page.locator('#ring-svg').boundingBox();
  await page.click('#menu-btn');
  await page.click('#check-btn-toggle');
  const after = await page.locator('#ring-svg').boundingBox();

  expect(after).toEqual(before);
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

// Ring cells in traversal order for snake-charmer/test/fixtures/rebus-8.yaml.
const REBUS_CELLS = ['A', 'BB', 'C', 'DDD', 'E', 'F', 'GGGG', 'H'];

test('Enter opens a multi-letter cell; a second Enter commits without advancing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-0')).toHaveClass(/composing/);

  for (const ch of ['B', 'B']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-0')).toHaveText('BB');
  await expect(page.locator('#letter-0')).toHaveClass(/len-2/);
  // Capacity must never auto-advance: still on cell 0 after filling it.
  await expect(page.locator('#cell-0')).toHaveClass(/active-cell/);

  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-0')).not.toHaveClass(/composing/);
  // Committing no longer advances either: the cursor stays on the cell.
  await expect(page.locator('#cell-0')).toHaveClass(/active-cell/);
});

test('arrowing away from a composing cell commits it', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('Enter');
  await page.locator('#hidden-input').fill('B');
  await page.locator('#hidden-input').fill('B');
  await page.keyboard.press('ArrowRight');

  await expect(page.locator('#cell-0')).not.toHaveClass(/composing/);
  await expect(page.locator('#letter-0')).toHaveText('BB');
});

test('Backspace deletes one letter at a time while composing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('Enter');
  for (const ch of ['D', 'D', 'D']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-0')).toHaveText('DDD');
  await expect(page.locator('#letter-0')).toHaveClass(/len-3/);

  await page.keyboard.press('Backspace');
  await expect(page.locator('#letter-0')).toHaveText('DD');
  await expect(page.locator('#letter-0')).toHaveClass(/len-2/);
});

test('a half-composed cell restores from autosave still composing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Compose without committing, then reload. Autosave fires at every mutation site
  // including mid-composition, and on mobile also on every app switch and screen lock
  // (setupTimer's visibility listener), so this is the common case there, not an edge.
  await page.keyboard.press('Enter');
  for (const ch of ['B', 'B']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#cell-0')).toHaveClass(/composing/);

  await page.reload();
  await ready(page);

  // If the first assertion fails with an empty cell, suspect localStorage being blocked
  // for file:// origins in this Chromium build before suspecting the engine — no other
  // e2e in this repo exercises autosave, so this is untested ground. Serve tmpDir over
  // http and re-run to tell the two apart. The test cannot pass vacuously either way:
  // a no-op localStorage fails here rather than silently succeeding.
  await expect(page.locator('#letter-0')).toHaveText('BB');
  await expect(page.locator('#letter-0')).toHaveClass(/len-2/);

  // The composing id is part of the saved board. Committing it on restore would hand the
  // solver a cell they never submitted — filled, counting toward isBoardFilled, and
  // adjudicable as wrong. The cursor resumes on it, and the button agrees.
  await expect(page.locator('#cell-0')).toHaveClass(/composing/);
  await expect(page.locator('#cell-0')).toHaveClass(/active-cell/);
  await expect(page.locator('#rebus-btn')).toHaveText('Done');

  // Still composing means still not filled: typing appends rather than replacing.
  await page.locator('#hidden-input').fill('C');
  await expect(page.locator('#letter-0')).toHaveText('BBC');
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

  // The last cell is entered as a rebus, so the board passes through a state where every
  // cell holds correct content but the final one is still composing.
  for (let i = 0; i < REBUS_CELLS.length - 1; i++) await typeCell(page, REBUS_CELLS[i]);

  // Final cell, composed but deliberately left uncommitted.
  await page.keyboard.press('Enter');
  await page.locator('#hidden-input').fill('H');

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

test('a non-hashed rebus puzzle marks every cell and clue item correct on solve', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  for (const cell of REBUS_CELLS) await typeCell(page, cell);

  await expect(page.locator('#congrats')).toBeVisible();
  // 8 ring cells (rebus-8.yaml) — non-hashed mode must mark them .correct just like
  // hashed mode does, per the levelled-up completion behavior.
  await expect(page.locator('.cell.correct')).toHaveCount(8);
  // 5 entries (rebus-8.yaml) — previously only the hashed path marked clue items.
  await expect(page.locator('.clue-item.correct')).toHaveCount(5);
});

// The auto-save payload records cell correctness only, so a solved board used to come
// back with green cells and unmarked clue items. checker.repaintIfSolved() re-derives
// the rest of the solved painting at restore time.
// Uses the rebus fixture because it is the non-hashed Snake Charmer fixture carrying
// both a title and a date — storageKey() returns null without them, so circle-8.yaml
// has no auto-save to restore from.
test('a solved board restores with its clue items still marked correct', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  for (const cell of REBUS_CELLS) await typeCell(page, cell);
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  const clueCount = await page.locator('.clue-item').count();
  await expect(page.locator('.clue-item.correct')).toHaveCount(clueCount);

  await page.reload();
  await ready(page);

  await expect(page.locator('.cell.correct')).toHaveCount(REBUS_CELLS.length);
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
  // the latch is sealed by sealIfSolved(), so CDP key injection is unimpaired. The
  // 'Enter opens a multi-letter cell' test above is the control: same fixture, same
  // ready() focus path, Enter does open composition when the board is not solved.
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

  await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
  await page.locator('#rebus-btn').click();
  await expect(page.locator('.cell.composing')).toHaveCount(1);
  await expect(page.locator('#rebus-btn')).toHaveText('Done');

  // Letters must still reach the composing cell: the click preserves hidden-input focus.
  for (const ch of 'HAR') await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-0')).toHaveText('HAR');

  await page.locator('#rebus-btn').click();
  await expect(page.locator('.cell.composing')).toHaveCount(0);
  await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
  expect(await activeCellNum(page)).toBe(0);   // commit doesn't move the cursor, matching Enter
});

// The regression that a Chromium-only suite could not see. #rebus-btn preserves focus by
// cancelling mousedown; cancelling pointerdown instead leaves the button inert on a
// WebKit touch tap, because WebKit suppresses the click and Chromium does not. This must
// tap() — click() activates the button under either binding, in both engines — and it
// earns its keep only under the webkit project (see playwright.config.js).
test.describe('touch input', () => {
  test.use({ hasTouch: true });

  test('tapping the rebus button opens composition and keeps the keyboard focus', async ({ page }) => {
    await page.goto('file://' + rebusPath);
    await ready(page);

    await page.locator('#rebus-btn').tap();
    await expect(page.locator('.cell.composing')).toHaveCount(1);
    await expect(page.locator('#rebus-btn')).toHaveText('Done');
    // Focus must not have moved to the button, or the soft keyboard would close.
    expect(await page.evaluate(() => document.activeElement.id)).toBe('hidden-input');

    await page.locator('#hidden-input').fill('H');
    await page.locator('#hidden-input').fill('A');
    await expect(page.locator('#letter-0')).toHaveText('HA');

    await page.locator('#rebus-btn').tap();
    await expect(page.locator('.cell.composing')).toHaveCount(0);
  });
});

test('composing the final cell and moving the cursor instead of pressing Enter still completes the board', async ({ page }) => {
  // Completion can fire from inside focusCell's commitIfMoved → commit → onCommit →
  // checkIfFilled chain, not only from the explicit Enter-commits path.
  // Every other completion e2e finishes via typeCell(), which always commits with
  // Enter — this is the only test that commits the winning cell by moving the cursor.
  await page.goto('file://' + rebusHashedPath);
  await ready(page);

  const events = [];
  await page.exposeFunction('__vpComplete', d => events.push(d));
  await page.evaluate(() => {
    document.querySelector('.puzzle-main')
      .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
  });

  for (let i = 0; i < REBUS_CELLS.length - 1; i++) await typeCell(page, REBUS_CELLS[i]);

  // Compose the final cell manually and commit it by moving the cursor — no second Enter.
  const lastCell = REBUS_CELLS[REBUS_CELLS.length - 1];
  await page.keyboard.press('Enter');
  for (const ch of lastCell) await page.locator('#hidden-input').fill(ch);
  await page.keyboard.press('ArrowRight');

  // Confirm ArrowRight actually moved off the composing cell (wrapped to ring position 0)
  // rather than clamping in place — a same-cell focus would make commitIfMoved a no-op
  // and any completion below would be coincidental, not evidence of the commit-by-move path.
  expect(await activeCellNum(page)).not.toBe(REBUS_CELLS.length - 1);

  await expect(page.locator('#congrats-dialog')).toHaveJSProperty('open', true);
  await expect.poll(() => events.length).toBe(1);
});


// The clue bar and the secondary-entry highlight are re-derived from the cursor on
// every syncUI(), not painted once on focus — both must stay in step with the active
// clue as the cursor moves, including after a keystroke (which syncs without a focus
// change). Asserted against PUZZLE_DATA rather than fixture-specific cell numbers.
test('the clue bar and secondary-entry highlight track the active cell', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  async function shown() {
    return page.evaluate(() => {
      const items = [...document.querySelectorAll('#clues .clue-item')];
      return {
        activeIdx:       items.findIndex(li => li.classList.contains('active-clue')),
        secondaryIdx:    items.findIndex(li => li.classList.contains('secondary-entry')),
        activeCount:     items.filter(li => li.classList.contains('active-clue')).length,
        secondaryCount:  items.filter(li => li.classList.contains('secondary-entry')).length,
        barNum:          document.querySelector('#active-clue-primary .active-clue-num').textContent,
        barText:         document.querySelector('#active-clue-primary .active-clue-text').innerHTML,
        barSecondaryNum: document.querySelector('#active-clue-secondary .active-clue-num').textContent,
        entryCells:      document.querySelectorAll('.cell.active-entry').length,
        secondaryCells:  document.querySelectorAll('.cell.secondary-entry').length,
        bothClasses:     document.querySelectorAll('.cell.active-entry.secondary-entry').length,
        lengths:         window.PUZZLE_DATA.entries.map(e => e.length),
        clues:           window.PUZZLE_DATA.entries.map(e => e.clue),
      };
    });
  }

  async function check(where) {
    const s = await shown();
    expect(s.activeCount, `${where}: exactly one active clue`).toBe(1);
    expect(s.secondaryCount, `${where}: at most one secondary clue`).toBeLessThanOrEqual(1);
    expect(s.barNum, `${where}: bar number names the active clue`).toBe(`${s.activeIdx + 1}.`);
    expect(s.barText, `${where}: bar text is the active clue`).toBe(s.clues[s.activeIdx]);
    // Every cell of the entry carries .active-entry, the active one included (it also
    // carries .active-cell, which the theme paints on top).
    expect(s.entryCells, `${where}: active entry highlighted`).toBe(s.lengths[s.activeIdx]);
    if (s.secondaryIdx >= 0) {
      // The two entries share a run of cells; a shared cell highlights as the active
      // entry only, so the secondary run is non-empty but never longer than its entry.
      expect(s.secondaryCells, `${where}: secondary entry highlighted`).toBeGreaterThan(0);
      expect(s.secondaryCells, `${where}: secondary run within its entry`)
        .toBeLessThanOrEqual(s.lengths[s.secondaryIdx]);
      expect(s.bothClasses, `${where}: no cell is both active and secondary`).toBe(0);
      expect(s.barSecondaryNum, `${where}: bar names the secondary clue`).toBe(`${s.secondaryIdx + 1}.`);
    }
  }

  await page.locator('#cell-0').click();
  await check('at cell 0');

  await page.keyboard.press('ArrowRight');
  await check('after ArrowRight');

  await page.keyboard.press('Tab');
  await check('after Tab');

  // A keystroke syncs without moving focus — the bar must not go stale.
  await page.locator('#hidden-input').fill('A');
  await check('after typing');
});
