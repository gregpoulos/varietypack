'use strict';

// Behaviors the engines share, each test body written once over a per-tool adapter table
// (TOOLS). A test loops over the tools only where each engine implements the behavior or
// wires it with arguments of its own; one that lives entirely in shared code runs on one
// tool (docs/TESTING.md → "An e2e loop over tools follows the code"). RING_TOOLS (spiral,
// snake-charmer, marching-bands) is for where Crushword differs — it has no rebus button
// (its cells compose on every keystroke) and different solve plumbing, so those copies
// stay in e2e/crushword.spec.js. Marching Bands marks no clue item .correct, so its
// rebus-solve test stays in its own spec.

const { test, expect } = require('@playwright/test');
const { buildPuzzleFile } = require('../test/helpers');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const {
  clickHelpRow, typeCell, solveCrushwordBoard, solveRingBoard, rewriteSaveOnNextLoad, buildVariant,
} = require('./helpers');
const { sha256hex } = require('../shared/sha256hex.mjs');

// ---- Per-tool adapters -----------------------------------------------------

const SPIRAL_REBUS_CELLS = [
  'A', 'B', 'C', 'D', 'EE', 'F', 'G', 'H', 'I', 'J',
  'K', 'LLL', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
  'U', 'V', 'W', 'X', 'YYYY', 'Z', 'A', 'B', 'C', 'D',
  'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N',
];
const SNAKE_CHARMER_REBUS_CELLS = ['A', 'BB', 'C', 'DDD', 'E', 'F', 'GGGG', 'H'];
const MARCHING_BANDS_REBUS_CELLS = [
  'A', 'BB', 'C', 'D', 'E',
  'F', 'G', 'H', 'III', 'J',
  'K', 'L',        'M', 'N',
  'O', 'PPPP', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X',
];

const TOOLS = [
  {
    name: 'spiral',
    kind: 'spiral',
    boardSelector: '#spiral-svg', // the board SVG, which carries .solved
    ring: true,
    fixDir: path.join(__dirname, '..', 'spiral', 'test', 'fixtures'),
    plainFixture: 'test-78.yaml',
    hashedFixture: 'test-78.muddled.yaml',
    rebusFixture: 'rebus-40.yaml',
    rebusHashedFixture: 'rebus-40.muddled.yaml',
    firstCellId: 'cell-1',
    firstLetterId: 'letter-1',
    readySelector: '.cell',
    commitAfterFirstFill: false,
    solveBoard: solveRingBoard,
    REBUS_CELLS: SPIRAL_REBUS_CELLS,
    // A cell to mark correct, its index into PUZZLE_DATA.letters, and another cell
    // sharing its entry/row/band — see the correct-cell highlight test at the bottom.
    // Cell number of the first cell in typing order (the rest follow consecutively),
    // and a cell to compose in with the ArrowRights that reach it from the start.
    firstCellNum: 1, rebusTwo: { cellNum: 5, arrowsRight: 4 },
    // Cells the non-hashed rebus fixture marks, and clue items it marks .correct, on
    // solve.
    rebusCorrectCells: 40, rebusCorrectClueItems: 16, rebusClueItems: 16,
    cluesMarkCorrect: true, hasRebusButton: true,
    markCellId: 'cell-1', markLetterIndex: 0, sameEntryCellId: 'cell-2',
  },
  {
    name: 'snake-charmer',
    kind: 'snake-charmer',
    boardSelector: '#ring-svg', // the board SVG, which carries .solved
    ring: true,
    fixDir: path.join(__dirname, '..', 'snake-charmer', 'test', 'fixtures'),
    plainFixture: 'circle-8.yaml',
    hashedFixture: 'circle-8.muddled.yaml',
    rebusFixture: 'rebus-8.yaml',
    rebusHashedFixture: 'rebus-8.muddled.yaml',
    firstCellId: 'cell-0',
    firstLetterId: 'letter-0',
    readySelector: '.cell',
    commitAfterFirstFill: false,
    solveBoard: solveRingBoard,
    REBUS_CELLS: SNAKE_CHARMER_REBUS_CELLS,
    firstCellNum: 0, rebusTwo: { cellNum: 0, arrowsRight: 0 },
    rebusCorrectCells: 8, rebusCorrectClueItems: 5, rebusClueItems: 5,
    cluesMarkCorrect: true, hasRebusButton: true,
    markCellId: 'cell-0', markLetterIndex: 0, sameEntryCellId: 'cell-1',
  },
  {
    name: 'marching-bands',
    kind: 'marching-bands',
    boardSelector: '#puzzle-svg', // the board SVG, which carries .solved
    ring: true,
    fixDir: path.join(__dirname, '..', 'marching-bands', 'test', 'fixtures'),
    plainFixture: 'mb-5.yaml',
    hashedFixture: 'mb-5.muddled.yaml',
    rebusFixture: 'rebus-5.yaml',
    rebusHashedFixture: 'rebus-5.muddled.yaml',
    firstCellId: 'cell-1',
    firstLetterId: 'letter-1',
    readySelector: '#puzzle-svg .cell',
    commitAfterFirstFill: false,
    solveBoard: solveRingBoard,
    REBUS_CELLS: MARCHING_BANDS_REBUS_CELLS,
    firstCellNum: 1, rebusTwo: { cellNum: 2, arrowsRight: 1 },
    // Marching Bands marks no clue item .correct: its clue groups hide entry boundaries,
    // and marking them would spoil the puzzle.
    rebusCorrectClueItems: 0, rebusClueItems: 15, cluesMarkCorrect: false, hasRebusButton: true,
    markCellId: 'cell-1', markLetterIndex: 0, sameEntryCellId: 'cell-2',
  },
  {
    name: 'crushword',
    kind: 'crushword',
    boardSelector: '#puzzle-svg', // the board SVG, which carries .solved
    ring: false,
    fixDir: path.join(__dirname, '..', 'crushword', 'test', 'fixtures'),
    plainFixture: 'cw-9.yaml',
    hashedFixture: 'cw-9.muddled.yaml',
    rebusFixture: 'cw-rebus-5.yaml',
    rebusHashedFixture: 'cw-rebus-5.muddled.yaml',
    firstCellId: 'cell-1',
    firstLetterId: 'letter-1',
    readySelector: '#puzzle-svg .cell',
    commitAfterFirstFill: true, // Crushword only auto-advances at maxCellLetters; a
                                 // single-letter guess needs an explicit Enter to commit.
    solveBoard: solveCrushwordBoard,
    cluesMarkCorrect: true, hasRebusButton: false,   // typing composes a rebus cell directly
    // cw-9's first open cell has no across entry (its row run is length 1), so the
    // engine auto-flips to down and cell-11 is the next cell of that same down entry.
    markCellId: 'cell-2', markLetterIndex: 1, sameEntryCellId: 'cell-11',
  },
];

const ALL_TOOLS  = TOOLS;
const RING_TOOLS = TOOLS.filter(t => t.ring);

test.beforeAll(() => {
  for (const tool of TOOLS) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `shared-${tool.name.slice(0, 4)}-`));
    tool.tmpDir = tmpDir;
    tool.paths = {
      plain:  path.join(tmpDir, 'plain.html'),
      hashed: path.join(tmpDir, 'hashed.html'),
      rebus:  path.join(tmpDir, 'rebus.html'),
    };
    buildPuzzleFile(path.join(tool.fixDir, tool.plainFixture),  tool.paths.plain);
    buildPuzzleFile(path.join(tool.fixDir, tool.hashedFixture), tool.paths.hashed);
    buildPuzzleFile(path.join(tool.fixDir, tool.rebusFixture),  tool.paths.rebus);
    if (tool.ring) {
      tool.paths.rebusHashed = path.join(tmpDir, 'rebus-hashed.html');
      buildPuzzleFile(path.join(tool.fixDir, tool.rebusHashedFixture), tool.paths.rebusHashed);
    }
  }
});

test.afterAll(() => {
  for (const tool of TOOLS) {
    if (tool.tmpDir) fs.rmSync(tool.tmpDir, { recursive: true, force: true });
  }
});

async function ready(tool, page) {
  await expect(page.locator(tool.readySelector).first()).toBeVisible();
  await page.evaluate(() => document.getElementById('hidden-input').focus());
}

// Moves the cursor to `locator` unless it is already there (a click on the active cell
// would switch direction, mode or loop instead).
async function activateCell(page, locator) {
  if (!/\bactive-cell\b/.test(await locator.getAttribute('class'))) await locator.click();
}

// ---- A: keys modal (button, ? key, Esc, backdrop click) — one tool --------------------
// All of it is setupKeysOverlay (shared/engine-chrome.mjs), so one tool covers it:
// Crushword, since section C below opens and closes the modal in each of the other three.

{
  const tool = TOOLS.find(t => t.name === 'crushword');
  test(`[${tool.name}] ? button and ? key open keyboard-shortcuts modal; Esc closes it`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const overlay = page.locator('#keys-overlay');
    await expect(overlay).toBeHidden();

    await page.click('#keys-btn');
    await expect(overlay).toBeVisible();
    await expect(page.locator('#keys-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();

    await page.keyboard.press('?');
    await expect(overlay).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(overlay).toBeHidden();
  });
}

// ---- B: Tab trapped by the modal — one tool -------------------------------------------
// The native <dialog>'s own behavior, the same element in every tool, so one tool covers
// it.

{
  const tool = RING_TOOLS[0];
  test(`[${tool.name}] the open shortcuts modal keeps Tab focus off the grid input (native dialog)`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.click('#keys-btn');
    await expect(page.locator('#keys-overlay')).toBeVisible();

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const onInput = await page.evaluate(() => document.activeElement.id === 'hidden-input');
      expect(onInput, `focus must not reach the grid input after Tab #${i + 1}`).toBe(false);
    }
  });
}

// ---- C: keystrokes suppressed while the modal is open — ring tools --------------------

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] keystrokes are suppressed while the shortcuts modal is open`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const firstCell = page.locator('#' + tool.firstLetterId);
    await expect(firstCell).toHaveText('');

    await page.click('#keys-btn');
    await expect(page.locator('#keys-overlay')).toBeVisible();
    await page.keyboard.type('A');
    await expect(firstCell).toHaveText('');

    await page.keyboard.press('Escape');
    await expect(page.locator('#keys-overlay')).toBeHidden();
    await page.keyboard.type('A');
    await expect(firstCell).toHaveText('A');
  });
}

// ---- E: Copy result — one tool --------------------------------------------------------
// Copy result: the dialog is shared code (setupCongratsDialog), so one tool covers it.
// navigator.clipboard exists only in secure contexts, so a page on plain http:// has
// none; the button must say so rather than claim a copy that never happened.
{
  const tool = RING_TOOLS[0];
  const solveAndCopy = async (page, clipboard) => {
    await page.addInitScript(fake => {
      const value = fake && { writeText: t => { window.__copied = t; return Promise.resolve(); } };
      Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
    }, clipboard);
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await tool.solveBoard(page);
    await page.locator('#congrats-copy-btn').click();
  };

  test(`[${tool.name}] Copy result says Copied! once the result is on the clipboard`, async ({ page }) => {
    await solveAndCopy(page, true);
    await expect(page.locator('#congrats-copy-btn')).toHaveText('Copied!');
    expect(await page.evaluate(() => window.__copied)).toMatch(/Solved in \d+:\d{2}$/);
  });

  test(`[${tool.name}] Copy result says it couldn't copy when there is no clipboard`, async ({ page }) => {
    await solveAndCopy(page, false);
    await expect(page.locator('#congrats-copy-btn')).toHaveText("Couldn't copy");
  });
}

// ---- F: byline — one tool -------------------------------------------------------------
// The byline is shared code (renderByline), so one tool covers it. An empty byline would
// still add its margin under the title, so a puzzle with no author or date hides it.
{
  const tool = RING_TOOLS[0];

  test(`[${tool.name}] the byline shows the author and date`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('.byline')).toBeVisible();
    await expect(page.locator('.byline')).toHaveText(/^by .+ · .+$/);
  });

  test(`[${tool.name}] a puzzle with no author or date hides the byline`, async ({ page }) => {
    const out = path.join(tool.tmpDir, 'no-byline.html');
    buildPuzzleFile(path.join(tool.fixDir, 'test-100.yaml'), out, {});
    await page.goto('file://' + out);
    await ready(tool, page);
    // Not toBeHidden(): an empty byline is already 0px tall, yet its margin still
    // takes space. display:none is what removes the margin too.
    await expect(page.locator('.byline')).toHaveCSS('display', 'none');
  });
}

// ---- G: narrowing the window — all four tools -----------------------------------------
// Nothing measured at load may pin a width the window can later shrink below (a window
// narrowed after load).
for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] narrowing the window never makes the page scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.setViewportSize({ width: 360, height: 740 });
    const { scrollWidth, innerWidth } = await page.evaluate(
      () => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
}

