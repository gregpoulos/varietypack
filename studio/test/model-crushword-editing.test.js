'use strict';

// The Crushword editor's keyboard and click rules, as pure functions of (model, ui).
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const cw       = require('../src/model/kinds/crushword');
const E        = require('../src/model/crushwordEditing');

const blank = (rows = 5, cols = 5) => cw.newModel({ rows, cols });
const at = (r, c, extra = {}) => ({ r, c, dir: 'A', pos: 0, col: 0, ...extra });
const key = (k, mods = {}) => ({ key: k, altKey: false, shiftKey: false, ...mods });
const cell = (m, r, c) => m.cells[r * m.cols + c];

// Plays a list of steps ('x' = a letter, otherwise a key name) and returns the final {
// model, ui }.
function play(model, ui, steps) {
  let s = { model, ui };
  for (const step of steps) {
    const res = /^[a-z]$/.test(step) ? E.typeLetter(s.model, s.ui, step) : E.pressKey(s.model, s.ui, key(step));
    s = { model: E.apply(s.model, res), ui: res.ui, message: res.message };
  }
  return s;
}

test('typing: a letter fills the cell and the cap moves the caret to the next cell\'s front', () => {
  const s = play(blank(), at(0, 0), ['a', 'b', 'c']);
  assert.equal(cell(s.model, 0, 0), 'abc');
  assert.deepEqual([s.ui.r, s.ui.c, s.ui.pos], [0, 1, 0]);
});

test('typing: Space drops what follows and moves on; Enter keeps it and lands at the end', () => {
  let s = play(blank(), at(0, 1), ['d', ' ']);
  assert.equal(cell(s.model, 0, 1), 'd');
  assert.deepEqual([s.ui.r, s.ui.c, s.ui.pos], [0, 2, 0]);
  s = play(s.model, s.ui, ['e', 'f', 'Enter']);
  assert.equal(cell(s.model, 0, 2), 'ef');
  assert.deepEqual([s.ui.r, s.ui.c], [0, 3]);
  s = play(s.model, s.ui, ['Backspace']);            // at the front of (0,3): step back, then delete
  assert.equal(cell(s.model, 0, 2), 'e');
  assert.deepEqual([s.ui.r, s.ui.c, s.ui.pos], [0, 2, 1]);
});

test('typing: a full cell overwrites at the cursor and does not advance; at its end, overwrites the last letter and advances', () => {
  let m = E.apply(blank(), { calls: [{ name: 'setCell', args: [0, 0, 'abc'] }] });
  let res = E.typeLetter(m, at(0, 0, { pos: 1, col: 1 }), 'x');
  assert.deepEqual(res.calls.map(c => c.args), [[0, 0, 'axc']]);
  assert.deepEqual([res.ui.r, res.ui.c, res.ui.pos], [0, 0, 2]);
  res = E.typeLetter(m, at(0, 0, { pos: 3, col: 3 }), 'x');
  assert.deepEqual(res.calls.map(c => c.args), [[0, 0, 'abx']]);
  assert.deepEqual([res.ui.r, res.ui.c, res.ui.pos], [0, 1, 0]);
});

test('typing: the cap is the model\'s maxCellLetters', () => {
  const m = cw.commands.setMaxCellLetters(blank(), 2);
  const s = play(m, at(0, 0), ['a', 'b']);
  assert.deepEqual([s.ui.r, s.ui.c], [0, 1]);
});

test('a pasted string fills one cell and advances once, dropping the rest', () => {
  const letters = [...'abcdef'];
  const res = E.typeText(blank(), at(0, 0), letters);
  const m = E.apply(blank(), res);
  assert.equal(cell(m, 0, 0), 'abc');
  assert.equal(cell(m, 0, 1), '');
  assert.deepEqual([res.ui.r, res.ui.c, res.ui.pos], [0, 1, 0]);
  assert.ok(res.calls.every(c => c.typing), 'one undo run');
  // Into a cell already holding a letter: the room left is filled, then it advances.
  const held = E.apply(blank(), { calls: [{ name: 'setCell', args: [0, 0, 'x'] }] });
  const more = E.typeText(held, at(0, 0, { pos: 1, col: 1 }), letters);
  assert.equal(cell(E.apply(held, more), 0, 0), 'xab');
  assert.equal(more.ui.c, 1);
  // A string short of the cap stays in the cell.
  const short = E.typeText(blank(), at(0, 0), [...'ab']);
  assert.deepEqual([short.ui.c, short.ui.pos], [0, 2]);
});

test('typing on a block says so and changes nothing', () => {
  const m = cw.commands.toggleBlock(blank(), 0, 0);
  const res = E.typeLetter(m, at(0, 0), 'a');
  assert.deepEqual(res.calls, []);
  assert.equal(res.message, 'This cell is a block. Press # to open it.');
});

