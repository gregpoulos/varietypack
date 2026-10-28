'use strict';

// Behaviors the engines share, each test body written once over a per-tool adapter table
// (TOOLS). A test loops over the tools only where each engine implements the behavior or
// wires it with arguments of its own; one that lives entirely in shared code runs on one
// tool (root CLAUDE.md → "An e2e loop over tools follows the code"). RING_TOOLS (spiral,
// snake-charmer, marching-bands) is for where Crushword differs — it has no rebus button
// (its cells compose on every keystroke) and different solve plumbing, so those copies
// stay in e2e/crushword.spec.js. Marching Bands marks no clue item .correct, so its
// rebus-solve test stays in its own spec.

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const yaml = require('js-yaml');
const { typeCell, solveCrushwordBoard, solveRingBoard } = require('./helpers');
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
    ring: true,
    buildPuzzle: require('../spiral/cli').buildPuzzle,
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
    // Cells and clue items the non-hashed rebus fixture marks .correct on solve.
    rebusCorrectCells: 40, rebusCorrectClueItems: 16,
    markCellId: 'cell-1', markLetterIndex: 0, sameEntryCellId: 'cell-2',
  },
  {
    name: 'snake-charmer',
    kind: 'snake-charmer',
    ring: true,
    buildPuzzle: require('../snake-charmer/cli').buildPuzzle,
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
    rebusCorrectCells: 8, rebusCorrectClueItems: 5,
    markCellId: 'cell-0', markLetterIndex: 0, sameEntryCellId: 'cell-1',
  },
  {
    name: 'marching-bands',
    kind: 'marching-bands',
    ring: true,
    buildPuzzle: require('../marching-bands/cli').buildPuzzle,
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
    // No rebusCorrect* fields: Marching Bands marks no clue item .correct, so its
    // rebus-solve test stays in e2e/marching-bands.spec.js.
    markCellId: 'cell-1', markLetterIndex: 0, sameEntryCellId: 'cell-2',
  },
  {
    name: 'crushword',
    kind: 'crushword',
    ring: false,
    buildPuzzle: require('../crushword/cli').buildPuzzle,
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
    tool.buildPuzzle(path.join(tool.fixDir, tool.plainFixture),  tool.paths.plain);
    tool.buildPuzzle(path.join(tool.fixDir, tool.hashedFixture), tool.paths.hashed);
    tool.buildPuzzle(path.join(tool.fixDir, tool.rebusFixture),  tool.paths.rebus);
    if (tool.ring) {
      tool.paths.rebusHashed = path.join(tmpDir, 'rebus-hashed.html');
      tool.buildPuzzle(path.join(tool.fixDir, tool.rebusHashedFixture), tool.paths.rebusHashed);
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

// ---- D: congrats dialog on solve — ring tools -----------------------------------------

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] congrats dialog opens on solve with solve time and action buttons`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await expect(page.locator('#congrats-dialog')).toBeHidden();

    await tool.solveBoard(page);

    await expect(page.locator('#congrats-dialog')).toBeVisible();
    await expect(page.locator('#congrats-time')).toBeVisible();
    const timeText = await page.locator('#congrats-time').textContent();
    expect(timeText).toMatch(/^Solved in \d+:\d{2}$/);
    await expect(page.locator('#congrats-copy-btn')).toBeVisible();
    await expect(page.locator('#congrats-play-btn')).toBeVisible();
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
    tool.buildPuzzle(path.join(tool.fixDir, 'test-100.yaml'), out, {});
    await page.goto('file://' + out);
    await ready(tool, page);
    // Not toBeHidden(): an empty byline is already 0px tall, yet its margin still
    // takes space. display:none is what removes the margin too.
    await expect(page.locator('.byline')).toHaveCSS('display', 'none');
  });
}

// ---- G: the controls row keeps its size — all four tools ------------------------------
// The controls row must keep its natural size: hiding Check Cell may not move anything,
// and nothing measured at load may pin a width the window can later shrink below (a
// window narrowed after load).
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

  // The click focuses the checkbox; the toggle hands focus back, so typing goes on.
  test(`[${tool.name}] hiding Check Cell leaves the controls row the same size and focus on the puzzle`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    const before = await page.locator('#controls').boundingBox();
    await page.click('#menu-btn');
    await page.click('#check-btn-toggle');
    await expect(page.locator('#check-btn')).toBeHidden();
    expect(await page.locator('#controls').boundingBox()).toEqual(before);
    await expect(page.locator('#hidden-input')).toBeFocused();
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

// ---- J: Play again resets the board — ring tools --------------------------------------

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] Play again button resets the board and re-enables input`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    await tool.solveBoard(page);
    await expect(page.locator('#congrats-dialog')).toBeVisible();

    await page.click('#congrats-play-btn');
    await expect(page.locator('#congrats-dialog')).toBeHidden();

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
  });
}