// ---- H: a letter typed after clicking outside the puzzle — all four tools -------------
// Clicking plain page content (the title, the instructions) moves focus to <body>. Keys
// still reach setupKeydown's document listener, but a letter arrives only as the hidden
// input's own input event, so it was silently lost until a navigation key refocused.
for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] a letter typed after clicking outside the puzzle lands in the active cell`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);   // the page firstCellId belongs to
    await ready(tool, page);
    await page.locator('#' + tool.firstCellId).click();
    await page.click('h1.title');
    await page.keyboard.type('Q');
    await expect(page.locator('#' + tool.firstLetterId)).toHaveText('Q');
  });
}

// ---- I: clicking the active cell again — ring tools -----------------------------------
// A second click on the active cell switches direction, mode or loop, as the period key
// does (docs/CROSS_TOOL_SPEC.md). Crushword has no toggle buttons to read the state
// from; e2e/crushword.spec.js covers its re-click through the clue columns.
for (const tool of RING_TOOLS) {
  test(`[${tool.name}] clicking the active cell again switches direction, mode or loop`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.sameEntryCellId);   // not active at load
    await cell.click();
    const before = await page.locator('.toggle-opt.active').textContent();
    await cell.click();
    await expect(page.locator('.toggle-opt.active')).not.toHaveText(before);
    await expect(cell).toHaveClass(/active-cell/);
  });
}

// ---- K: one solve, and everything it leaves behind — all four tools ------------------
// A single solve per tool asserts the completion payload, the congrats dialog, the
// board's painted state, the lock on editing keys, and that Tab still steps. Each part
// is a test.step; expect.soft only where later steps don't depend on the result, so one
// failure doesn't hide the rest. Solving a board is long under load, hence the timeout.
// The payload contract (kind, boardHash shape, solution hashes to it, timeMs, exactly one
// postMessage with solution stripped) is identical across the engines; the payload's
// title passthrough isn't a completion-event concern, and the postMessage repeats the
// event's own fields, so neither is asserted separately.

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] a solve fires one completion and locks the board; Tab still steps`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const textColor = () => page.locator('.clue-item .clue-text').first()
      .evaluate(el => getComputedStyle(el).color);
    const colorBefore = await textColor();

    await test.step('listen', async () => {
      await expect(page.locator('#congrats-dialog')).toBeHidden();
      await expect(page.locator(tool.boardSelector)).not.toHaveClass(/\bsolved\b/);
      await page.evaluate(() => {
        window.__vpEvents = [];
        window.__vpMsgs   = [];
        document.querySelector('.puzzle-main').addEventListener('varietypack:complete', e => {
          window.__vpEvents.push(JSON.parse(JSON.stringify(e.detail)));
        });
        window.addEventListener('message', e => {
          if (e.data?.type === 'varietypack:complete') window.__vpMsgs.push(e.data);
        });
        document.getElementById('hidden-input').focus();
      });
    });

    await test.step('solve', () => tool.solveBoard(page));

    await test.step('completion', async () => {
      await page.waitForFunction(() => window.__vpMsgs.length > 0);
      const [events, msgs] = await page.evaluate(() => [window.__vpEvents, window.__vpMsgs]);

      assert.strictEqual(events.length, 1, 'exactly one varietypack:complete event');
      const detail = events[0];
      assert.ok(typeof detail.boardHash === 'string' && detail.boardHash.length === 64, 'boardHash is 64-char hex');
      assert.strictEqual(detail.kind, tool.kind);
      assert.ok(typeof detail.timeMs === 'number' && detail.timeMs >= 0, 'timeMs is non-negative number');
      assert.ok(typeof detail.solution === 'string' && detail.solution.length > 0, 'solution is a non-empty string');

      const computedHash = sha256hex(detail.solution);
      assert.strictEqual(computedHash, detail.boardHash, 'sha256hex(solution) === boardHash');

      assert.strictEqual(msgs.length, 1, 'exactly one postMessage');
      assert.strictEqual(msgs[0].type, 'varietypack:complete');
      assert.strictEqual(msgs[0].solution, undefined, 'solution must be absent from postMessage');

      // A solve typed straight through used no help.
      assert.strictEqual(detail.checks, 0);
      assert.strictEqual(detail.reveals, 0);
      assert.strictEqual(msgs[0].checks, 0);
      assert.strictEqual(msgs[0].reveals, 0);
    });

    await test.step('dialog', async () => {
      await expect.soft(page.locator('#congrats-dialog')).toBeVisible();
      await expect.soft(page.locator('#congrats-time')).toBeVisible();
      expect.soft(await page.locator('#congrats-time').textContent()).toMatch(/^Solved in \d+:\d{2}$/);
      await expect.soft(page.locator('#congrats-copy-btn')).toBeVisible();
      await expect.soft(page.locator('#congrats-play-btn')).toBeVisible();
      // A button with no font rule of its own still takes the theme's (the page's, in
      // this theme) and not the browser's.
      const font = sel => page.locator(sel).evaluate(el => getComputedStyle(el).fontFamily);
      expect.soft(await font('#congrats-play-btn')).toBe(await font('body'));
    });

    await test.step('board', async () => {
      await expect.soft(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);
      await expect.soft(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(0);
      await expect.soft(page.locator('#check-btn')).toBeDisabled();
      // Marching Bands marks no clue item; the others mark every one correct and filled.
      const total = await page.locator('.clue-item').count();
      expect.soft(total).toBeGreaterThan(0);   // so a 0 below can't pass against an empty list
      const marked = tool.cluesMarkCorrect ? total : 0;
      await expect.soft(page.locator('.clue-item.correct')).toHaveCount(marked);
      await expect.soft(page.locator('.clue-item.filled')).toHaveCount(marked);
      // Solving never restyles a clue's text.
      expect.soft(await textColor()).toBe(colorBefore);
      for (const text of await page.locator('.clue-item .clue-text').all()) {
        await expect.soft(text).toHaveCSS('text-decoration-line', 'none');
      }
    });

    await test.step('locked', async () => {
      // Close the dialog without Play again, so the board stays solved.
      await page.keyboard.press('Escape');
      await expect(page.locator('#congrats-dialog')).toBeHidden();

      // Two separate guards: typing is refused by the input handler's latch.solved check,
      // Backspace by the keydown handler's. Removing either one turns this red on its
      // own.
      const before = await page.locator('.cell-letter').allTextContents();
      await page.keyboard.type('ZZZZZ');
      await page.keyboard.press('Backspace');
      expect(await page.locator('.cell-letter').allTextContents()).toEqual(before);
    });

    await test.step('navigation', async () => {
      // Keys that edit are ignored once solved; Tab and Shift+Tab only move the cursor,
      // so they still step through the clues after View puzzle.
      const start = await activeCellNum(tool, page);
      await page.keyboard.press('Tab');
      const next = await activeCellNum(tool, page);
      expect(next).not.toBe(start);
      // Back lands on the first cell of the entry Tab left (not necessarily `start`), so
      // a second Tab returns to where the first one went.
      await page.keyboard.press('Shift+Tab');
      expect(await activeCellNum(tool, page)).not.toBe(next);
      await page.keyboard.press('Tab');
      expect(await activeCellNum(tool, page)).toBe(next);
    });
  });
}

// ---- J: Play again resets the board — all four tools ----------------------------------
// Play again and Clear share clearBoard (resetAndRefocus). The solve here is Reveal
// puzzle, so the help counts are non-zero for Play again to zero.

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] Play again resets the board, clears .solved and the help counts, and takes input`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#help-btn').click();
    await page.locator('#reveal-puzzle-btn').click(); // arms
    await page.locator('#reveal-puzzle-btn').click(); // confirms
    await expect(page.locator('#congrats-dialog')).toBeVisible();
    await expect(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);

    await page.click('#congrats-play-btn');
    await expect(page.locator('#congrats-dialog')).toBeHidden();
    await expect(page.locator(tool.boardSelector)).not.toHaveClass(/\bsolved\b/);

    const afterReset = await page.locator('.cell-letter').allTextContents();
    expect(afterReset.every(t => t === '')).toBe(true);

    await expect(page.locator('#hidden-input')).toBeFocused();
    // fill() rather than keyboard.type(): after clicking a button inside a
    // showModal() dialog, Playwright's synthetic key dispatch doesn't fire input
    // events on background elements even though focus is correct. fill() uses CDP's
    // value-set mechanism and fires the input event the engine listens to directly.
    await page.locator('#hidden-input').fill('A');
    const afterType = await page.locator('.cell-letter').allTextContents();
    expect(afterType.filter(t => t !== '').length).toBe(1);
    expect(afterType.some(t => t === 'A')).toBe(true);

    // The help counts restart: one reveal now is the only one. A cell other than the one
    // just typed in, so the reveal has something to do.
    await page.locator('#' + tool.sameEntryCellId).click();
    await clickHelpRow(page, '#reveal-btn');
    const key = await page.evaluate(() => Object.keys(localStorage)[0]);
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    assert.deepEqual(saved.help, { checks: 0, reveals: 1 });
  });
}

// ---- A solved board restores solved and sealed — all four tools ----------------------
// The auto-save payload holds no solved flag, so a solved board comes back unpainted;
// checker.repaintIfSolved() re-adjudicates its content and repaints `.solved` and the
// clue items at restore time. The solve marks no cell, so none comes back marked. The
// ring tools solve their rebus fixture, which has multi-letter cells to compose in.

async function solveForRestore(tool, page) {
  if (tool.ring) {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);
    for (const cell of tool.REBUS_CELLS) await typeCell(page, cell);
  } else {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await tool.solveBoard(page);
  }
}

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] a solved board restores solved and sealed`, async ({ page }) => {
    test.setTimeout(60_000);
    await solveForRestore(tool, page);
    await expect(page.locator('#congrats-dialog')).toBeVisible();

    const total = await page.locator('.clue-item').count();
    expect(total).toBeGreaterThan(0);
    const marked = tool.cluesMarkCorrect ? total : 0;
    await expect(page.locator('.clue-item.correct')).toHaveCount(marked);

    await page.reload();
    await ready(tool, page);

    await expect(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);
    await expect(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(0);
    await expect(page.locator('.clue-item.correct')).toHaveCount(marked);
    // This guards the emission guarantee, and nothing about the repaint: focusCell's
    // syncUI does call latch.check(true) here, and sealIfSolved() is the only reason the
    // dialog stays shut. The repaint's own no-syncUI contract is pinned in
    // shared/test/engine-state.checker.test.js, not here.
    await expect(page.locator('#congrats-dialog')).toBeHidden();

    // What guards a solved board: latch.solved makes the keydown handler (Enter,
    // Backspace) and the input handler (typed letters) return, and the composer refuses
    // to open on a solved board too. This is the one place the guards run on a page that
    // never touched a dialog — post-reload the latch is sealed by sealIfSolved(), so CDP
    // key injection is unimpaired. The control is the ring tools' 'Enter opens a
    // multi-letter cell' test: same fixture, and Enter does open composition when the
    // board is not solved. The letters are compared too, since the composer alone would
    // stop Enter and leave the keydown and input guards unproven.
    const before = await page.locator('.cell-letter').allTextContents();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    await page.locator('#hidden-input').fill('Z');
    await page.keyboard.type('Z');
    await expect(page.locator('.cell.composing')).toHaveCount(0);
    expect(await page.locator('.cell-letter').allTextContents()).toEqual(before);

    // #rebus-btn reaches composition without going through setupKeydown, so it is
    // disabled on a solved board (setupRebusButton's canCompose); composer.toggle's own
    // solved check, pinned in engine-state.composer.test.js, backs it up.
    if (tool.hasRebusButton) await expect(page.locator('#rebus-btn')).toBeDisabled();
    await expect(page.locator('.cell.composing')).toHaveCount(0);
  });
}

// ---- L: a typed first cell: storage, print, digits — all four tools -------------------
// The save timing contract (docs/CROSS_TOOL_SPEC.md → "localStorage key format"): a wrong
// check marks nothing and writes only the help count; a correct check writes the mark
// and the count. A save another board made is not restored. Every tool's rebus fixture
// answers its first cell 'A', so 'Z' is uniformly wrong.

