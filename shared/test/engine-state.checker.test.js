'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeBoardChecker, makeComposer, makeCellStore, revealCells } = require('../engine-state.mjs');
const { sha256hex } = require('../sha256hex.mjs');
const { joinCells } = require('../boardString.mjs');

// A three-cell board whose answer is a · bc · d. One rebus cell, so the delimited
// preimage — not a plain concatenation — is what these tests exercise.
const CELL_IDS = [0, 1, 2];
const ANSWER = { 0: 'a', 1: 'bc', 2: 'd' };
const CORRECT_HASH = sha256hex(joinCells(CELL_IDS.map(n => ANSWER[n])));

function harness({
  hashed = false, content = {}, marked = [], wrong = [], composing = null, checkComposing = false,
} = {}) {
  const store = { ...content };
  const markedSet = new Set(marked);
  const wrongSet = new Set(wrong);
  const calls = { markSolved: 0, syncUI: 0, getExpected: 0, getBoardHash: 0 };
  const checker = makeBoardChecker({
    cellIds: CELL_IDS,
    getContent: n => store[n] || '',
    // Mirrors composer.isCellFilled: content present AND not composing.
    isCellFilled: n => (store[n] || '') !== '' && n !== composing,
    isCellConfirmedRight: n => markedSet.has(n),
    isCellMarkedWrong: n => wrongSet.has(n),
    checkComposing,
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

// isSolved: the board's content, filled and correct. Marks don't enter into it: a solve
// marks no cell, and a checked cell can still sit beside a wrong one.
test('isSolved is true for a filled board whose content is correct, with no cell marked', () => {
  assert.equal(harness({ content: SOLVED }).checker.isSolved(), true);
});

test('isSolved is false while a cell holding its right content is composing', () => {
  assert.equal(harness({ content: SOLVED, composing: 1 }).checker.isSolved(), false);
});

test('isSolved is false for a filled board with one wrong cell, even if every other cell is checked', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'bc', 2: 'x' }, marked: [0, 1] });
  assert.equal(checker.isSolved(), false);
});

test('isSolved compares the board hash when hashed', () => {
  assert.equal(harness({ hashed: true, content: SOLVED }).checker.isSolved(), true);
  const { checker, calls } = harness({ hashed: true, content: { 0: 'a', 1: 'bc', 2: 'x' } });
  assert.equal(checker.isSolved(), false);
  assert.equal(calls.getBoardHash, 1);
});