test('Shift+Enter goes back a cell, landing at the end of its content', () => {
  const m = E.apply(blank(), { calls: [{ name: 'setCell', args: [0, 0, 'ab'] }] });
  const res = E.pressKey(m, at(0, 1), key('Enter', { shiftKey: true }));
  assert.deepEqual([res.ui.r, res.ui.c, res.ui.pos], [0, 0, 2]);
});

test('Backspace deletes the letter before the cursor; Alt deletes everything before it', () => {
  const m = E.apply(blank(), { calls: [{ name: 'setCell', args: [0, 0, 'abc'] }] });
  assert.deepEqual(E.pressKey(m, at(0, 0, { pos: 2, col: 2 }), key('Backspace')).calls.map(c => c.args), [[0, 0, 'ac']]);
  const alt = E.pressKey(m, at(0, 0, { pos: 2, col: 2 }), key('Backspace', { altKey: true }));
  assert.deepEqual(alt.calls.map(c => c.args), [[0, 0, 'c']]);
  assert.equal(alt.ui.pos, 0);
});

test('Delete clears the whole cell and puts the cursor at its front; on a block it says so', () => {
  const m = E.apply(blank(), { calls: [{ name: 'setCell', args: [0, 0, 'abc'] }] });
  const res = E.pressKey(m, at(0, 0, { pos: 2, col: 2 }), key('Delete'));
  assert.deepEqual(res.calls.map(c => [c.name, c.args, c.typing]), [['setCell', [0, 0, ''], undefined]]);
  assert.deepEqual([res.ui.pos, res.ui.col], [0, 0]);
  assert.deepEqual(E.pressKey(blank(), at(0, 0), key('Delete')).calls, []);   // already empty
  const blocked = E.pressKey(cw.commands.toggleBlock(blank(), 0, 0), at(0, 0), key('Delete'));
  assert.deepEqual(blocked.calls, []);
  assert.equal(blocked.message, 'This cell is a block. Press # to open it.');
});

test('arrows: ←/→ move through the letters, then cross to the neighbor setting Across; Alt jumps to the edge', () => {
  const m = E.apply(blank(), { calls: [{ name: 'setCell', args: [0, 0, 'ab'] }, { name: 'setCell', args: [1, 0, 'xy'] }] });
  assert.equal(E.pressKey(m, at(0, 0, { pos: 0 }), key('ArrowRight')).ui.pos, 1);
  assert.equal(E.pressKey(m, at(0, 0, { pos: 0 }), key('ArrowRight', { altKey: true })).ui.pos, 2);
  const cross = E.pressKey(m, at(0, 0, { pos: 2, col: 2, dir: 'D' }), key('ArrowRight'));
  assert.deepEqual([cross.ui.r, cross.ui.c, cross.ui.pos, cross.ui.dir], [0, 1, 0, 'A']);
  const back = E.pressKey(m, at(0, 1, { pos: 0 }), key('ArrowLeft'));
  assert.deepEqual([back.ui.r, back.ui.c, back.ui.pos], [0, 0, 2]);        // near side: the end of the left cell
  const altBack = E.pressKey(m, at(0, 1, { pos: 0 }), key('ArrowLeft', { altKey: true }));
  assert.deepEqual([altBack.ui.r, altBack.ui.c, altBack.ui.pos], [0, 0, 0]);   // far side
});

test('arrows: ↑/↓ keep the sticky column and set Down; at the edge they are left to the page', () => {
  const m = E.apply(blank(), { calls: [{ name: 'setCell', args: [1, 0, 'xy'] }] });
  const down = E.pressKey(m, at(0, 0, { pos: 0, col: 1 }), key('ArrowDown'));
  assert.deepEqual([down.ui.r, down.ui.c, down.ui.pos, down.ui.col, down.ui.dir], [1, 0, 1, 1, 'D']);
  const edge = E.pressKey(m, at(0, 0), key('ArrowUp'));
  assert.equal(edge.handled, false);
});

test('arrows skip block runs', () => {
  let m = blank();
  m = cw.commands.toggleBlock(m, 0, 1);
  m = cw.commands.toggleBlock(m, 0, 2);
  const res = E.pressKey(m, at(0, 0), key('ArrowRight'));
  assert.deepEqual([res.ui.r, res.ui.c], [0, 3]);
});

const plusGrid = () => E.apply(blank(3, 3), { calls: [{ name: 'toggleBlock', args: [0, 1] }, { name: 'toggleBlock', args: [2, 1] }] });

test('"." toggles the direction, but only when the cell has an entry the other way', () => {
  assert.equal(E.pressKey(blank(), at(0, 0), key('.')).ui.dir, 'D');
  assert.equal(E.pressKey(plusGrid(), at(1, 1), key('.')).ui.dir, 'A');       // (1,1) has no down entry in the plus
});

test('landing on a cell with no entry in the current direction flips the direction', () => {
  // Right from (0,0) jumps the block to (0,2), which has only a down entry: ArrowRight
  // sets Across, landing flips it back.
  const res = E.pressKey(plusGrid(), at(0, 0, { dir: 'D' }), key('ArrowRight'));
  assert.deepEqual([res.ui.r, res.ui.c, res.ui.dir], [0, 2, 'D']);
});

