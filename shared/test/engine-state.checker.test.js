'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeBoardChecker } = require('../engine-state.mjs');
const { sha256hex } = require('../sha256hex.mjs');
const { joinCells } = require('../boardString.mjs');

// A three-cell board whose answer is a · bc · d. One rebus cell, so the delimited
// preimage — not a plain concatenation — is what these tests exercise.
const CELL_IDS = [0, 1, 2];
const ANSWER = { 0: 'a', 1: 'bc', 2: 'd' };
const CORRECT_HASH = sha256hex(joinCells(CELL_IDS.map(n => ANSWER[n])));

function harness({ hashed = false, content = {}, marked = [], composing = null } = {}) {
  const store = { ...content };
  const markedSet = new Set(marked);
  const calls = { markSolved: 0, syncUI: 0, getExpected: 0, getBoardHash: 0 };
  const checker = makeBoardChecker({
    cellIds: CELL_IDS,
    getContent: n => store[n] || '',
    // Mirrors composer.isCellFilled: content present AND not composing.
    isCellFilled: n => (store[n] || '') !== '' && n !== composing,
    isCellMarkedCorrect: n => markedSet.has(n),
    hashed,
    getExpected:  n => { calls.getExpected++; return ANSWER[n]; },
    getBoardHash: () => { calls.getBoardHash++; return CORRECT_HASH; },
    markSolved:   () => { calls.markSolved++; },
    syncUI:       () => { calls.syncUI++; },
  });
  return { checker, store, calls };
}

const SOLVED = { 0: 'a', 1: 'bc', 2: 'd' };

// isEntryFilled: the "filled clue" question (`.filled` on a clue item), asked of one
// entry's cells with the checker's own isCellFilled.
test('isEntryFilled: true only when every cell of the entry is filled', () => {
  assert.equal(harness({ content: SOLVED }).checker.isEntryFilled([0, 1, 2]), true);
  assert.equal(harness({ content: { 0: 'a', 2: 'd' } }).checker.isEntryFilled([0, 1, 2]), false);
  assert.equal(harness().checker.isEntryFilled([0, 1, 2]), false);
});

test('isEntryFilled: judges only its own cells, not the rest of the board', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'bc' } });
  assert.equal(checker.isEntryFilled([0, 1]), true);
  assert.equal(checker.isEntryFilled([0, 2]), false);
});

test('isEntryFilled: a cell mid-rebus-composition is not filled', () => {
  const { checker } = harness({ content: SOLVED, composing: 1 });
  assert.equal(checker.isEntryFilled([0, 1]), false);
  assert.equal(checker.isEntryFilled([0, 2]), true);
});

test('getSolution joins normalized cells with the delimiter', () => {
  const { checker } = harness({ content: SOLVED });
  assert.equal(checker.getSolution(), 'a.bc.d');
});

test('isBoardFilled is false while any cell is empty', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'bc' } });
  assert.equal(checker.isBoardFilled(), false);
});

test('isBoardFilled is false while a cell is composing, even with content', () => {
  const { checker } = harness({ content: SOLVED, composing: 2 });
  assert.equal(checker.isBoardFilled(), false);
});

test('isSolved reads the tool marker, not the content', () => {
  const { checker } = harness({ content: SOLVED });
  assert.equal(checker.isSolved(), false);
  const { checker: allMarked } = harness({ content: SOLVED, marked: [0, 1, 2] });
  assert.equal(allMarked.isSolved(), true);
});

test('checkIfFilled does nothing at all on a partly filled board', () => {
  const { checker, calls } = harness({ content: { 0: 'a' } });
  checker.checkIfFilled();
  assert.equal(calls.markSolved, 0);
  assert.equal(calls.syncUI, 0);
});

test('checkIfFilled marks a correct board solved — non-hashed', () => {
  const { checker, calls } = harness({ content: SOLVED });
  checker.checkIfFilled();
  assert.equal(calls.markSolved, 1);
});

test('checkIfFilled marks a correct board solved — hashed', () => {
  const { checker, calls } = harness({ hashed: true, content: SOLVED });
  checker.checkIfFilled();
  assert.equal(calls.markSolved, 1);
});

test('checkIfFilled syncs but does not mark a wrong full board — both modes', () => {
  for (const hashed of [false, true]) {
    const { checker, calls } = harness({ hashed, content: { 0: 'a', 1: 'bc', 2: 'x' } });
    checker.checkIfFilled();
    assert.equal(calls.markSolved, 0, `hashed=${hashed}`);
    assert.equal(calls.syncUI, 1, `hashed=${hashed}`);
  }
});