for (const tool of ALL_TOOLS) {
  async function enterFirstCell(page, letter) {
    await page.locator('#hidden-input').fill(letter);
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await page.locator('#' + tool.firstCellId).click();
  }

  async function savedState(page) {
    return page.evaluate(() => {
      const key = Object.keys(localStorage)[0];
      return key === undefined ? null : JSON.parse(localStorage.getItem(key));
    });
  }

  test(`[${tool.name}] Check Cell saves a wrong guess as wrong, then a retyped right one as checked, counting both`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);
    const n = tool.firstCellId.replace('cell-', '');

    await enterFirstCell(page, 'Z'); // deliberately wrong
    await page.evaluate(() => localStorage.clear());
    await clickHelpRow(page, '#check-btn');
    await expect(page.locator('#' + tool.firstCellId)).toHaveAttribute('data-mark', 'wrong');
    assert.equal(await page.evaluate(() => localStorage.length), 1);
    let saved = await savedState(page);
    assert.deepEqual(saved.help, { checks: 1, reveals: 0 });
    assert.deepEqual(saved.marks, { [n]: 'wrong' });

    // Clear the wrong letter (Crushword would otherwise append to it), then type the
    // right one; every rebus fixture answers its first cell 'A'.
    await page.keyboard.press('Backspace');
    await expect(page.locator('#' + tool.firstLetterId)).toHaveText('');
    await enterFirstCell(page, 'A');
    await page.evaluate(() => localStorage.clear());
    await clickHelpRow(page, '#check-btn');
    await expect(page.locator('#' + tool.firstCellId)).toHaveAttribute('data-mark', 'checked');
    assert.equal(await page.evaluate(() => localStorage.length), 1);
    saved = await savedState(page);
    assert.equal(saved.help.checks, 2);
    assert.deepEqual(saved.marks, { [n]: 'checked' });
  });

  test(`[${tool.name}] the check count survives a reload and keeps counting`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, 'Z');
    await clickHelpRow(page, '#check-btn');
    assert.equal((await savedState(page)).help.checks, 1);

    await page.reload();
    await ready(tool, page);
    // The slashed cell can't be checked again until it changes.
    await enterFirstCell(page, 'Y');
    await clickHelpRow(page, '#check-btn');
    assert.equal((await savedState(page)).help.checks, 2);
  });

  test(`[${tool.name}] a save carries the help record, and one written without it still restores`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, 'Z');
    const key = await page.evaluate(() => Object.keys(localStorage)[0]);
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    expect(saved.help).toEqual({ checks: 0, reveals: 0 });

    await rewriteSaveOnNextLoad(page, s => { delete s.help; });
    await page.reload();
    await ready(tool, page);

    await expect(page.locator('#' + tool.firstLetterId)).toHaveText('Z');
    expect(errors).toEqual([]);
  });

  // A save made for another board under the same storageKey (Crushword's hash leaves out
  // where the blocks are) names cells this one lacks; restoring it would write to them.
  test(`[${tool.name}] a save naming a cell the board lacks is ignored`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, 'Z');
    await rewriteSaveOnNextLoad(page, s => { s.letters[99999] = 'q'; });
    await page.reload();
    await ready(tool, page);

    await expect(page.locator('#' + tool.firstLetterId)).toHaveText('');
    expect(errors).toEqual([]);
  });

  test(`[${tool.name}] a filled letter is visible on screen and hidden under print media`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, 'Z');
    const letter = page.locator('#' + tool.firstLetterId);
    await expect(letter).toHaveText('Z');
    await expect(letter).toBeVisible();

    // Printing always yields a blank puzzle (docs/CROSS_TOOL_SPEC.md → "Print-mode state
    // erasure").
    await page.emulateMedia({ media: 'print' });
    await expect(letter).toBeHidden();
  });

  test(`[${tool.name}] a typed digit fills the cell like a letter`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, '7');
    await expect(page.locator('#' + tool.firstLetterId)).toHaveText('7');
  });
}

// ---- M: rebus button label resyncs after Clear — ring tools ---------------------------

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] the rebus button label resyncs after Clear resets a composing cell`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await page.locator('#rebus-btn').click();
    await expect(page.locator('#rebus-btn')).toHaveText('Done');

    await page.locator('#menu-btn').click();
    await page.locator('#clear-btn').click(); // arms
    await page.locator('#clear-btn').click(); // confirms
    await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
    await expect(page.locator('#menu-panel')).toBeHidden(); // confirming Clear also closes the menu
  });
}

// ---- N: rebus button label resyncs after a cursor move — ring tools -------------------

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] the rebus button label resyncs when a cursor move commits the cell`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await page.locator('#rebus-btn').click();
    await expect(page.locator('#rebus-btn')).toHaveText('Done');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
  });
}

// ---- O: rebus button present in hashed and non-hashed builds — ring tools -------------

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] the rebus button is present and enabled in hashed and non-hashed builds`, async ({ page }) => {
    for (const p of [tool.paths.rebus, tool.paths.rebusHashed]) {
      await page.goto('file://' + p);
      await ready(tool, page);
      await expect(page.locator('#rebus-btn')).toBeVisible();
      await expect(page.locator('#rebus-btn')).toBeEnabled();
    }
  });
}

// ---- P: a hashed rebus solve from accented typing — ring tools ------------------------
// Each engine runs what the solver types through the shared normalize(), which folds é
// to e, so an accented guess fills the plain letter and the hash then matches. A hashed
// page has no Check or Reveal, so the solve reports no help. Crushword's hashed
// completion test is in crushword.spec.js; its accents test is section Z, on the plain
// board.

const ACCENTED = { A: 'Á', C: 'Ç', E: 'É', I: 'Í', N: 'Ñ', O: 'Ö', U: 'Ü' };
const accent = s => [...s.toUpperCase()].map(ch => ACCENTED[ch] ?? ch).join('');

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] a hashed rebus puzzle solves from accented typing: the solution hashes to boardHash, with no help used`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebusHashed);
    await ready(tool, page);

    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });

    const typed = tool.REBUS_CELLS.map(accent);
    expect(typed.join('')).not.toBe(tool.REBUS_CELLS.join(''));   // some letters really are accented
    for (const cell of typed) await typeCell(page, cell);

    await expect.poll(() => events.length).toBe(1);
    const detail = events[0];
    expect(detail.solution).toBe(tool.REBUS_CELLS.map(c => c.toLowerCase()).join('.'));
    expect(sha256hex(detail.solution)).toBe(detail.boardHash);
    expect(detail.checks).toBe(0);
    expect(detail.reveals).toBe(0);
  });
}

// ---- Banners and print — all four tools -------------------------------------------

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] banners are state-derived and partial correctness stays hidden`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#congrats')).toBeHidden();
    await expect(page.locator('#done-wrong')).toBeHidden();

    // Fill the board with the first cell wrong.
    const letters = await filledLetters(page);
    const firstId = await fillBoardFirstWrong(tool, page);

    // Full but wrong: done-wrong shows, congrats does not, nothing marked correct.
    await expect(page.locator('#done-wrong')).toBeVisible();
    await expect(page.locator('#congrats')).toBeHidden();
    await expect(page.locator(`${tool.readySelector}[data-mark]`)).toHaveCount(0);

    // Clearing the wrong cell leaves the board unfull, so the banner must hide
    // immediately (state-derived, no timeout).
    // On the ring tools the cursor wrapped from the last cell to the wrong first one.
    if (tool.ring) await expect(page.locator('#' + firstId)).toHaveClass(/\bactive-cell\b/);
    await activateCell(page, page.locator('#' + firstId));
    await page.keyboard.press('Backspace');
    await expect(page.locator('#done-wrong')).toBeHidden();

    // Re-type the correct first letter → board full and entirely correct → congrats.
    await page.locator('#hidden-input').fill(letters[0].toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await expect(page.locator('#congrats')).toBeVisible();
    await expect(page.locator('#done-wrong')).toBeHidden();
  });

  test(`[${tool.name}] marked cells print white and blank`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const checked = page.locator('#' + tool.markCellId);
    const revealed = page.locator('#' + tool.sameEntryCellId);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);

    // The solve marks no cell, so mark one with Check and another with Reveal.
    await activateCell(page, checked);
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await activateCell(page, checked);
    await clickHelpRow(page, '#check-btn');
    await revealed.click();
    await clickHelpRow(page, '#reveal-btn');
    await expect(checked).toHaveAttribute('data-mark', 'checked');
    await expect(revealed).toHaveAttribute('data-mark', 'revealed');

    const fillOf = id => page.evaluate(i => getComputedStyle(document.getElementById(i)).fill, id);

    // Under print every cell state resets to white (shared/themes/print-base.css).
    await page.emulateMedia({ media: 'print' });
    expect(await fillOf(tool.markCellId)).toBe('rgb(255, 255, 255)');
    expect(await fillOf(tool.sameEntryCellId)).toBe('rgb(255, 255, 255)');
    // Correct letters print blank too, not just their cells.
    expect(await page.locator('.cell-letter[data-mark]').count()).toBeGreaterThan(0);
    await expect(page.locator('.cell-letter[data-mark]:visible')).toHaveCount(0);
  });
}

// ---- Q: correct cells stay part of the active-entry highlight — all four tools --------
// The highlight shows which entry the cursor is in; it does not double as a
// to-do list, so a cell already marked correct highlights with the rest of its
// entry. Marching Bands and Crushword used to suppress it, leaving a gap in the
// middle of the highlighted run.

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] a cell marked correct keeps the active-entry highlight`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const marked = page.locator(`#${tool.markCellId}`);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);

    // Move to the marked cell. If it is already the active cell (at load, in the ring
    // tools), a click would switch direction, mode or loop instead.
    if (!/\bactive-cell\b/.test(await marked.getAttribute('class'))) await marked.click();
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');

    await marked.click();
    await clickHelpRow(page, '#check-btn');
    await expect(marked).toHaveAttribute('data-mark');

    // Move the cursor to another cell of the same entry, so the marked cell is part
    // of the active entry without being the active cell.
    await page.locator(`#${tool.sameEntryCellId}`).click();
    await expect(marked).toHaveAttribute('data-mark');
    await expect(marked).toHaveClass(/\bactive-entry\b/);
  });
}

// ---- Q2: a checked letter takes the checked color, under the cursor too -------------
// Why: a mark never touches the cell's fill (theme-components.css →
// .cell-letter[data-mark="checked"]).

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] a checked letter takes the checked color under the cursor`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const marked = page.locator(`#${tool.markCellId}`);
    const letterEl = page.locator('#' + tool.markCellId.replace('cell-', 'letter-'));
    const other = page.locator(`#${tool.sameEntryCellId}`);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);
    const fill = loc => loc.evaluate(el => getComputedStyle(el).fill);
    const token = await page.evaluate(() => {
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      probe.style.fill = 'var(--theme-color-checked-text)';
      document.querySelector('svg').appendChild(probe);
      const c = getComputedStyle(probe).fill;
      probe.remove();
      return c;
    });

    // Move to the cell; at load it may already be active, and a click would toggle.
    if (!/\bactive-cell\b/.test(await marked.getAttribute('class'))) await marked.click();
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await marked.click();
    await clickHelpRow(page, '#check-btn');
    await expect(marked).toHaveAttribute('data-mark', 'checked');
    await expect(marked).toHaveClass(/\bactive-cell\b/);
    expect(await fill(letterEl)).toBe(token);
    const markedUnderCursor = await fill(marked);

    // The cell's own fill is the cursor's, exactly as on an unmarked cell.
    await other.click();
    await expect(other).toHaveClass(/\bactive-cell\b/);
    expect(markedUnderCursor).toBe(await fill(other));
    expect(await fill(letterEl)).toBe(token);
  });
}

// ---- R: Check Cell is enabled only where there is something to check — all four -------

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] Check Cell is enabled only on a filled cell not yet marked correct`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const marked = page.locator(`#${tool.markCellId}`);
    const check = page.locator('#check-btn');
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);

    // Move to the cell; at load it may already be active, and a click would toggle.
    if (!/\bactive-cell\b/.test(await marked.getAttribute('class'))) await marked.click();
    await expect(check).toBeDisabled();

    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await page.locator(`#${tool.sameEntryCellId}`).click();
    await marked.click();
    await expect(check).toBeEnabled();

    await clickHelpRow(page, '#check-btn');
    await expect(marked).toHaveAttribute('data-mark');
    await expect(check).toBeDisabled();
  });
}

// ---- S: the active cell paints above its neighbors — all four tools -------------------
// A stroke straddles the cell's outline, and SVG paints in document order, so a
// neighbor later in the cells layer would paint over the outer half of the active
// cell's border, leaving it thinner on those sides. Hit-testing follows paint order,
// so no point on the active cell's outline may find another cell-layer element on
// top. (On the board's outer edge a point may hit nothing at all; nothing covers it.)

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] the active cell's border is not painted over by its neighbors`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    // A cell from the middle of the cells layer, so neighbors follow it in the DOM.
    const midId = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.cell')];
      return cells[Math.floor(cells.length / 2)].id;
    });
    await page.locator(`#${midId}`).click();
    await expect(page.locator(`#${midId}`)).toHaveClass(/\bactive-cell\b/);

    const covered = await page.evaluate(() => {
      const active = document.querySelector('.cell.active-cell');
      const layer = active.parentNode;
      const ctm = active.getScreenCTM();
      const total = active.getTotalLength();
      const hits = [];
      for (let i = 0; i < 64; i++) {
        const { x, y } = active.getPointAtLength((i + 0.5) * total / 64);
        const pt = new DOMPoint(x, y).matrixTransform(ctm);
        const top = document.elementsFromPoint(pt.x, pt.y).find(el => el.parentNode === layer);
        if (top && top !== active) hits.push(top.id || top.getAttribute('class'));
      }
      return hits;
    });
    expect(covered).toEqual([]);
  });
}