// ---- K: completion event payload — all four tools -------------------------------------
// The core payload contract (kind, boardHash shape, solution hashes to it, timeMs,
// exactly one postMessage with solution stripped) is identical across all four
// engines. The payload's title passthrough isn't a completion-event concern, and the
// postMessage repeats the event's own fields, so neither is asserted separately.

for (const tool of ALL_TOOLS) {
  test(`[${tool.name}] completion event fires with correct payload on solve`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);

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

    await tool.solveBoard(page);

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
  });
}

// ---- L: a typed first cell: storage, print, digits — all four tools -------------------
// The save timing contract (docs/CROSS_TOOL_SPEC.md → "localStorage key format"): a wrong
// guess mutates no persisted state and must not write; a correct guess does. A save
// another board made is not restored. Every tool's rebus fixture answers its first cell
// 'A', so 'Z' is uniformly wrong.

for (const tool of ALL_TOOLS) {
  async function enterFirstCell(page, letter) {
    await page.locator('#hidden-input').fill(letter);
    if (tool.commitAfterFirstFill) await page.keyboard.press('Enter');
    await page.locator('#' + tool.firstCellId).click();
  }

  test(`[${tool.name}] a wrong guess from Check Cell does not write to localStorage`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, 'Z'); // deliberately wrong
    await page.evaluate(() => localStorage.clear());

    await page.locator('#check-btn').click();

    await expect(page.locator('#' + tool.firstCellId)).not.toHaveClass(/correct/);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
  });

  test(`[${tool.name}] a correct guess from Check Cell does write to localStorage`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, 'A');
    await page.evaluate(() => localStorage.clear());

    await page.locator('#check-btn').click();

    await expect(page.locator('#' + tool.firstCellId)).toHaveClass(/correct/);
    assert.equal(await page.evaluate(() => localStorage.length), 1);
  });

  // A save made for another board under the same storageKey (Crushword's hash leaves out
  // where the blocks are) names cells this one lacks; restoring it would write to them.
  test(`[${tool.name}] a save naming a cell the board lacks is ignored`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    await enterFirstCell(page, 'Z');
    // Edited on the reload itself: leaving the page saves again (the timer's visibility
    // flush), which would overwrite an edit made before it.
    await page.addInitScript(() => {
      const key = Object.keys(localStorage).find(k => !k.endsWith(':showCheckBtn'));
      const saved = JSON.parse(localStorage.getItem(key));
      saved.letters[99999] = 'q';
      localStorage.setItem(key, JSON.stringify(saved));
    });
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

    // Printing always yields a blank puzzle (docs/CROSS_TOOL_SPEC.md → Print-mode state
    // erasure).
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

// ---- P: hashed rebus preimage matches boardHash — ring tools --------------------------
// Crushword has no equivalent: it builds an unused rebusHashedPath fixture in its
// own spec but never had a dedicated hashed-rebus completion test to pair it with.

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] a hashed rebus puzzle solves end to end and its preimage matches boardHash`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebusHashed);
    await ready(tool, page);

    const events = [];
    await page.exposeFunction('__vpComplete', d => events.push(d));
    await page.evaluate(() => {
      document.querySelector('.puzzle-main')
        .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
    });

    for (const cell of tool.REBUS_CELLS) await typeCell(page, cell);

    await expect.poll(() => events.length).toBe(1);
    const detail = events[0];
    expect(detail.solution).toBe(tool.REBUS_CELLS.map(c => c.toLowerCase()).join('.'));

    const recomputed = sha256hex(detail.solution);
    expect(recomputed).toBe(detail.boardHash);
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
    await page.click('#check-btn');
    await expect(marked).toHaveClass(/\bcorrect\b/);

    // Move the cursor to another cell of the same entry, so the marked cell is part
    // of the active entry without being the active cell.
    await page.locator(`#${tool.sameEntryCellId}`).click();
    await expect(marked).toHaveClass(/\bcorrect\b/);
    await expect(marked).toHaveClass(/\bactive-entry\b/);
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

    await check.click();
    await expect(marked).toHaveClass(/\bcorrect\b/);
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
  test(`[${tool.name}] banners are state-derived and partial correctness stays hidden`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);
    await expect(page.locator('#congrats')).toBeHidden();
    await expect(page.locator('#done-wrong')).toBeHidden();

    // Typing the letters in order fills the board; make the first cell wrong.
    const letters = await filledLetters(page);
    const wrongFirst = letters[0].toLowerCase() === 'z' ? 'y' : 'z';
    for (const ch of [wrongFirst, ...letters.slice(1)]) await page.keyboard.type(ch);

    // Full but wrong: done-wrong shows, congrats does not, nothing marked correct.
    await expect(page.locator('#done-wrong')).toBeVisible();
    await expect(page.locator('#congrats')).toBeHidden();
    await expect(page.locator(`${tool.readySelector}.correct`)).toHaveCount(0);

    // The cursor wrapped back to the wrong first cell. Clearing it leaves the board
    // unfull, so the banner must hide immediately (state-derived, no timeout).
    await page.keyboard.press('Backspace');
    await expect(page.locator('#done-wrong')).toBeHidden();

    // Re-type the correct first letter → board full and entirely correct → congrats.
    await page.keyboard.type(letters[0]);
    await expect(page.locator('#congrats')).toBeVisible();
    await expect(page.locator('#done-wrong')).toBeHidden();
  });

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
    await expect(page.locator(`${tool.readySelector}.correct`)).toHaveCount(0);
    await expect(page.locator('#congrats')).toBeHidden();
    await expect(page.locator('#done-wrong')).toBeHidden();
    await expect(page.locator('#check-btn')).toBeHidden();
  });

  test(`[${tool.name}] .correct cells render with white fill under print media`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    for (const ch of await filledLetters(page)) await page.keyboard.type(ch);
    await expect(page.locator('#congrats')).toBeVisible();
    await expect(page.locator('#' + tool.markCellId)).toHaveClass(/correct/);

    // On screen a correct cell carries the highlight fill (not white).
    const fillOf = () => page.evaluate(
      id => getComputedStyle(document.getElementById(id)).fill, tool.markCellId);
    expect(await fillOf()).not.toBe('rgb(255, 255, 255)');

    // Under print the correct-state fill must reset to white
    // (shared/themes/print-base.css).
    await page.emulateMedia({ media: 'print' });
    expect(await fillOf()).toBe('rgb(255, 255, 255)');
    // Correct letters print blank too, not just their cells.
    expect(await page.locator('.cell-letter.correct').count()).toBeGreaterThan(0);
    await expect(page.locator('.cell-letter.correct:visible')).toHaveCount(0);
  });

  test(`[${tool.name}] board is locked after solve — input and Backspace are ignored`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    for (const ch of await filledLetters(page)) await page.keyboard.type(ch);
    await expect(page.locator('#congrats-dialog')).toBeVisible();

    // Close dialog without play-again so the board stays locked.
    await page.keyboard.press('Escape');
    await expect(page.locator('#congrats-dialog')).toBeHidden();

    // Two separate guards: typing is refused by the input handler's latch.solved check,
    // Backspace by the keydown handler's. Removing either one turns this red on its own.
    const before = await page.locator('.cell-letter').allTextContents();
    await page.keyboard.type('ZZZZZ');
    await page.keyboard.press('Backspace');
    expect(await page.locator('.cell-letter').allTextContents()).toEqual(before);
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

// Marching Bands never marks clue items correct (its clue groups hide entry boundaries;
// marking them would spoil the puzzle), so its own copy stays in
// e2e/marching-bands.spec.js.
for (const tool of RING_TOOLS.filter(t => t.rebusCorrectClueItems !== undefined)) {
  test(`[${tool.name}] a non-hashed rebus puzzle marks every cell and clue item correct on solve`, async ({ page }) => {
    await page.goto('file://' + tool.paths.rebus);
    await ready(tool, page);

    for (const cell of tool.REBUS_CELLS) await typeCell(page, cell);

    await expect(page.locator('#congrats')).toBeVisible();
    await expect(page.locator('.cell.correct')).toHaveCount(tool.rebusCorrectCells);
    await expect(page.locator('.clue-item.correct')).toHaveCount(tool.rebusCorrectClueItems);
  });
}

// ---- W: filled clues — all four tools (Marching Bands never marks one) ----------------
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

  test(`[${tool.name}] a solved board marks every clue .correct without restyling its text`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const color = () => page.locator('.clue-item .clue-text').first().evaluate(el => getComputedStyle(el).color);
    const before = await color();
    await tool.solveBoard(page);
    const total = await page.locator('.clue-item').count();
    await expect(page.locator('.clue-item.correct')).toHaveCount(total);
    await expect(page.locator('.clue-item.filled')).toHaveCount(total);
    expect(await color()).toBe(before);
    for (const text of await page.locator('.clue-item .clue-text').all()) {
      await expect(text).toHaveCSS('text-decoration-line', 'none');
    }
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
    tool.buildPuzzle(path.join(tool.fixDir, tool.plainFixture), out, { theme: 'skeleton', font: 'embed' });
    await page.goto('file://' + out);
    await ready(tool, page);

    await fillBoardWrong(tool, page);
    await expect(page.locator('.clue-item.filled').first()).toBeVisible();
    await expect(page.locator('.clue-item.filled .clue-text').first()).toHaveCSS('opacity', '1');
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
    let src = path.join(tool.fixDir, tool.rebusFixture);
    if (tool.name === 'crushword') {
      const puzzle = yaml.load(fs.readFileSync(src, 'utf8'));
      puzzle.across[1].styles = { circle: [0] };
      puzzle.down[1].styles = { circle: [0] };
      src = path.join(tool.tmpDir, 'doubled-circle.yaml');
      fs.writeFileSync(src, yaml.dump(puzzle), 'utf8');
    }
    const out = path.join(tool.tmpDir, 'doubled-circle.html');
    tool.buildPuzzle(src, out);
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

// ---- Z: typed accents fold to their base letter — all four tools ----------------------
// Each engine runs what the solver types through the shared normalize(), which folds
// é to e, so an accented guess fills the plain letter. On a hashed page the hash then
// matches; Crushword has no hashed rebus cell list, so its plain board is solved instead.

const ACCENTED = { A: 'Á', C: 'Ç', E: 'É', I: 'Í', N: 'Ñ', O: 'Ö', U: 'Ü' };
const accent = s => [...s.toUpperCase()].map(ch => ACCENTED[ch] ?? ch).join('');

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] a hashed puzzle solves when the solver types accented letters`, async ({ page }) => {
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
    expect(events[0].solution).toBe(tool.REBUS_CELLS.map(c => c.toLowerCase()).join('.'));
  });
}

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