const filled = (m, ...cells) => E.apply(m, { calls: cells.map(([r, c]) => ({ name: 'setCell', args: [r, c, 'a'] })) });
const where = (res) => [res.ui.r, res.ui.c, res.ui.dir];

test('Tab goes to the first cell of the next entry; the last across entry leads into the first down', () => {
  const m = blank(3, 3);
  assert.deepEqual(where(E.pressKey(m, at(0, 1), key('Tab'))), [1, 0, 'A']);
  assert.deepEqual(where(E.pressKey(m, at(2, 0), key('Tab'))), [0, 0, 'D']);   // across 3 → down 1
  assert.deepEqual(where(E.pressKey(m, at(0, 0, { dir: 'D' }), key('Tab', { shiftKey: true }))), [2, 0, 'A']);   // down 1 → across 3
  assert.deepEqual(where(E.pressKey(m, at(1, 0), key('Tab', { shiftKey: true }))), [0, 0, 'A']);
});

test('Tab stops at a complete entry, on its first cell, rather than skipping it', () => {
  let m = filled(blank(3, 3), [1, 0], [1, 1], [1, 2]);            // across 2 is full
  assert.deepEqual(where(E.pressKey(m, at(0, 0), key('Tab'))), [1, 0, 'A']);
  m = filled(blank(3, 3), [0, 0], [0, 2]);                         // across 1 has only (0,1) empty
  assert.deepEqual(where(E.pressKey(m, at(1, 0), key('Tab', { shiftKey: true }))), [0, 0, 'A']);
});

test('Tab past the last entry (Shift+Tab before the first) is left to the browser', () => {
  const m = blank(3, 3);
  assert.equal(E.pressKey(m, at(0, 2, { dir: 'D' }), key('Tab')).handled, false);   // down 3, the last
  assert.equal(E.pressKey(m, at(0, 0), key('Tab', { shiftKey: true })).handled, false);
});

test('Tab on a block is left to the browser', () => {
  const m = cw.commands.toggleBlock(blank(), 2, 2);
  assert.equal(E.pressKey(m, at(2, 2), key('Tab')).handled, false);
});

test('# blocks the cell and moves the caret to the next open cell', () => {
  const res = E.pressKey(blank(), at(0, 0), key('#'));
  const m = E.apply(blank(), res);
  assert.equal(m.blocks[0], true);
  assert.deepEqual([res.ui.r, res.ui.c], [0, 1]);
});

test('# on a block opens it and stays', () => {
  const res = E.pressKey(blank(), at(0, 1), key('#'));
  const m = E.apply(blank(), res);
  assert.equal(m.blocks.filter(Boolean).length, 1);
  const reopened = E.pressKey(m, at(0, 1), key('#'));
  assert.equal(E.apply(m, reopened).blocks.filter(Boolean).length, 0);
  assert.deepEqual([reopened.ui.r, reopened.ui.c], [0, 1]);
});

test('# on the last open cell says a puzzle needs one', () => {
  const one = E.apply(blank(3, 3), { calls: [{ name: 'toggleBlock', args: [0, 0] }] });
  let m = one;
  for (const [r, c] of [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1]]) m = cw.commands.toggleBlock(m, r, c);
  const res = E.pressKey(m, at(2, 2), key('#'));
  assert.deepEqual(res.calls, []);
  assert.equal(res.message, 'A puzzle needs at least one open cell.');
});

test('clicking: an open cell takes the caret to the end of its content; the caret\'s own cell toggles the direction once focused', () => {
  const m = E.apply(blank(), { calls: [{ name: 'setCell', args: [2, 2, 'ab'] }] });
  const c1 = E.clickCell(m, at(0, 0), 2, 2, false);
  assert.deepEqual([c1.ui.r, c1.ui.c, c1.ui.pos], [2, 2, 2]);
  assert.equal(E.clickCell(m, c1.ui, 2, 2, false).ui.dir, 'A');
  assert.equal(E.clickCell(m, c1.ui, 2, 2, true).ui.dir, 'D');
});

test('clicking a block puts the caret on it', () => {
  const m = cw.commands.toggleBlock(blank(), 0, 0);
  assert.deepEqual([E.clickCell(m, at(2, 2), 0, 0, true).ui.r, E.clickCell(m, at(2, 2), 0, 0, true).ui.c], [0, 0]);
});

test('selectSlot moves to the slot\'s first cell in its direction; repair keeps the ui on the grid', () => {
  const m = blank();
  const down = cw.slots(m).find(s => s.key === 'D 0,3');
  const ui = E.selectSlot(m, 'D 0,3');
  assert.deepEqual([ui.r, ui.c, ui.dir], [down.r, down.c, 'D']);
  const small = cw.commands.resize(m, 3, 3);
  const fixed = E.repair(small, at(4, 4, { pos: 5 }));
  assert.ok(fixed.r < 3 && fixed.c < 3);
  assert.equal(E.initialUi(m).dir, 'A');
});