// ---- T: clue clicks — all four tools --------------------------------------------------
// The last clue, so the click has to move the cursor. Marching Bands' clickable unit is
// the row or band group, which hides where its entries split.

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] clicking a clue makes it the active clue`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const clue = page.locator(tool.name === 'marching-bands' ? '.clue-group' : '.clue-item').last();
    await expect(clue).not.toHaveClass(/\bactive-clue\b/);
    await clue.click();
    await expect(clue).toHaveClass(/\bactive-clue\b/);
  });
}

// ---- U: clue-list scrolling — marching-bands, crushword -------------------------------
// docs/CROSS_TOOL_SPEC.md → "syncUI() contract"

for (const tool of TOOLS.filter(t => t.name === 'marching-bands' || t.name === 'crushword')) {
  test(`[${tool.name}] the clue list scrolls only when the active clue changes`, async ({ page }) => {
    // Short enough that, scrolled to the bottom, the first clue is off screen in both
    // tools.
    await page.setViewportSize({ width: 400, height: 400 });
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const scrollY = () => page.evaluate(() => window.scrollY);

    const away = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return window.scrollY;
    });
    expect(away).toBeGreaterThan(0);

    // Typing and ← stay within the active clue (Marching Bands: the next cell of the row
    // and back; Crushword: within the cell), so the page holds still.
    await page.locator('#hidden-input').fill('a');
    expect(await scrollY()).toBe(away);
    await page.keyboard.press('ArrowLeft');
    expect(await scrollY()).toBe(away);

    // Tab moves to the next clue, which is scrolled into view.
    await page.keyboard.press('Tab');
    expect(await scrollY()).toBeLessThan(away);
  });
}

// ---- V: behaviors the ring tools share, with per-tool cell numbering — ring tools -----
// Cell numbering is per-tool (Snake Charmer's ring starts at cell-0; the others at
// cell-1; Marching Bands' first row is cells 1..N), so each body reads its cell ids
// from the adapter (firstCellNum, rebusTwo) instead of hard-coding them.

const activeCellNum = async (tool, page) => {
  const id = await page.locator(`${tool.readySelector}.active-cell`).getAttribute('id');
  return Number(id.slice('cell-'.length));
};
const filledLetters = page =>
  page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] Backspace clears a filled cell in place, then retreats and clears the previous cell when empty`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const first = tool.firstCellNum;

    // Fill the first three cells; the cursor advances past them. Step back onto 'B'.
    await page.keyboard.type('ABC');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect(await activeCellNum(tool, page)).toBe(first + 1);
    await expect(page.locator(`#letter-${first + 1}`)).toHaveText('B');

    // Backspace on a filled cell clears it; the cursor stays put.
    await page.keyboard.press('Backspace');
    await expect(page.locator(`#letter-${first + 1}`)).toHaveText('');
    expect(await activeCellNum(tool, page)).toBe(first + 1);

    // Backspace again on the now-empty cell retreats to the previous cell and clears it.
    await page.keyboard.press('Backspace');
    expect(await activeCellNum(tool, page)).toBe(first);
    await expect(page.locator(`#letter-${first}`)).toHaveText('');
  });

  test(`[${tool.name}] hashed mode advances the cursor on every keystroke, independent of the board-complete check`, async ({ page }) => {
    await page.goto('file://' + tool.paths.hashed);
    await ready(tool, page);

    expect(await activeCellNum(tool, page)).toBe(tool.firstCellNum);

    // A single, non-final keystroke moves the cursor immediately: the engine advances
    // before, and regardless of, the hash check. No correctness is revealed until the
    // whole board is filled, and hashed mode never shows the Check Cell button.
    await page.keyboard.type('Z');
    expect(await activeCellNum(tool, page)).toBe(tool.firstCellNum + 1);
    await expect(page.locator(`${tool.readySelector}[data-mark]`)).toHaveCount(0);
    await expect(page.locator('#congrats')).toBeHidden();
    await expect(page.locator('#done-wrong')).toBeHidden();
    await expect(page.locator('#check-btn')).toHaveCount(0);
  });

  test(`[${tool.name}] Enter opens a multi-letter cell; a second Enter commits without advancing`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);
    const { cellNum, arrowsRight } = tool.rebusTwo;

    for (let i = 0; i < arrowsRight; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator(`#cell-${cellNum}`)).toHaveClass(/composing/);

    for (const ch of ['B', 'B']) await page.locator('#hidden-input').fill(ch);
    await expect(page.locator(`#letter-${cellNum}`)).toHaveText('BB');
    await expect(page.locator(`#letter-${cellNum}`)).toHaveClass(/len-2/);
    // Capacity must never auto-advance.
    await expect(page.locator(`#cell-${cellNum}`)).toHaveClass(/active-cell/);

    await page.keyboard.press('Enter');
    await expect(page.locator(`#cell-${cellNum}`)).not.toHaveClass(/composing/);
    // Committing doesn't advance either: the cursor stays on the cell.
    await expect(page.locator(`#cell-${cellNum}`)).toHaveClass(/active-cell/);
  });

  test(`[${tool.name}] a composing prefix that would complete the board does not fire completion`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebusHashed);
    await ready(tool, page);

    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });

    for (let i = 0; i < tool.REBUS_CELLS.length - 1; i++) await typeCell(page, tool.REBUS_CELLS[i]);

    // The final (single-letter) cell entered as a rebus and left uncommitted: every cell
    // now holds correct content, but the board must not read as solved.
    await page.keyboard.press('Enter');
    await page.locator('#hidden-input').fill(tool.REBUS_CELLS.at(-1));

    // The dialog assertions are what actually catch the regression. `events` is fed by an
    // async exposeFunction bridge, so a bare length check here races it — and because the
    // latch is one-way, a premature fire still leaves events.length at 1 for the final
    // poll, making that assertion unable to tell premature from correct. The
    // auto-retrying DOM assertions below have neither problem: the dialog opens
    // synchronously inside the completion handler, so it is already open by the time
    // fill() resolves.
    await expect(page.locator('#congrats-dialog')).toHaveCount(1);
    await expect(page.locator('#congrats-dialog')).not.toHaveJSProperty('open', true);
    expect(events).toHaveLength(0);

    // Committing the same content completes the board — proving the suppression was the
    // composing state, not wrong content.
    await page.keyboard.press('Enter');
    await expect(page.locator('#congrats-dialog')).toHaveJSProperty('open', true);
    await expect.poll(() => events.length).toBe(1);
  });

  // Per-engine wiring for the shared composing-restore contract: getState/applyState
  // carry `composing`, and the Restore & focus epilogue resumes the cursor on that cell.
  // Without the resume, focusCell's commitIfMoved would commit it on the way to the
  // default cell and re-save with composing:null, silently undoing the restore.
  test(`[${tool.name}] a half-composed cell restores from autosave still composing`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    const cell = await activeCellNum(tool, page);
    await page.keyboard.press('Enter');
    for (const ch of ['B', 'B']) await page.locator('#hidden-input').fill(ch);
    await expect(page.locator(`#cell-${cell}`)).toHaveClass(/composing/);

    await page.reload();
    await ready(tool, page);

    await expect(page.locator(`#letter-${cell}`)).toHaveText('BB');
    await expect(page.locator(`#letter-${cell}`)).toHaveClass(/len-2/);
    await expect(page.locator(`#cell-${cell}`)).toHaveClass(/composing/);
    await expect(page.locator(`#cell-${cell}`)).toHaveClass(/active-cell/);
    await expect(page.locator('#rebus-btn')).toHaveText('Done');

    // Still composing means still not filled: typing appends rather than replacing.
    await page.locator('#hidden-input').fill('C');
    await expect(page.locator(`#letter-${cell}`)).toHaveText('BBC');
  });

  test(`[${tool.name}] the rebus button opens and commits composition without a keydown`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);
    const { cellNum, arrowsRight } = tool.rebusTwo;

    for (let i = 0; i < arrowsRight; i++) await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
    await page.locator('#rebus-btn').click();
    await expect(page.locator('.cell.composing')).toHaveCount(1);
    await expect(page.locator(`#cell-${cellNum}`)).toHaveClass(/composing/);
    await expect(page.locator('#rebus-btn')).toHaveText('Done');

    // Letters must still reach the composing cell: the click preserves hidden-input
    // focus.
    for (const ch of 'HAR') await page.locator('#hidden-input').fill(ch);
    await expect(page.locator(`#letter-${cellNum}`)).toHaveText('HAR');

    await page.locator('#rebus-btn').click();
    await expect(page.locator('.cell.composing')).toHaveCount(0);
    await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
    await expect(page.locator(`#cell-${cellNum}`)).toHaveClass(/active-cell/);   // commit doesn't advance
  });
}

// Marching Bands marks no clue item correct (rebusCorrectClueItems is 0), so its count
// is the negative case; the list is never empty, so the 0 can't pass vacuously.
for (const tool of RING_TOOLS) {
  test(`[${tool.name}] a non-hashed rebus puzzle marks every clue item correct, and the board solved, on solve`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    for (const cell of tool.REBUS_CELLS) await typeCell(page, cell);

    await expect(page.locator('#congrats')).toBeVisible();
    await expect(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);
    await expect(page.locator('.cell[data-mark]')).toHaveCount(0);
    // An exact total (both modes' items are in the DOM) keeps a 0 from passing vacuously.
    await expect(page.locator('.clue-item')).toHaveCount(tool.rebusClueItems);
    await expect(page.locator('.clue-item.correct')).toHaveCount(tool.rebusCorrectClueItems);
  });
}

// ---- W: filled clues — three tools (Marching Bands never marks one) ------------------
// `.filled` marks a clue whose cells all hold content, right or wrong; it is derived in
// syncUI() and distinct from `.correct`. docs/CROSS_TOOL_SPEC.md → "Filled clues".

const FILLED_TOOLS = TOOLS.filter(t => t.name !== 'marching-bands');
const mbTool = TOOLS.find(t => t.name === 'marching-bands');

// Fills every cell with the same wrong letter, so the board is complete but not solved.
async function fillBoardWrong(tool, page) {
  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  if (tool.ring) {
    for (const _l of letters.filter(l => l !== null)) await page.keyboard.press('KeyZ');
    return;
  }
  for (let i = 0; i < letters.length; i++) {
    if (letters[i] === null) continue;
    await page.locator(`#cell-${i + 1}`).click();
    await page.locator('#hidden-input').fill('Z');
    await page.keyboard.press('Enter');
  }
}

for (const tool of FILLED_TOOLS) {
  test(`[${tool.name}] a clue is .filled once its cells hold content — wrong or right — and loses it on delete`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const total = await page.locator('.clue-item').count();
    await expect(page.locator('.clue-item.filled')).toHaveCount(0);

    await fillBoardWrong(tool, page);
    await expect(page.locator('.clue-item.filled')).toHaveCount(total);
    await expect(page.locator('.clue-item.correct')).toHaveCount(0);

    await page.locator('#' + tool.markCellId).click();
    await page.keyboard.press('Backspace');
    const after = await page.locator('.clue-item.filled').count();
    expect(after).toBeLessThan(total);
    expect(after).toBeGreaterThan(0);
  });

  test(`[${tool.name}] broadsheet dims a filled clue on screen but prints it undimmed`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await fillBoardWrong(tool, page);
    const text = page.locator('.clue-item.filled .clue-text').first();
    await expect(text).toHaveCSS('opacity', '0.5');
    await expect(text).toHaveCSS('text-decoration-line', 'none');

    await page.emulateMedia({ media: 'print' });
    await expect(text).toHaveCSS('opacity', '1');
    await expect(text).toHaveCSS('text-decoration-line', 'none');
  });

  test(`[${tool.name}] a theme that does not opt in leaves a filled clue undimmed`, async ({ page }) => {
    const out = path.join(tool.tmpDir, 'skeleton.html');
    buildPuzzleFile(path.join(tool.fixDir, tool.plainFixture), out, { theme: 'skeleton', font: 'embed' });
    await page.goto('file://' + out);
    await ready(tool, page);

    await fillBoardWrong(tool, page);
    await expect(page.locator('.clue-item.filled').first()).toBeVisible();
    await expect(page.locator('.clue-item.filled .clue-text').first()).toHaveCSS('opacity', '1');
  });

  // The masthead-alignment, title-size and corner-radius tokens reach their rules, and
  // print-base.css's title size still wins over a theme's.
  test(`[${tool.name}] swiss sets the masthead flush left and squares the buttons; print keeps its own title size`, async ({ page }) => {
    const out = path.join(tool.tmpDir, 'swiss.html');
    buildPuzzleFile(path.join(tool.fixDir, tool.plainFixture), out, { theme: 'swiss' });
    await page.goto('file://' + out);
    await ready(tool, page);

    await expect(page.locator('.puzzle-header')).toHaveCSS('text-align', 'left');
    await expect(page.locator('#menu-btn')).toHaveCSS('border-top-left-radius', '0px');
    await expect(page.locator('#help-btn')).toHaveCSS('border-top-left-radius', '0px');
    const titleSize = () => page.locator('h1.title').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(await titleSize()).toBeCloseTo(3.2 * rem, 1);

    await page.emulateMedia({ media: 'print' });
    expect(await titleSize()).toBeCloseTo(1.4 * rem, 1);
  });

  test(`[${tool.name}] broadsheet keeps the centered masthead and round icon buttons`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await expect(page.locator('.puzzle-header')).toHaveCSS('text-align', 'center');
    await expect(page.locator('#menu-btn')).toHaveCSS('border-top-left-radius', '50%');
    await expect(page.locator('#keys-btn')).toHaveCSS('border-top-left-radius', '50%');
    // A toggle's options are buttons, but square inside its rounded frame (Crushword has
    // no toggle).
    const toggle = page.locator('.puzzle-toggle');
    if (await toggle.count()) {
      await expect(toggle.first()).toHaveCSS('border-top-left-radius', '4px');
      await expect(toggle.first().locator('.toggle-opt').first()).toHaveCSS('border-top-left-radius', '0px');
    }
  });
}