test('isSolved hashes nothing on a board that is not full', () => {
  const { checker, calls } = harness({ hashed: true, content: { 0: 'a' } });
  assert.equal(checker.isSolved(), false);
  assert.equal(calls.getBoardHash, 0);
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

// repaintIfSolved — the restore-time repaint. The auto-save payload carries no solved
// flag, so a solved board comes back unpainted; this re-adjudicates it from content.
test('repaintIfSolved calls markSolved for a correct filled board with no marks', () => {
  const { checker, calls } = harness({ content: SOLVED });
  checker.repaintIfSolved();
  assert.equal(calls.markSolved, 1);
});

test('repaintIfSolved does nothing on a wrong filled board', () => {
  const { checker, calls } = harness({ content: { 0: 'a', 1: 'bc', 2: 'x' }, marked: [0, 1] });
  checker.repaintIfSolved();
  assert.equal(calls.markSolved, 0);
});

// A reload of a board solved with help: the restore brings back each cell's mark, and the
// repaint, which runs the solve's own painting, must leave them as they were.
test('repaintIfSolved on a restored board keeps revealed cells revealed', () => {
  const el = () => ({ textContent: '', style: {}, dataset: {}, getAttribute: () => '0', classList: { toggle() {} } });
  const els = Object.fromEntries(CELL_IDS.map(n => [n, { cell: el(), letter: el() }]));
  const cells = makeCellStore({ ids: CELL_IDS, cellEl: n => els[n].cell, letterEl: n => els[n].letter });
  cells.restoreFields({ letters: SOLVED, marks: { 0: 'checked', 1: 'revealed', 2: 'revealed' } });
  let painted = 0;
  const checker = makeBoardChecker({
    cellIds: CELL_IDS, getContent: cells.getCellLetter, isCellFilled: n => cells.getCellLetter(n) !== '',
    isCellConfirmedRight: cells.isConfirmedRight, hashed: false, getExpected: n => ANSWER[n],
    getBoardHash: () => CORRECT_HASH, markSolved: () => { painted++; }, syncUI: () => {},
  });
  checker.repaintIfSolved();
  assert.equal(painted, 1);
  assert.deepEqual(CELL_IDS.map(cells.getMark), ['checked', 'revealed', 'revealed']);
});

// syncUI() would reach the engine's latch.check(), popping the congrats dialog on
// every reload of a solved puzzle — the exact thing latch.sealIfSolved() exists to
// prevent. The repaint paints; it does not re-announce.
test('repaintIfSolved does not call syncUI', () => {
  const { checker, calls } = harness({ content: SOLVED });
  checker.repaintIfSolved();
  assert.equal(calls.syncUI, 0);
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

// A wrong-marked cell is unchanged since its check (any edit clears the mark), so
// checking it again could only say the same thing; Reveal still works on it.
test('canCheck refuses a wrong-marked cell', () => {
  const { checker } = harness({ content: { 0: 'x' }, wrong: [0] });
  assert.equal(checker.canCheck(0), false);
});

test('canReveal accepts a wrong-marked cell', () => {
  const { checker } = harness({ content: { 0: 'x' }, wrong: [0] });
  assert.equal(checker.canReveal(0), true);
});

test('checkCells skips wrong-marked cells', () => {
  const { checker } = harness({ content: { 0: 'x', 1: 'yy', 2: 'd' }, wrong: [0, 1] });
  assert.deepEqual(checker.checkCells([0, 1, 2]), { right: [2], wrong: [] });
});

// Crushword composes every cell as it is typed and commits it before a check, so a
// composing cell with content is checkable there.
test('with checkComposing, canCheck accepts a composing cell holding content', () => {
  const { checker } = harness({ content: { 1: 'b', 2: '' }, composing: 1, checkComposing: true });
  assert.equal(checker.canCheck(1), true);
  const { checker: empty } = harness({ content: {}, composing: 2, checkComposing: true });
  assert.equal(empty.canCheck(2), false, 'nothing typed yet');
});

test('with checkComposing, canCheck still refuses a confirmed or wrong-marked cell', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'x' }, marked: [0], wrong: [1], checkComposing: true });
  assert.equal(checker.canCheck(0), false);
  assert.equal(checker.canCheck(1), false);
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

// ── Reveal Cell ───────────────────────────────────────────────────────────────

test('canReveal is true for an empty, a wrong and a composing cell, false for a correct one', () => {
  const { checker } = harness({ content: { 1: 'x', 2: 'd' }, marked: [2], composing: 1 });
  assert.equal(checker.canReveal(0), true, 'empty');
  assert.equal(checker.canReveal(1), true, 'wrong and composing');
  assert.equal(checker.canReveal(2), false, 'already marked correct');
});

// The mark invariant (docs/CROSS_TOOL_SPEC.md → "Filled excludes composing
// cells"): Reveal applies it only after ending composition and writing the answer.
// Pinned here with a real composer: revealing the last cell while it composes must leave
// a board the checker reads as filled and solved, and no cell composing.
test('revealing the last cell while it composes lets the board finish', () => {
  const store = { 0: 'a', 1: 'bc' };
  const marked = new Set([0, 1]);
  let solvedPaints = 0;
  const composer = makeComposer({
    getContent: n => store[n] || '', setContent: (n, s) => { store[n] = s; },
    onCommit: () => {}, isSolved: () => false,
  });
  composer.toggle(2);
  store[2] = 'dd'; // a half-typed prefix
  const checker = makeBoardChecker({
    cellIds: CELL_IDS, getContent: n => store[n] || '', isCellFilled: composer.isCellFilled,
    isCellConfirmedRight: n => marked.has(n), hashed: false, getExpected: n => ANSWER[n],
    getBoardHash: () => CORRECT_HASH, markSolved: () => { solvedPaints++; marked.add(2); },
    syncUI: () => {},
  });
  assert.equal(checker.isBoardFilled(), false, 'composing: not filled yet');

  revealCells({
    ids: [2], composer, getContent: n => store[n] || '', getExpected: n => ANSWER[n],
    canReveal: () => true,
    setCellLetter: (n, s) => { store[n] = s; marked.delete(n); },
    setMark: (n, mark) => { if (mark) marked.add(n); else marked.delete(n); },
  });
  checker.checkIfFilled();

  assert.equal(composer.getComposing(), null);
  assert.equal(checker.isSolved(), true);
  assert.equal(solvedPaints, 1);
});

test('getExpected hands the engine a cell\'s answer for Reveal', () => {
  const { checker } = harness();
  assert.equal(checker.getExpected(1), 'bc');
});

// ── Check clue ────────────────────────────────────────────────────────────────

test('checkCells splits the checkable cells into right and wrong, and skips the rest', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'xy' } }); // cell 2 is empty
  assert.deepEqual(checker.checkCells([0, 1, 2]), { right: [0], wrong: [1] });
});

test('checkCells skips a cell already marked correct and one still composing', () => {
  const { checker, calls } = harness({ content: { 0: 'a', 1: 'b', 2: 'd' }, marked: [0], composing: 1 });
  assert.deepEqual(checker.checkCells([0, 1, 2]), { right: [2], wrong: [] });
  assert.equal(calls.getExpected, 1, 'only the checkable cell reads its answer');
});

test('checkCells over cells with nothing to check returns nothing', () => {
  const { checker } = harness();
  assert.deepEqual(checker.checkCells([0, 1, 2]), { right: [], wrong: [] });
  assert.deepEqual(checker.checkCells([]), { right: [], wrong: [] });
});

test('checkCells judges only the cells it is given', () => {
  const { checker } = harness({ content: SOLVED });
  assert.deepEqual(checker.checkCells([1]), { right: [1], wrong: [] });
});

test('cellIds hands the engine the board\'s cells, the set Check puzzle and Reveal puzzle act on', () => {
  const { checker } = harness();
  assert.deepEqual(checker.cellIds, [0, 1, 2]);
});

test('checkCells lists a cell once however many times it is given', () => {
  const { checker } = harness({ content: { 0: 'a', 1: 'xy' } });
  assert.deepEqual(checker.checkCells([0, 1, 0, 1]), { right: [0], wrong: [1] });
});
