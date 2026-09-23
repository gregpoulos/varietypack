'use strict';

// Behaviors shared, byte-for-byte, across two or more of the four puzzle engines —
// deduplicated from the per-tool e2e/*.spec.js files (root CLAUDE.md: "cross-tool
// alignment is a standing obligation"). Each test body below is written ONCE and
// looped over a per-tool adapter table (TOOLS); the loop supplies the per-tool
// repetition, not a copy-pasted test.
//
// Two loop scopes:
//   ALL_TOOLS  — spiral, snake-charmer, marching-bands, crushword. Used only where
//                the behavior and its DOM contract are identical across all four.
//   RING_TOOLS — spiral, snake-charmer, marching-bands (excludes crushword). Crushword
//                has no rebus button (its cells compose on every keystroke instead of
//                only multi-letter ones) and its options menu and congrats/Play-again
//                tests were never given the same coverage as the other three — see
//                e2e/crushword.spec.js's own header for what stays there instead.
//                Per the brief: rather than
//                bend these shared bodies with a per-tool conditional to paper over
//                that, the tests that only apply to the ring-based three simply loop
//                over RING_TOOLS and leave crushword out.
//
// Genuinely-diverged copies that were NOT unified here (kept per-tool, with a note
// at the per-tool copy explaining why): crushword's "menu button opens..." test
// (different starting fixture, plus an extra Clear-also-closes-menu assertion that
// the other three tools instead cover inside their rebus-label-resync test);
// crushword's "hashed puzzle solves end to end" test (uses its own cell-by-cell
// solveBoard()/fillCell() plumbing against the non-rebus hashed fixture, not the
// REBUS_CELLS/typeCell() mechanism the ring tools share — and crushword never had a
// dedicated *rebus*-hashed-preimage test to begin with, despite building an unused
// rebusHashedPath fixture for one).

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { typeCell } = require('./helpers');

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

// A single-letter, keyboard-driven board solve: reads PUZZLE_DATA.letters (nulls
// filtered out, for Marching Bands' center cell), presses each as a named key.
// Shared by the ring tools' congrats/Play-again/completion-event tests — they
// don't need typeCell()'s rebus-composing machinery since their plain fixtures
// carry no multi-letter cells.
async function solveRingBoard(page) {
  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const l of letters) await page.keyboard.press(`Key${l.toUpperCase()}`);
}

// Crushword's board has no uniform typing order (some cells belong to only one
// direction), so it must be solved cell-by-cell by id, same as e2e/crushword.spec.js's
// own solveBoard()/fillCell(). Enter commits each cell explicitly — required for the
// last cell of the loop, which would otherwise stay composing.
async function solveCrushwordBoard(page) {
  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters);
  const pairs = [];
  letters.forEach((letter, i) => { if (letter !== null) pairs.push({ id: i + 1, letter }); });
  for (const { id, letter } of pairs) {
    await page.locator(`#cell-${id}`).click();
    for (const ch of letter) await page.locator('#hidden-input').fill(ch.toUpperCase());
    await page.keyboard.press('Enter');
  }
}