// Marching Bands' clues own no known cells (docs/CROSS_TOOL_SPEC.md → "Active-clue
// banner" scope rule), so its clue items are never marked.
test('[marching-bands] a completely filled board marks no clue item .filled', async ({ page }) => {
  await page.goto('file://' + mbTool.paths.plain);
  await ready(mbTool, page);

  await fillBoardWrong(mbTool, page);
  await expect(page.locator('.clue-item.filled')).toHaveCount(0);
});

// ---- X: clue rows print tighter than on screen — all four tools -----------------------

for (const tool of ALL_TOOLS) {
  // Each tool's print.css tightens its clue rows to fit the page. A screen rule that
  // outranks it on specificity silently undoes that, so print must actually differ.
  test(`[${tool.name}] clue rows print with tighter padding than on screen`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const paddingTop = () => page.locator('.clue-item').first()
      .evaluate(el => parseFloat(getComputedStyle(el).paddingTop));
    const screen = await paddingTop();
    await page.emulateMedia({ media: 'print' });
    expect(await paddingTop()).toBeLessThan(screen);
  });
}

// ---- Y: a doubled circle draws once — all four tools ----------------------------------
// docs/CROSS_TOOL_SPEC.md → "Cell styles".
// The circle rule has every entry covering a circled cell list it, so two entries mark
// the same cell; the engines must still draw one circle per cell. The fixtures complete
// under that rule already, except Crushword's, which is rewritten in memory so both
// entries covering cell (0,0) carry the circle.

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] no cell carries two circles (doubled styles draw once)`, async ({ page }) => {
    const src = path.join(tool.fixDir, tool.rebusFixture);
    const out = tool.name === 'crushword'
      ? buildVariant(src, (puzzle) => {
        puzzle.across[1].styles = { circle: [0] };
        puzzle.down[1].styles = { circle: [0] };
      }, 'doubled-circle', tool.tmpDir)
      : path.join(tool.tmpDir, 'doubled-circle.html');
    if (tool.name !== 'crushword') buildPuzzleFile(src, out);
    await page.goto('file://' + out);
    await ready(tool, page);

    const centers = await page.$$eval('.style-circle', els => els.map(e => `${e.getAttribute('cx')},${e.getAttribute('cy')}`));
    // The fixture must really double a circle, or the dedupe path never runs and
    // this test passes without it: more positions are listed than circles drawn.
    const listed = await page.evaluate(() => {
      let n = 0;
      (function walk(v) {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') {
          if (v.styles && Array.isArray(v.styles.circle)) n += v.styles.circle.length;
          Object.values(v).forEach(walk);
        }
      })(window.PUZZLE_DATA);
      return n;
    });
    expect(centers.length).toBeGreaterThan(0);
    expect(listed).toBeGreaterThan(centers.length);
    expect(new Set(centers).size).toBe(centers.length);
  });
}

// ---- Z: Crushword's plain board solves from accented typing ---------------------------
// The ring tools' accent solve is section P's hashed one.

test('[crushword] a puzzle solves when the solver types accented letters', async ({ page }) => {
  const tool = TOOLS.find(t => t.name === 'crushword');
  await page.goto('file://' + tool.paths.plain);
  await ready(tool, page);
  await page.evaluate(() => {
    window.__vpEvents = [];
    document.querySelector('.puzzle-main').addEventListener('varietypack:complete', () => window.__vpEvents.push(1));
  });
  await solveCrushwordBoard(page, { toTyped: accent });
  await page.waitForFunction(() => window.__vpEvents.length === 1);
});

// The other side of e2e/phone.spec.js: a desktop browser (not touch-first) gets no phone
// layout. Detection is shared code, so one tool covers it.
test('[crushword] a desktop browser gets no drawn keyboard, and the native one is left alone', async ({ page }) => {
  const tool = TOOLS.find(t => t.name === 'crushword');
  await page.goto('file://' + tool.paths.plain);
  await ready(tool, page);
  await expect(page.locator('#drawn-kb')).toHaveCount(0);
  await expect(page.locator('#hidden-input')).not.toHaveAttribute('inputmode', /.*/);
});

// A multi-letter cell's letter is scaled down in place. WebKit (Safari, every iOS
// browser) mis-resolves transform-box: fill-box for SVG <text>, which slid the letter
// toward the drawing's top-left — so WebKit is the project that catches a regression.
// The scaling is one rule over every tool's own letter elements (see the comment on
// .cell-letter in theme-components.css), so each tool is looped. Measured by property —
// the letter's center inside its cell — not by recomputing the scale.
for (const tool of TOOLS) {
  test(`[${tool.name}] a multi-letter cell's text stays centered in its cell while typing`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    // A cell away from the drawing's origin, where a mis-pivoted scale shows most.
    const cellId = await page.evaluate(() => {
      const letters = [...document.querySelectorAll('[id^="letter-"]')];
      return letters[Math.floor(letters.length / 2)].id.replace('letter-', 'cell-');
    });
    const letterId = cellId.replace('cell-', 'letter-');
    await page.locator('#' + cellId).click();
    const cap = tool.ring ? 3 : Math.min(3, await page.evaluate(() => window.PUZZLE_DATA.maxCellLetters));
    if (tool.ring) await page.keyboard.press('Enter');

    // Cells are tens of pixels wide; the fixed-origin bug misplaced the letter by ~100px.
    const TOLERANCE = 2;
    for (let n = 1; n <= cap; n++) {
      await page.locator('#hidden-input').fill('ABC'[n - 1]);
      const { cell, letter } = await page.evaluate(([c, l]) => {
        const box = id => document.getElementById(id).getBoundingClientRect();
        return { cell: box(c), letter: box(l) };
      }, [cellId, letterId]);
      const cx = letter.x + letter.width / 2, cy = letter.y + letter.height / 2;
      const where = `after ${n} letters`;
      expect(cx, `letter center x ${where}`).toBeGreaterThan(cell.x - TOLERANCE);
      expect(cx, `letter center x ${where}`).toBeLessThan(cell.x + cell.width + TOLERANCE);
      expect(cy, `letter center y ${where}`).toBeGreaterThan(cell.y - TOLERANCE);
      expect(cy, `letter center y ${where}`).toBeLessThan(cell.y + cell.height + TOLERANCE);
    }
  });
}

// ---- AA: Tab / Shift+Tab skip complete entries — all four tools -----------------------
// Tab lands on the next entry (Marching Bands: row) that still has an empty cell, at its
// first empty cell. docs/CROSS_TOOL_SPEC.md → "Tab / Shift+Tab entry navigation". Each
// adapter lists the cells of every entry in Tab order, as cell numbers; the entries it
// names share no cells, so filling one never fills another.

const { buildEntryMaps } = require('../crushword/src/typing.mjs');
const TAB_ENTRIES = {
  spiral: d => { let n = 1; return d.inward.map(e => Array.from({ length: e.length }, () => n++)); },
  // Entries run consecutively round the ring, so a start is the running total mod N; the
  // entries of the second loop reuse loop 0's cells, so only E0..E2 are used here.
  'snake-charmer': d => {
    let p = 0;
    return d.entries.map(e => Array.from({ length: e.length }, () => p++ % d.ring.N));
  },
  'marching-bands': d => Array.from({ length: d.size }, (_, r) =>
    Array.from({ length: d.size }, (_, c) => r * d.size + c + 1).filter(n => d.letters[n - 1] !== null)),
  crushword: d => { const { order, cellsOf } = buildEntryMaps(d.grid).across; return order.map(n => cellsOf[n]); },
};

// A click on the already-active cell toggles the direction or mode (typing advances the
// cursor onto the next cell to fill), so a cell is clicked only when it isn't active.
async function clickCell(page, n) {
  const active = await page.locator('.cell.active-cell').getAttribute('id');
  if (active !== `cell-${n}`) await page.locator(`#cell-${n}`).click();
}

async function fillCells(tool, page, cells) {
  for (const n of cells) {
    await clickCell(page, n);
    await page.locator('#hidden-input').fill('Z');
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
  }
}

// Puts the cursor on cell `n` in the entries' direction (Crushword opens down, and a
// click keeps the direction, so it takes a `.` to read across).
async function startAt(tool, page, n) {
  await clickCell(page, n);
  if (tool.name === 'crushword' && !await page.locator('#across-clues .clue-item.active-clue').count()) {
    await page.keyboard.press('.');
  }
}

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] Tab and Shift+Tab skip complete entries and land on the first empty cell`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const entries = TAB_ENTRIES[tool.name](await page.evaluate(() => window.PUZZLE_DATA));
    const [e0, e1, e2] = entries;

    await fillCells(tool, page, [...e1, e2[0]]);
    await startAt(tool, page, e0[0]);

    // E1 is complete, so Tab passes it; E2's first cell is filled, so it lands past it.
    await page.keyboard.press('Tab');
    expect(await activeCellNum(tool, page)).toBe(e2[1]);

    // Going back passes E1 too, to E0's first empty cell.
    await page.keyboard.press('Shift+Tab');
    expect(await activeCellNum(tool, page)).toBe(e0[0]);
  });
}

// ---- Help menu on every viewport — all four tools -----------------------------------
// Check cell lives in the life-ring help menu (#help-btn, #help-panel) on desktop and
// phone alike (docs/CROSS_TOOL_SPEC.md → "Help menu and help record").

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] #help-btn sits immediately left of #menu-btn and its panel opens below it`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const help = await page.locator('#help-btn').boundingBox();
    const menu = await page.locator('#menu-btn').boundingBox();
    expect(help.x + help.width).toBeLessThanOrEqual(menu.x);
    expect(menu.x - (help.x + help.width)).toBeLessThanOrEqual(16);
    expect(Math.abs(help.y - menu.y)).toBeLessThanOrEqual(1);

    await page.locator('#help-btn').click();
    const panel = await page.locator('#help-panel').boundingBox();
    expect(panel.y).toBeGreaterThanOrEqual(help.y + help.height);
    await expect(page.locator('#help-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  test(`[${tool.name}] the help and options menus close each other, and typing closes the help menu`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#help-btn').click();
    await expect(page.locator('#help-panel')).toBeVisible();
    await expect(page.locator('#hidden-input')).toBeFocused(); // a pointer open keeps focus on the puzzle
    await page.locator('#menu-btn').click();
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#menu-panel')).toBeVisible();

    await page.locator('#help-btn').click();
    await expect(page.locator('#menu-panel')).toBeHidden();
    await expect(page.locator('#help-panel')).toBeVisible();

    await page.keyboard.press('KeyA');
    await expect(page.locator('#help-panel')).toBeHidden();
  });

  test(`[${tool.name}] Check cell from the help menu checks the cell, closes the menu and returns focus to the puzzle`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const marked = page.locator(`#${tool.markCellId}`);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);
    if (!/\bactive-cell\b/.test(await marked.getAttribute('class'))) await marked.click();
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await marked.click();

    await page.locator('#help-btn').click();
    await page.locator('#help-panel #check-btn').click();
    await expect(marked).toHaveAttribute('data-mark');
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test(`[${tool.name}] a hashed build has no help menu and no Check cell`, async ({ page }) => {
    await page.goto('file://' + tool.paths.hashed);
    await ready(tool, page);

    await expect(page.locator('#help-btn')).toHaveCount(0);
    await expect(page.locator('#help-panel')).toHaveCount(0);
    await expect(page.locator('#check-btn')).toHaveCount(0);
  });
}

// The label tests below cover shared code (setupControls), so they run on one tool: the
// labels are fixed strings, except the clue noun, which Marching Bands' own spec covers
// for its rows and bands.
{
  const tool = TOOLS.find(t => t.name === 'crushword');
  test(`[${tool.name}] the puzzle rows read Check puzzle and Reveal puzzle`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#help-panel #check-puzzle-btn')).toHaveText('Check puzzle');
    await expect(page.locator('#help-panel #reveal-puzzle-btn')).toHaveText('Reveal puzzle');
  });

  test(`[${tool.name}] the clue rows read Check clue and Reveal clue`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#help-panel #check-clue-btn')).toHaveText('Check clue');
    await expect(page.locator('#help-panel #reveal-clue-btn')).toHaveText('Reveal clue');
  });

  test(`[${tool.name}] Check cell is a row of the help panel, labeled in sentence case`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await expect(page.locator('#help-panel #check-btn')).toHaveText('Check cell');
  });

  test(`[${tool.name}] the options menu holds only Clear puzzle`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#menu-btn').click();
    await expect(page.locator('#clear-btn')).toHaveText('Clear puzzle');
    await expect(page.locator('#menu-panel .menu-toggle')).toHaveCount(0);
  });
}

