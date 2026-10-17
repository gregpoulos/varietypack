'use strict';

// Browser-engine behavior specific to Snake Charmer — what node:test can't cover: the
// ring's own navigation and cross-loop highlighting, its menu/controls geometry, and the
// touch-tap path into composition (WebKit only). Behavior it shares with the other
// engines lives in e2e/shared.spec.js. Cell and letter ids here are 0-indexed (cell-0
// is the first ring cell), unlike Spiral and Marching Bands.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../snake-charmer/cli');
const { typeCell } = require('./helpers');

const FIX = path.join(__dirname, '..', 'snake-charmer', 'test', 'fixtures');

let htmlPath;     // non-hashed → PUZZLE_DATA.letters present (one char per ring position)
let rebusPath;        // non-hashed rebus fixture
let rebusHashedPath;  // hashed rebus fixture
let tmpDir;       // unique temp directory per worker

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  buildPuzzle(path.join(FIX, 'circle-8.yaml'),         htmlPath);
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

test('the options menu panel opens below the menu button, not over it', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#menu-panel')).toBeVisible();
  const [btn, panel] = await Promise.all([
    page.locator('#menu-btn').boundingBox(),
    page.locator('#menu-panel').boundingBox(),
  ]);
  // A panel over the button would hide the only control that closes it. In this tool
  // the button sits inside #active-clue-bar (see the test above), and both it and the
  // panel are positioned against --active-clue-bar-space (theme-components.css).
  expect(panel.y).toBeGreaterThanOrEqual(btn.y + btn.height);

  // And #menu-btn must still be clickable to close the menu — the actual symptom
  // a naive geometry check alone wouldn't catch, since it wouldn't know the panel
  // being merely adjacent-but-not-overlapping is what makes the click land on it.
  await page.click('#menu-btn');
  await expect(page.locator('#menu-panel')).toBeHidden();
});

// Ring cells in traversal order for snake-charmer/test/fixtures/rebus-8.yaml.
const REBUS_CELLS = ['A', 'BB', 'C', 'DDD', 'E', 'F', 'GGGG', 'H'];

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

// The auto-save payload records cell correctness only, so a solved board used to come
// back with green cells and unmarked clue items. checker.repaintIfSolved() re-derives
// the rest of the solved painting at restore time.
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

  // The composing exclusion that syncUI's latch.check() lacks (see
  // docs/CROSS_TOOL_SPEC.md → Answer checking): a solved board is safe only because
  // latch.solved makes every keydown handler return before the Enter branch that opens
  // composition. This is the one place it can be exercised on a page that never touched a
  // dialog — post-reload the latch is sealed by sealIfSolved(), so CDP key injection is
  // unimpaired. The control is '[snake-charmer] Enter opens a multi-letter cell' in
  // e2e/shared.spec.js: same fixture, and Enter does open composition when the board is
  // not solved.
  await page.keyboard.press('Enter');
  await expect(page.locator('.cell.composing')).toHaveCount(0);

  // #rebus-btn reaches composition without going through setupKeydown at all, so the
  // latch.solved argument above does not cover it — composer.toggle's own solved check
  // does. Removing that check must turn this red.
  await page.locator('#rebus-btn').click();
  await expect(page.locator('.cell.composing')).toHaveCount(0);
});

// The regression that a Chromium-only suite could not see. #rebus-btn preserves focus by
// canceling mousedown; canceling pointerdown instead leaves the button inert on a
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
  // and any completion below would be coincidental, not evidence of the commit-by-move
  // path.
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

// An entry may run longer than one loop (the validator allows it), so at some cells both
// loops belong to the same entry. There the cross-loop highlight has nothing to add: no
// secondary cells or clue, and the bar's second row is hidden without the bar resizing.
test('an entry longer than the ring is never shown as its own secondary', async ({ page }) => {
  const src = path.join(tmpDir, 'long-entry.yaml');
  fs.writeFileSync(src, [
    'kind: snake-charmer',
    'title: Long entry',
    'entries:',
    '  - { clue: "Ten cells", answer: ABCDEFGHAB }',   // ring 0-7, then 0-1 again
    '  - { clue: "Three cells", answer: CDE }',
    '  - { clue: "Three more", answer: FGH }',
  ].join('\n'));
  const out = path.join(tmpDir, 'long-entry.html');
  buildPuzzle(src, out);
  await page.goto(`file://${out}`);
  await ready(page);

  const row = page.locator('#active-clue-secondary');
  const barHeight = async () => (await page.locator('#active-clue-bar').boundingBox()).height;
  // cell-0, active at load: both loops are entry 1.
  await expect(page.locator('.cell.active-entry')).toHaveCount(8);
  await expect(page.locator('.cell.secondary-entry')).toHaveCount(0);
  await expect(page.locator('#clues .clue-item.secondary-entry')).toHaveCount(0);
  await expect(row).toBeHidden();
  const blankHeight = await barHeight();

  // cell-4: entry 1 in this loop, entry 2 in the other, so the row is back.
  await page.locator('#cell-4').click();
  await expect(row).toBeVisible();
  await expect(row.locator('.active-clue-num')).toHaveText('2.');
  expect(await barHeight()).toBe(blankHeight);

  // Back on cell-0 the row must hide again, not keep showing entry 2's clue.
  await page.locator('#cell-0').click();
  await expect(row).toBeHidden();
});