const TOOLS = [
  {
    name: 'spiral',
    kind: 'spiral',
    ring: true,
    buildPuzzle: require('../spiral/src/builder').buildPuzzle,
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
    markCellId: 'cell-1', markLetterIndex: 0, sameEntryCellId: 'cell-2',
  },
  {
    name: 'snake-charmer',
    kind: 'snake-charmer',
    ring: true,
    buildPuzzle: require('../snake-charmer/src/builder').buildPuzzle,
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
    markCellId: 'cell-0', markLetterIndex: 0, sameEntryCellId: 'cell-1',
  },
  {
    name: 'marching-bands',
    kind: 'marching-bands',
    ring: true,
    buildPuzzle: require('../marching-bands/src/builder').buildPuzzle,
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
    markCellId: 'cell-1', markLetterIndex: 0, sameEntryCellId: 'cell-2',
  },
  {
    name: 'crushword',
    kind: 'crushword',
    ring: false,
    buildPuzzle: require('../crushword/src/builder').buildPuzzle,
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

// ---- A: keys modal (button, ? key, Esc, backdrop click) — all four tools --------
// Crushword's own former copy of this test asserted only the button-click/Esc half;
// the ? key and backdrop-click behavior come from the same shared setupKeysOverlay()
// (shared/engine-chrome.js) as the other three, so the fuller body applies to it too.

for (const tool of ALL_TOOLS) {
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

// ---- B: Tab trapped by the modal — spiral, snake-charmer, marching-bands --------

for (const tool of RING_TOOLS) {
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

// ---- C: keystrokes suppressed while the modal is open — ring tools --------------

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

// ---- D: menu open/close/focus — ring tools ---------------------------------------
// Crushword's copy of this test stays in e2e/crushword.spec.js: it starts from the
// rebus fixture (cw-9.yaml's top-left cell is blocked, so #letter-1 doesn't exist on
// the plain fixture) and folds in an extra assertion — that confirming Clear also
// closes the menu — which the other three tools instead cover inside their
// rebus-label-resync test below. Unifying it here would need a body-level branch.

for (const tool of RING_TOOLS) {
  test(`[${tool.name}] menu button opens the options menu holding Clear; outside click and Escape both close it and restore focus`, async ({ page }) => {
    await page.goto('file://' + tool.paths.plain);
    await ready(tool, page);

    const panel = page.locator('#menu-panel');
    const clearBtn = page.locator('#clear-btn');
    await expect(panel).toBeHidden();
    await expect(clearBtn).toBeHidden();

    await page.click('#menu-btn');
    await expect(panel).toBeVisible();
    await expect(clearBtn).toBeVisible();

    const firstCell = page.locator('#' + tool.firstLetterId);
    await expect(firstCell).toHaveText('');
    await page.mouse.click(5, 5);
    await expect(panel).toBeHidden();
    await page.keyboard.type('A');
    await expect(firstCell).toHaveText('A');

    await page.evaluate(() => document.getElementById('hidden-input').focus());
    await page.click('#menu-btn');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
}

// ---- E: congrats dialog on solve — ring tools ------------------------------------

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

// ---- F: Play again resets the board — ring tools ---------------------------------

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

// ---- G: completion event payload — all four tools --------------------------------
// The core payload contract (kind, boardHash shape, solution hashes to it, timeMs,
// exactly one postMessage with solution stripped) is identical across all four
// engines. Snake Charmer's former copy additionally asserted `detail.title` and
// re-checked the postMessage's boardHash/kind/timeMs fields against the event's —
// that's the same payload object's fields checked twice via two channels, not a
// distinct behavior, so it isn't reproduced here (title passthrough itself isn't a
// completion-event concern).

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

    const computedHash = await page.evaluate(sol => sha256hex(sol), detail.solution);
    assert.strictEqual(computedHash, detail.boardHash, 'sha256hex(solution) === boardHash');

    assert.strictEqual(msgs.length, 1, 'exactly one postMessage');
    assert.strictEqual(msgs[0].type, 'varietypack:complete');
    assert.strictEqual(msgs[0].solution, undefined, 'solution must be absent from postMessage');
  });
}

// ---- H: Check Cell localStorage wrong/correct pair — all four tools --------------
// Persist-at-mutation-sites convention (root CLAUDE.md / global memory): a wrong
// guess mutates no persisted state and must not write; a correct guess does. Every
// tool's rebus fixture answers its first cell 'A', so 'Z' is uniformly wrong.

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
}

// ---- I: rebus button label resyncs after Clear — ring tools ---------------------

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

// ---- J: rebus button label resyncs after a cursor move — ring tools -------------

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

// ---- K: rebus button present in hashed and non-hashed builds — ring tools -------

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

// ---- L: hashed rebus preimage matches boardHash — ring tools --------------------
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

    const recomputed = await page.evaluate(s => sha256hex(s), detail.solution);
    expect(recomputed).toBe(detail.boardHash);
  });
}

// ---- Correct cells stay part of the active-entry highlight — all four tools ------
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

    await marked.click();
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