// Crushword's #controls held only Check Cell. With it gone the element goes too, so the
// page reserves no space for it.
{
  const tool = TOOLS.find(t => t.name === 'crushword');
  test(`[${tool.name}] there is no empty #controls row`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#controls')).toHaveCount(0);
  });
}

// ---- Locked cells: checked and revealed — docs/CROSS_TOOL_SPEC.md → "Cell marks" ------
// A locked cell behaves like a filled cell whose content keys can't change: the cursor
// moves as if the key had landed (makeCellStore's isLocked holds the rule).

for (const tool of ALL_TOOLS) {
  const letterOf = id => '#' + id.replace('cell-', 'letter-');

  test(`[${tool.name}] typing on a revealed cell keeps its letter and advances`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#reveal-btn');
    const answer = await page.locator(letterOf(tool.markCellId)).textContent();
    await page.keyboard.press(answer === 'Q' ? 'KeyZ' : 'KeyQ');
    await expect(page.locator(letterOf(tool.markCellId))).toHaveText(answer);
    await expect(page.locator('#' + tool.markCellId)).toHaveAttribute('data-mark', 'revealed');
    await expect(page.locator('#' + tool.markCellId)).not.toHaveClass(/\bactive-cell\b/);
  });

  test(`[${tool.name}] a checked cell is locked too`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);
    await activateCell(page, page.locator('#' + tool.markCellId));
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#check-btn');
    await expect(page.locator('#' + tool.markCellId)).toHaveAttribute('data-mark', 'checked');
    await page.keyboard.press(letter.toUpperCase() === 'Q' ? 'KeyZ' : 'KeyQ');
    await expect(page.locator(letterOf(tool.markCellId))).toHaveText(letter.toUpperCase());
    await expect(page.locator('#' + tool.markCellId)).toHaveAttribute('data-mark', 'checked');
  });

  test(`[${tool.name}] Space on a locked cell advances without clearing it`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#reveal-btn');
    const answer = await page.locator(letterOf(tool.markCellId)).textContent();
    await page.keyboard.press('Space');
    await expect(page.locator(letterOf(tool.markCellId))).toHaveText(answer);
    await expect(page.locator('#' + tool.markCellId)).toHaveAttribute('data-mark', 'revealed');
    await expect(page.locator('.mark-layer .mark-revealed')).toHaveCount(1);
    await expect(page.locator('#' + tool.markCellId)).not.toHaveClass(/\bactive-cell\b/);
  });

  test(`[${tool.name}] Clear still empties a locked cell and removes its flag`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#reveal-btn');
    await page.click('#menu-btn');
    await page.click('#clear-btn');
    await page.click('#clear-btn'); // second click confirms
    await expect(page.locator(letterOf(tool.markCellId))).toHaveText('');
    await expect(page.locator('#' + tool.markCellId)).not.toHaveAttribute('data-mark');
    await expect(page.locator('.mark-layer .mark-shape')).toHaveCount(0);
  });
}

for (const tool of RING_TOOLS) {
  // The spec's STONE example: type five cells, reveal the second, then Backspace from the
  // fifth. Each press clears and steps back, except over the locked cell.
  test(`[${tool.name}] Backspace walks back over a revealed cell without clearing it`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const f = tool.firstCellNum;
    const letter = n => page.locator(`#letter-${n}`);
    await page.keyboard.type('STONE');
    await page.locator(`#cell-${f + 1}`).click();
    await clickHelpRow(page, '#reveal-btn');
    const t = await letter(f + 1).textContent();
    await page.locator(`#cell-${f + 4}`).click();

    const steps = [
      { at: f + 4, cleared: f + 4 },
      { at: f + 3, cleared: f + 3 },
      { at: f + 2, cleared: f + 2 },
      { at: f + 1, cleared: null },
      { at: f,     cleared: f },
    ];
    for (const { at, cleared } of steps) {
      await page.keyboard.press('Backspace');
      expect(await activeCellNum(tool, page)).toBe(at);
      if (cleared !== null) await expect(letter(cleared)).toHaveText('');
      await expect(letter(f + 1)).toHaveText(t);
    }
    await expect(page.locator(`#cell-${f + 1}`)).toHaveAttribute('data-mark', 'revealed');
  });

  test(`[${tool.name}] Backspace passes two adjacent locked cells`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const f = tool.firstCellNum;
    await page.keyboard.type('ABCD');
    for (const n of [f + 1, f + 2]) {
      await page.locator(`#cell-${n}`).click();
      await clickHelpRow(page, '#reveal-btn');
    }
    await page.locator(`#cell-${f + 3}`).click();
    await page.keyboard.press('Backspace'); // clears D in place
    for (const at of [f + 2, f + 1, f]) {
      await page.keyboard.press('Backspace');
      expect(await activeCellNum(tool, page)).toBe(at);
    }
    await expect(page.locator(`#letter-${f}`)).toHaveText('');
    for (const n of [f + 1, f + 2]) {
      await expect(page.locator(`#cell-${n}`)).toHaveAttribute('data-mark', 'revealed');
    }
  });

  test(`[${tool.name}] Enter does nothing on a locked cell, and #rebus-btn is disabled there`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#reveal-btn');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cell.composing')).toHaveCount(0);
    await expect(page.locator('#rebus-btn')).toBeDisabled();
    await expect(page.locator('#rebus-btn')).toHaveText('Rebus');
    // Moving to an unlocked cell enables it again.
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#rebus-btn')).toBeEnabled();
  });
}


// ---- Wrong marks: a slash until the cell is edited ------------------------------------
// docs/CROSS_TOOL_SPEC.md → "Cell marks"

for (const tool of ALL_TOOLS) {
  const slashes = page => page.locator('.mark-layer .mark-wrong');
  // Types a wrong letter into the mark cell and checks it, leaving the cursor there.
  async function checkWrong(page) {
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);
    const wrong = letter.toUpperCase() === 'Q' ? 'Z' : 'Q';
    await activateCell(page, page.locator('#' + tool.markCellId));
    await page.locator('#hidden-input').fill(wrong);
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#check-btn');
    await expect(page.locator('#' + tool.markCellId)).toHaveAttribute('data-mark', 'wrong');
  }

  test(`[${tool.name}] Check on a wrong cell draws a slash that survives moving away and a reload`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await checkWrong(page);
    await expect(slashes(page)).toHaveCount(1);
    await page.locator('#' + tool.sameEntryCellId).click();
    await expect(slashes(page)).toHaveCount(1);
    await page.reload();
    await ready(tool, page);
    await expect(page.locator('#' + tool.markCellId)).toHaveAttribute('data-mark', 'wrong');
    await expect(slashes(page)).toHaveCount(1);
  });

  test(`[${tool.name}] typing in a slashed cell removes the slash`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await checkWrong(page);
    await page.keyboard.press('KeyX');
    await expect(page.locator('#' + tool.markCellId)).not.toHaveAttribute('data-mark');
    await expect(slashes(page)).toHaveCount(0);
  });

  test(`[${tool.name}] Check cell is disabled on a slashed cell; Reveal turns it into a flag`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await checkWrong(page);
    await expect(page.locator('#check-btn')).toBeDisabled();
    await expect(page.locator('#reveal-btn')).toBeEnabled();
    await clickHelpRow(page, '#reveal-btn');
    await expect(page.locator('#' + tool.markCellId)).toHaveAttribute('data-mark', 'revealed');
    await expect(slashes(page)).toHaveCount(0);
    await expect(page.locator('.mark-layer .mark-revealed')).toHaveCount(1);
  });
}

// ---- Reveal cell — all four tools -----------------------------------------------------
// Fills the active cell with its answer (unless it already holds it) and marks it
// revealed, which locks it. It is a row of the help menu beside Check cell and
// counts one reveal per use (docs/CROSS_TOOL_SPEC.md → "Help menu and help record").

// The cell number of PUZZLE_DATA.letters[i]: ring positions from 0 in Snake Charmer,
// ids from 1 (flat index + 1) elsewhere.
function cellNumOf(tool, i) { return tool.name === 'snake-charmer' ? i : i + 1; }

for (const tool of ALL_TOOLS) {
  const letterEl = page => page.locator('#' + tool.markCellId.replace('cell-', 'letter-'));

  async function savedState(page) {
    return page.evaluate(() => {
      const key = Object.keys(localStorage)[0];
      return key === undefined ? null : JSON.parse(localStorage.getItem(key));
    });
  }

  test(`[${tool.name}] Reveal cell fills an empty cell, marks it correct, and is then disabled`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.markCellId);
    const expected = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);

    await activateCell(page, cell);
    await expect(page.locator('#reveal-btn')).toBeEnabled();
    await expect(page.locator('#help-panel #reveal-btn')).toHaveText('Reveal cell');

    await clickHelpRow(page, '#reveal-btn');
    await expect(letterEl(page)).toHaveText(new RegExp('^' + expected + '$', 'i'));
    await expect(cell).toHaveAttribute('data-mark', 'revealed');
    await expect(letterEl(page)).toHaveAttribute('data-mark', 'revealed');
    await expect(page.locator('#reveal-btn')).toBeDisabled();
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test(`[${tool.name}] Reveal cell replaces a wrong letter`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.markCellId);
    const expected = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);
    const wrong = expected.toLowerCase() === 'z' ? 'Q' : 'Z';

    await activateCell(page, cell);
    await page.locator('#hidden-input').fill(wrong);
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await cell.click();
    await expect(letterEl(page)).toHaveText(new RegExp('^' + wrong + '$', 'i'));

    await clickHelpRow(page, '#reveal-btn');
    await expect(letterEl(page)).toHaveText(new RegExp('^' + expected + '$', 'i'));
    await expect(cell).toHaveAttribute('data-mark');
  });

  test(`[${tool.name}] Reveal cell fills a rebus cell with every letter of its answer`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);
    const { index, answer } = await page.evaluate(() => {
      const letters = window.PUZZLE_DATA.letters;
      const index = letters.findIndex(l => l !== null && l.length > 1);
      return { index, answer: letters[index] };
    });
    const n = cellNumOf(tool, index);

    await page.locator('#cell-' + n).click();
    await clickHelpRow(page, '#reveal-btn');
    await expect(page.locator('#letter-' + n)).toHaveText(new RegExp('^' + answer + '$', 'i'));
    await expect(page.locator('#cell-' + n)).toHaveAttribute('data-mark');
  });

  test(`[${tool.name}] a reveal is counted, saved with the cell, and survives a reload`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.markCellId);
    const other = page.locator('#' + tool.sameEntryCellId);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);

    // One cell checked, another revealed: both marks and both counts are saved.
    await activateCell(page, cell);
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await activateCell(page, cell);
    await clickHelpRow(page, '#check-btn');
    await other.click();
    await clickHelpRow(page, '#reveal-btn');
    await expect(cell).toHaveAttribute('data-mark', 'checked');
    await expect(other).toHaveAttribute('data-mark', 'revealed');
    const saved = await savedState(page);
    assert.deepEqual(saved.help, { checks: 1, reveals: 1 });
    assert.equal(Object.keys(saved.marks).length, 2);

    await page.reload();
    await ready(tool, page);
    await expect(cell).toHaveAttribute('data-mark', 'checked');
    await expect(other).toHaveAttribute('data-mark', 'revealed');
    assert.deepEqual((await savedState(page)).help, { checks: 1, reveals: 1 });
  });

  test(`[${tool.name}] Clear puzzle zeroes the reveal count`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.markCellId);

    await activateCell(page, cell);
    await clickHelpRow(page, '#reveal-btn');
    await page.click('#menu-btn');
    await page.click('#clear-btn');
    await page.click('#clear-btn'); // second click confirms
    await expect(cell).not.toHaveAttribute('data-mark');

    await activateCell(page, cell);
    await clickHelpRow(page, '#reveal-btn');
    assert.deepEqual((await savedState(page)).help, { checks: 0, reveals: 1 });
  });

  // One board is enough: Snake Charmer's circle-8, the smallest plain board at 8 cells.
  // Each engine's reveal-to-completion wiring is covered by 'a board finished by Reveal
  // cell reloads solved, and completes only once' below.
  if (tool.name === 'snake-charmer') test(`[${tool.name}] revealing every cell completes the puzzle once, reporting the reveals`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });
    const ids = await page.locator(tool.readySelector).evaluateAll(els => els.map(e => e.id));

    for (const id of ids) {
      await page.locator('#' + id).click();
      await clickHelpRow(page, '#reveal-btn');
    }

    await expect.poll(() => events.length).toBe(1);
    expect(events[0].reveals).toBe(ids.length);
    expect(events[0].checks).toBe(0);
    await expect(page.locator('#congrats-dialog')).toBeVisible();
  });

}