test('hashed and non-hashed agree on every board — the symmetry contract', () => {
  const boards = [
    SOLVED,
    { 0: 'a', 1: 'bc', 2: 'x' },   // wrong final cell
    { 0: 'ab', 1: 'c', 2: 'd' },   // right letters, wrong cell boundaries
  ];
  for (const content of boards) {
    const plain  = harness({ hashed: false, content });
    const hashed = harness({ hashed: true,  content });
    plain.checker.checkIfFilled();
    hashed.checker.checkIfFilled();
    assert.equal(plain.calls.markSolved, hashed.calls.markSolved,
      `modes disagreed on ${JSON.stringify(content)}`);
  }
});

// repaintIfSolved — the restore-time repaint. The auto-save payload carries cell
// correctness only, so a solved board comes back with its clue items unmarked; this
// re-derives the rest of the solved painting from the marks that were restored.
test('repaintIfSolved marks solved when every cell was restored correct', () => {
  const { checker, calls } = harness({ content: SOLVED, marked: [0, 1, 2] });
  checker.repaintIfSolved();
  assert.equal(calls.markSolved, 1);
});

test('repaintIfSolved does nothing when any cell is unmarked', () => {
  const { checker, calls } = harness({ content: SOLVED, marked: [0, 1] });
  checker.repaintIfSolved();
  assert.equal(calls.markSolved, 0);
});

// syncUI() would reach the engine's latch.check(), popping the congrats dialog on
// every reload of a solved puzzle — the exact thing latch.sealIfSolved() exists to
// prevent. The repaint paints; it does not re-announce.
test('repaintIfSolved does not call syncUI', () => {
  const { checker, calls } = harness({ content: SOLVED, marked: [0, 1, 2] });
  checker.repaintIfSolved();
  assert.equal(calls.syncUI, 0);
});

// Mark-driven, not evidence-driven: restore repaints what was already established,
// it does not re-adjudicate the board. So the two modes cannot diverge here.
test('repaintIfSolved consults no answer evidence — both modes', () => {
  for (const hashed of [false, true]) {
    const { checker, calls } = harness({ hashed, content: SOLVED, marked: [0, 1, 2] });
    checker.repaintIfSolved();
    assert.equal(calls.markSolved, 1, `hashed=${hashed}`);
    assert.equal(calls.getExpected, 0, `hashed=${hashed}`);
    assert.equal(calls.getBoardHash, 0, `hashed=${hashed}`);
  }
});

// The mid-composition-prefix case: a partly-typed cell can leave a *correct* board.
// Without the isCellFilled exclusion this marks solved, which seals the one-way
// completion latch on a half-entered board. Previously reachable only through Playwright.
test('checkIfFilled does not mark solved while a cell is composing, even when content is correct', () => {
  for (const hashed of [false, true]) {
    const { checker, calls } = harness({ hashed, content: SOLVED, composing: 2 });
    checker.checkIfFilled();
    assert.equal(calls.markSolved, 0, `hashed=${hashed}`);
    assert.equal(calls.syncUI, 0, `hashed=${hashed}`);
  }
});

// ── Check Cell ────────────────────────────────────────────────────────────────

test('canCheck is true only for a filled, not-yet-correct cell', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'bc' }, marked: [1], composing: null });
  assert.equal(checker.canCheck(0), true);
  assert.equal(checker.canCheck(1), false, 'already marked correct');
  assert.equal(checker.canCheck(2), false, 'empty');
});

test('canCheck is false for a cell that is still composing', () => {
  const { checker } = harness({ content: { 1: 'b' }, composing: 1 });
  assert.equal(checker.canCheck(1), false);
});

test('checkCell returns true for a correct cell and false for a wrong one', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'xy' } });
  assert.equal(checker.checkCell(0), true);
  assert.equal(checker.checkCell(1), false);
});

test('checkCell returns null, without reading the answer, when the cell cannot be checked', () => {
  const { checker, calls } = harness({ content: { 0: 'a' }, marked: [0] });
  assert.equal(checker.checkCell(0), null, 'already correct');
  assert.equal(checker.checkCell(2), null, 'empty');
  assert.equal(calls.getExpected, 0);
});