// Fills every cell with its answer except the first open cell, which gets a wrong letter,
// leaving a full board with one wrong cell (the done-wrong banner). Returns that cell's
// element id. Crushword's cell-1 is a block, so its first open cell comes from letters.
async function fillBoardFirstWrong(tool, page) {
  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  const first = letters.find(l => l !== null);
  const wrong = first.toLowerCase() === 'z' ? 'Q' : 'Z';
  if (tool.ring) {
    const typed = letters.filter(l => l !== null);
    typed[0] = wrong;
    for (const l of typed) await page.keyboard.press(`Key${l.toUpperCase()}`);
    return tool.firstCellId;
  }
  const pairs = letters.map((letter, i) => ({ id: i + 1, letter })).filter(p => p.letter !== null);
  pairs[0].letter = wrong;
  for (const { id, letter } of pairs) {
    await page.locator('#cell-' + id).click();
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    await page.keyboard.press('Enter');
  }
  return 'cell-' + pairs[0].id;
}

// The commonest way to finish with Reveal: fill the board, get the done-wrong banner,
// then reveal the wrong cell. The reveal completes the board, so its save must come after
// the solved painting: a save taken before it keeps only the revealed cell as correct,
// and the board reloads looking unsolved (done-wrong banner) with the completion latch
// open, so the next keystroke fires a second completion event.
for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] a board finished by Reveal cell reloads solved, and completes only once`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });

    const firstId = await fillBoardFirstWrong(tool, page);
    await expect(page.locator('#done-wrong')).toBeVisible();

    await page.locator('#' + firstId).click();
    await clickHelpRow(page, '#reveal-btn');
    await expect.poll(() => events.length).toBe(1);

    await page.reload();
    await ready(tool, page);
    await expect(page.locator('#done-wrong')).toBeHidden();
    await expect(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);
    await expect(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(1);
    await expect(page.locator('#' + firstId)).toHaveAttribute('data-mark', 'revealed');

    // The latch is sealed on reload, so typing on the solved board announces nothing.
    const again = [];
    await page.exposeFunction('__vpAgain', d => again.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpAgain(e.detail));
    });
    await page.keyboard.press('KeyA');
    await page.waitForTimeout(300);
    expect(again).toEqual([]);
    await expect(page.locator('#congrats-dialog')).toBeHidden();
  });

  // A board solved before this release saved every cell checked; it must restore solved.
  test(`[${tool.name}] a save whose cells are all checked restores solved`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await tool.solveBoard(page);
    await expect(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);
    await rewriteSaveOnNextLoad(page, saved => {
      saved.marks = Object.fromEntries(Object.keys(saved.letters).map(k => [k, 'checked']));
    });
    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.addInitScript(() => document.addEventListener('varietypack:complete',
      e => window.__vpComplete(e.detail)));
    await page.reload();
    await ready(tool, page);
    const total = await page.locator(tool.readySelector).count();
    await expect(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);
    await expect(page.locator(tool.readySelector + '[data-mark="checked"]')).toHaveCount(total);
    await expect(page.locator('#done-wrong')).toBeHidden();
    for (const id of ['#check-btn', '#reveal-btn', '#check-puzzle-btn', '#reveal-puzzle-btn']) {
      await expect(page.locator(id)).toBeDisabled();
    }
    const letter = page.locator('#' + tool.markCellId.replace('cell-', 'letter-'));
    const before = await letter.textContent();
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(300);
    await expect(letter).toHaveText(before);
    expect(events).toEqual([]);
  });

  // Checked and revealed marks (docs/CROSS_TOOL_SPEC.md → "Cell marks").
  const markLetter = page => page.locator('#' + tool.markCellId.replace('cell-', 'letter-'));

  // No Enter even in Crushword: its just-typed cell is still composing, and Reveal must
  // leave its letter as in the other tools. The solver asked, so it is revealed.
  test(`[${tool.name}] Reveal cell on a cell just typed right marks it revealed and keeps its letter`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.markCellId);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);

    await activateCell(page, cell);
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    await activateCell(page, cell);   // the ring tools advance past it; Crushword stays
    await clickHelpRow(page, '#reveal-btn');
    await expect(cell).toHaveAttribute('data-mark', 'revealed');
    await expect(markLetter(page)).toHaveText(new RegExp('^' + letter + '$', 'i'));
  });

  test(`[${tool.name}] Reveal puzzle keeps checked and revealed apart`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.markCellId);
    const other = page.locator('#' + tool.sameEntryCellId);
    const letter = await page.evaluate(i => window.PUZZLE_DATA.letters[i], tool.markLetterIndex);

    await activateCell(page, cell);
    await page.locator('#hidden-input').fill(letter.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await activateCell(page, cell);
    await clickHelpRow(page, '#check-btn');
    await other.click();
    await clickHelpRow(page, '#reveal-btn');
    await page.locator('#help-btn').click();
    await page.locator('#reveal-puzzle-btn').click(); // arms
    await page.locator('#reveal-puzzle-btn').click(); // confirms
    await expect(cell).toHaveAttribute('data-mark', 'checked');
    await expect(other).toHaveAttribute('data-mark', 'revealed');
    await expect(page.locator(tool.readySelector + ':not([data-mark])')).toHaveCount(0);
  });

  // The flag is drawn by the mark layer (setupMarkLayer), clipped to the cell it marks.
  const flags = page => page.locator('.mark-layer .mark-revealed');

  test(`[${tool.name}] Reveal cell draws one flag clipped to that cell`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const cell = page.locator('#' + tool.markCellId);
    await activateCell(page, cell);
    await expect(flags(page)).toHaveCount(0);
    await clickHelpRow(page, '#reveal-btn');
    await expect(flags(page)).toHaveCount(1);
    const n = tool.markCellId.replace('cell-', '');
    await expect(flags(page)).toHaveAttribute('clip-path', `url(#mark-clip-${n})`);
    await expect(flags(page).locator('.mark-flag')).toBeVisible();
    // A checked cell draws no shape: its mark is the letter's color.
    await expect(page.locator('.mark-layer .mark-shape')).toHaveCount(1);
  });

  test(`[${tool.name}] Clear removes every flag`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#reveal-btn');
    await page.locator('#' + tool.sameEntryCellId).click();
    await clickHelpRow(page, '#reveal-btn');
    await expect(flags(page)).toHaveCount(2);

    await page.click('#menu-btn');
    await page.click('#clear-btn');
    await page.click('#clear-btn'); // second click confirms
    await expect(flags(page)).toHaveCount(0);
  });

  test(`[${tool.name}] the flag is hidden in print`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await activateCell(page, page.locator('#' + tool.markCellId));
    await clickHelpRow(page, '#reveal-btn');
    await expect(flags(page)).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.mark-layer')).toBeHidden();
  });
}


// ---- Check clue and Reveal clue — all four tools -------------------------------------
// They act on the active clue's cells: its entry, or in Marching Bands its row or band
// (whose entry boundaries stay hidden). Each counts one check or one reveal, and only if
// something ran (docs/CROSS_TOOL_SPEC.md → "Help menu and help record").

for (const tool of ALL_TOOLS) {
  // The active clue's cells: the highlighted entry plus the active cell, which some
  // engines leave out of the highlight.
  const clueIds = page => page.evaluate(sel => Array.from(document.querySelectorAll(
    `${sel}.active-entry, ${sel}.active-cell`)).map(e => e.id), tool.readySelector);

  async function savedState(page) {
    return page.evaluate(() => {
      const key = Object.keys(localStorage)[0];
      return key === undefined ? null : JSON.parse(localStorage.getItem(key));
    });
  }

  test(`[${tool.name}] Reveal clue fills and marks every cell of the active clue, and no other`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const ids = await clueIds(page);
    expect(ids.length).toBeGreaterThan(1);

    await clickHelpRow(page, '#reveal-clue-btn');

    for (const id of ids) await expect(page.locator('#' + id)).toHaveAttribute('data-mark');
    await expect(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(ids.length);
    const saved = await savedState(page);
    assert.deepEqual(saved.help, { checks: 0, reveals: 1 });
    await expect(page.locator('#reveal-clue-btn')).toBeDisabled();
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test(`[${tool.name}] Check clue marks the clue's right cells checked and the wrong one wrong, flashes it, and counts one check`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const firstId = await fillBoardFirstWrong(tool, page);
    await page.locator('#' + firstId).click();
    const ids = await clueIds(page);
    expect(ids).toContain(firstId);
    await page.evaluate(() => localStorage.clear());

    await clickHelpRow(page, '#check-clue-btn');

    await expect(page.locator('#' + firstId)).toHaveAttribute('data-mark', 'wrong');
    await expect(page.locator(tool.readySelector + '[data-mark="checked"]')).toHaveCount(ids.length - 1);
    for (const id of ids.filter(i => i !== firstId)) {
      await expect(page.locator('#' + id)).toHaveAttribute('data-mark', 'checked');
    }
    await expect(page.locator('.flash-wrong-overlay').first()).toBeAttached();
    const saved = await savedState(page);
    assert.deepEqual(saved.help, { checks: 1, reveals: 0 });
    assert.equal(Object.keys(saved.marks).length, ids.length);
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test(`[${tool.name}] Reveal clue that finishes the board saves it solved and completes once`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });
    const total = await page.locator(tool.readySelector).count();
    const firstId = await fillBoardFirstWrong(tool, page);
    await page.locator('#' + firstId).click();

    await clickHelpRow(page, '#reveal-clue-btn');
    await expect.poll(() => events.length).toBe(1);
    expect(events[0].reveals).toBe(1);

    await page.reload();
    await ready(tool, page);
    await expect(page.locator('#done-wrong')).toBeHidden();
    await expect(page.locator(tool.boardSelector)).toHaveClass(/\bsolved\b/);
    // Only the clue's cells were revealed; the rest were typed and stay unmarked.
    const revealed = await page.locator(tool.readySelector + '[data-mark="revealed"]').count();
    expect(revealed).toBeGreaterThan(0);
    expect(revealed).toBeLessThan(total);
  });

}


// ---- Check puzzle and Reveal puzzle — all four tools --------------------------------
// They act on every cell. Reveal puzzle discards the solver's effort, so it arms on the
// first click ("Are you sure?", as Clear puzzle does) and acts on the second.

for (const tool of ALL_TOOLS) {
  async function savedState(page) {
    return page.evaluate(() => {
      const key = Object.keys(localStorage)[0];
      return key === undefined ? null : JSON.parse(localStorage.getItem(key));
    });
  }

  test(`[${tool.name}] on an empty board the Check rows are disabled, the Reveal rows are not, and nothing is saved`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#check-clue-btn')).toBeDisabled();
    await expect(page.locator('#reveal-clue-btn')).toBeEnabled();
    await expect(page.locator('#check-puzzle-btn')).toBeDisabled();
    await expect(page.locator('#reveal-puzzle-btn')).toBeEnabled();
    assert.equal(await page.evaluate(() => localStorage.length), 0);
  });

  test(`[${tool.name}] Check puzzle checks every right cell, slashes and flashes the wrong one, and counts one check`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const total = await page.locator(tool.readySelector).count();
    const firstId = await fillBoardFirstWrong(tool, page);
    await expect(page.locator('#check-puzzle-btn')).toBeEnabled();
    await page.evaluate(() => localStorage.clear());

    await clickHelpRow(page, '#check-puzzle-btn');

    await expect(page.locator(tool.readySelector + '[data-mark="checked"]')).toHaveCount(total - 1);
    await expect(page.locator('#' + firstId)).toHaveAttribute('data-mark', 'wrong');
    await expect(page.locator('.mark-layer .mark-wrong')).toHaveCount(1);
    await expect(page.locator('.flash-wrong-overlay').first()).toBeAttached();
    const saved = await savedState(page);
    assert.deepEqual(saved.help, { checks: 1, reveals: 0 });
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test(`[${tool.name}] Reveal puzzle arms on the first click and changes nothing`, async ({ page }) => {
    // A fake clock, paused once the page is ready, so the 3s lapse happens only when
    // fast-forwarded below, not waited out. Nothing else here depends on time.
    await page.clock.install();
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await page.locator('#help-btn').click();
    const before = await page.locator('#help-panel').boundingBox();

    await page.locator('#reveal-puzzle-btn').click();

    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Are you sure?');
    await expect(page.locator('#help-panel')).toBeVisible(); // arming keeps the menu open
    await expect(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(0);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    // Reserved width: the panel does not resize when the label swaps.
    expect(await page.locator('#help-panel').boundingBox()).toEqual(before);
    // And it lapses if left alone, as Clear's does. The unit test in
    // shared/test/engine-chrome.armed-button.test.js pins the 3s; this checks the wiring.
    await page.clock.fastForward(3000);
    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Reveal puzzle');
  });

  test(`[${tool.name}] confirming Reveal puzzle completes the puzzle once, saved solved`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });
    const total = await page.locator(tool.readySelector).count();

    await page.locator('#help-btn').click();
    await page.locator('#reveal-puzzle-btn').click(); // arms
    await page.locator('#reveal-puzzle-btn').click(); // confirms

    await expect.poll(() => events.length).toBe(1);
    expect(events[0].reveals).toBe(1);
    expect(events[0].checks).toBe(0);
    await expect(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(total);
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#reveal-puzzle-btn')).toBeDisabled();
    await expect(page.locator('#check-puzzle-btn')).toBeDisabled();

    await page.reload();
    await ready(tool, page);
    await expect(page.locator('#done-wrong')).toBeHidden();
    await expect(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(total);
  });

}


// ---- An armed button disarms when its menu closes — all four tools ------------------
// Escape, typing or a click away is how a solver cancels. If the arm survived the menu
// closing, reopening it a moment later would let a single click run the destructive
// action. The label checks use a short timeout because the arm also lapses by itself
// after 3s, which a default-length retry would wait out.

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] Reveal puzzle disarms when the help menu closes`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#help-btn').click();
    await page.locator('#reveal-puzzle-btn').click();
    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Are you sure?');
    await page.keyboard.press('Escape');
    await expect(page.locator('#help-panel')).toBeHidden();

    await page.locator('#help-btn').click();
    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Reveal puzzle', { timeout: 1000 });
    await page.locator('#reveal-puzzle-btn').click(); // one click arms again, nothing more
    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Are you sure?');
    await expect(page.locator(tool.readySelector + '[data-mark]')).toHaveCount(0);
  });

  test(`[${tool.name}] Reveal puzzle disarms when another row is used`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#help-btn').click();
    await page.locator('#reveal-puzzle-btn').click();
    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Are you sure?');
    await page.locator('#reveal-btn').click(); // Reveal cell, which closes the panel

    await page.locator('#help-btn').click();
    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Reveal puzzle', { timeout: 1000 });
  });

  test(`[${tool.name}] Clear puzzle disarms when the options menu closes`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#menu-btn').click();
    await page.locator('#clear-btn').click();
    await expect(page.locator('#clear-btn')).toHaveText('Are you sure?');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-panel')).toBeHidden();

    await page.locator('#menu-btn').click();
    await expect(page.locator('#clear-btn')).toHaveText('Clear puzzle', { timeout: 1000 });
  });
}


// ---- Help menu: focus, guards and the help record's edges — all four tools ------------

for (const tool of ALL_TOOLS) {
  async function savedState(page) {
    return page.evaluate(() => {
      const key = Object.keys(localStorage)[0];
      return key === undefined ? null : JSON.parse(localStorage.getItem(key));
    });
  }

  // A click on a disabled row, or on the panel's padding, lands on no control. It must
  // not take focus from the puzzle: typing straight afterwards has to reach it.
  test(`[${tool.name}] clicking a disabled row or the panel's padding keeps focus on the puzzle`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#help-btn').click();
    await expect(page.locator('#check-puzzle-btn')).toBeDisabled(); // an empty board
    await page.locator('#check-puzzle-btn').click({ force: true });
    await expect(page.locator('#hidden-input')).toBeFocused();
    await page.locator('#help-panel').click({ position: { x: 2, y: 2 } });
    await expect(page.locator('#hidden-input')).toBeFocused();
    await expect(page.locator('#help-panel')).toBeVisible(); // neither click closes it

    await page.locator('#menu-btn').click();
    await page.locator('#menu-panel').click({ position: { x: 2, y: 2 } });
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  // The buttons are disabled when they have nothing to act on, but the actions guard
  // themselves: a click that gets through anyway counts nothing and writes nothing.
  test(`[${tool.name}] a check with nothing to check counts nothing even when its button is forced`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.evaluate(() => {
      for (const id of ['check-btn', 'check-clue-btn', 'check-puzzle-btn']) {
        const b = document.getElementById(id);
        b.disabled = false;
        b.click();
      }
    });
    assert.equal(await page.evaluate(() => localStorage.length), 0);
  });

  test(`[${tool.name}] a reveal with nothing to reveal counts nothing even when its button is forced`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await page.locator('#help-btn').click();
    await page.locator('#reveal-puzzle-btn').click();
    await page.locator('#reveal-puzzle-btn').click(); // everything is correct now
    await expect.poll(async () => (await savedState(page))?.help?.reveals).toBe(1);

    await page.evaluate(() => {
      for (const id of ['reveal-btn', 'reveal-clue-btn', 'reveal-puzzle-btn']) {
        const b = document.getElementById(id);
        b.disabled = false;
        b.click();
        b.click(); // the puzzle row arms on the first click
      }
    });
    assert.equal((await savedState(page)).help.reveals, 1);
  });

  test(`[${tool.name}] a puzzle finished from a save written without a help record reports zero help`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const firstId = await fillBoardFirstWrong(tool, page);
    const first = await page.evaluate(() => window.PUZZLE_DATA.letters.find(l => l !== null));

    // An older save has no `help`.
    await rewriteSaveOnNextLoad(page, s => { delete s.help; });
    await page.reload();
    await ready(tool, page);
    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });

    await page.locator('#' + firstId).click();
    if (!tool.ring) await page.keyboard.press('Backspace'); // Crushword inserts at the cursor
    await page.locator('#hidden-input').fill(first.toUpperCase());
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');

    await expect.poll(() => events.length).toBe(1);
    expect(events[0].checks).toBe(0);
    expect(events[0].reveals).toBe(0);
  });
}


// The clue bar reserves its right gutter for the buttons that share its band: ☰ alone
// (60px), or ☰ and the help button (100px). A hashed page has no help button, so it keeps
// the narrower gutter and its clues wrap no earlier than they must.
for (const tool of ALL_TOOLS.filter(t => t.name !== 'marching-bands')) {
  test(`[${tool.name}] the clue bar's right gutter fits the help button only when there is one`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#active-clue-bar')).toHaveCSS('padding-right', '100px');

    await page.goto('file://' + tool.paths.hashed);
    await ready(tool, page);
    await expect(page.locator('#active-clue-bar')).toHaveCSS('padding-right', '60px');
  });
}

// ---- Keyboard route to the menus ------------------------------------------------------
// Escape steps out of the puzzle onto the page's buttons, where native Tab works. All of
// it is shared code (setupKeydown, setupPopupMenu), so only the first two tests loop over
// the tools; the rest run on Crushword.
// docs/CROSS_TOOL_SPEC.md → "Escape — leaving the puzzle".

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] Escape moves focus from the puzzle to the help button, and Escape again returns it`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#help-btn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test(`[${tool.name}] the shortcuts table lists Esc`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.locator('#keys-btn').click();
    const row = page.locator('#keys-overlay tr').filter({ has: page.locator('kbd', { hasText: /^Esc$/ }) });
    await expect(row.locator('td').nth(1)).toHaveText('Go to the menus');
  });
}

// Playwright's WebKit on macOS honors Safari's "Press Tab to highlight each item" setting
// and so skips buttons on Tab; on Linux it tabs to them.
const MAC_WEBKIT_NO_TAB = 'macOS WebKit does not Tab to buttons';

{
  const tool = TOOLS.find(t => t.name === 'crushword');

  test('[crushword] in a hashed build Escape lands on the options button', async ({ page }) => {
    await page.goto('file://' + tool.paths.hashed);
    await ready(tool, page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-btn')).toBeFocused();
  });

  test('[crushword] Tab from the help button reaches the options button, then the shortcuts button', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.platform === 'darwin', MAC_WEBKIT_NO_TAB);
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(page.locator('#menu-btn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#keys-btn')).toBeFocused();
  });

  test('[crushword] Escape with a mouse-opened menu closes it and leaves focus on the puzzle', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.locator('#help-btn').click();
    await expect(page.locator('#help-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#hidden-input')).toBeFocused();
    await expect(page.locator('#help-btn')).not.toBeFocused();
  });

  test('[crushword] Escape in the shortcuts dialog closes it and leaves focus on the puzzle', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.locator('#keys-btn').click();
    await expect(page.locator('#keys-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#keys-overlay')).toBeHidden();
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  // On a fresh board Check cell and Check clue are disabled; the Reveal rows are not.
  async function openHelpByKeyboard(page) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect(page.locator('#help-panel')).toBeVisible();
  }

  test('[crushword] Enter on the help button opens the menu with focus on its first enabled row', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await expect(page.locator('#reveal-btn')).toBeFocused();
    await expect(page.locator('#help-btn')).toHaveAttribute('aria-expanded', 'true');
  });

  test('[crushword] arrow keys move between enabled rows and wrap; Home and End jump', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#reveal-clue-btn')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#reveal-btn')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#reveal-puzzle-btn')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#reveal-btn')).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.locator('#reveal-puzzle-btn')).toBeFocused();
  });

  test('[crushword] ArrowDown on the help button opens the menu too', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#help-panel')).toBeVisible();
    await expect(page.locator('#reveal-btn')).toBeFocused();
  });

  test('[crushword] Escape in an open menu closes it and focuses its button', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#help-btn')).toBeFocused();
  });

  test('[crushword] Tab in an open menu closes it and moves focus on', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.platform === 'darwin', MAC_WEBKIT_NO_TAB);
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#menu-btn')).toBeFocused();
  });

  test('[crushword] Enter on a row acts, closes the menu and returns focus to the puzzle', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#hidden-input')).toBeFocused();
    await expect(page.locator('.cell-letter').filter({ hasText: /./ })).toHaveCount(1);
  });

  test('[crushword] a letter typed in an open menu neither closes it nor reaches the grid', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    const before = await page.evaluate(() => document.getElementById('hidden-input').value);
    await page.keyboard.press('KeyQ');
    await expect(page.locator('#help-panel')).toBeVisible();
    await expect(page.locator('#reveal-btn')).toBeFocused();
    expect(await page.evaluate(() => document.getElementById('hidden-input').value)).toBe(before);
    await expect(page.locator('.cell-letter').filter({ hasText: /./ })).toHaveCount(0);
  });

  test('[crushword] menu rows carry menu-item roles', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#reveal-btn')).toHaveAttribute('role', 'menuitem');
    await expect(page.locator('#clear-btn')).toHaveAttribute('role', 'menuitem');
  });

  test('[crushword] Clear from the keyboard: Enter arms and keeps focus, Enter again clears and returns focus to the puzzle', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && process.platform === 'darwin', MAC_WEBKIT_NO_TAB);
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.keyboard.press('KeyA');
    await expect(page.locator('.cell-letter').filter({ hasText: /./ })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(page.locator('#menu-btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#clear-btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#clear-btn')).toHaveText('Are you sure?');
    await expect(page.locator('#clear-btn')).toBeFocused();
    await expect(page.locator('#menu-panel')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menu-panel')).toBeHidden();
    await expect(page.locator('#hidden-input')).toBeFocused();
    await expect(page.locator('.cell-letter').filter({ hasText: /./ })).toHaveCount(0);
  });

  test('[crushword] Reveal puzzle from the keyboard arms, then reveals', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.keyboard.press('End');
    await expect(page.locator('#reveal-puzzle-btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#reveal-puzzle-btn')).toHaveText('Are you sure?');
    await expect(page.locator('#reveal-puzzle-btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#help-panel')).toBeHidden();
    const cells = await page.locator('.cell-letter').count();
    await expect(page.locator('.cell-letter').filter({ hasText: /./ })).toHaveCount(cells);
  });

  test('[crushword] Escape with a modifier, or one that ends IME composition, leaves focus on the puzzle', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    for (const chord of ['Shift+Escape', 'Alt+Escape', 'Control+Escape']) {
      await page.keyboard.press(chord);
      await expect(page.locator('#hidden-input'), chord).toBeFocused();
    }
    await page.evaluate(() => document.getElementById('hidden-input').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })));
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test('[crushword] a keyboard open of the help menu does nothing while every row is disabled', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter'); // Reveal puzzle: confirmed, so every cell is correct
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#congrats-dialog')).toBeVisible(); // a revealed finish still celebrates
    await page.keyboard.press('Escape');
    await expect(page.locator('#congrats-dialog')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#help-btn')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#help-panel')).toBeHidden();
    await expect(page.locator('#help-btn')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#help-btn')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  // Closing a dialog can restore focus to the row that opened it, after its menu has
  // closed; the browser drops focus from a hidden element only at its next frame.
  test('[crushword] keys pressed while focus is still on a row of a closed menu act as if on the puzzle', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.evaluate(() => {
      const row = document.activeElement;
      document.getElementById('help-panel').hidden = true;
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(page.locator('#help-btn')).toBeFocused();
  });

  test('[crushword] a letter typed while focus is still on a row of a closed menu reaches the grid', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await openHelpByKeyboard(page);
    await page.evaluate(() => {
      const row = document.activeElement;
      document.getElementById('help-panel').hidden = true;
      row.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    await expect(page.locator('#hidden-input')).toBeFocused();
  });

  test('[crushword] Escape while focus is still on a button of a just-closed dialog goes to the menus', async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await page.evaluate(() => {
      const dialog = document.getElementById('keys-overlay');
      const btn = document.getElementById('keys-close');
      dialog.show(); // non-modal, so the page stays live behind it
      btn.focus();
      dialog.removeAttribute('open'); // hidden, but the browser drops focus only next frame
      btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await expect(page.locator('#help-btn')).toBeFocused();
  });
}
