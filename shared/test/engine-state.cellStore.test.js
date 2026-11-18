'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeCellStore } = require('../engine-state.mjs');

// Mock cell or letter element: only textContent, classList, style and x/y are touched,
// as in engine-state.composer.test.js.
function makeEl() {
  const classes = new Set();
  return {
    textContent: '',
    style: {},
    dataset: {},
    getAttribute(name) { return { x: '10', y: '20' }[name]; },
    classList: {
      contains(c) { return classes.has(c); },
      toggle(c, force = !classes.has(c)) { force ? classes.add(c) : classes.delete(c); return force; },
    },
  };
}

// A store over `ids` (gaps allowed, as Marching Bands' center and Crushword's blocks
// leave), with its elements exposed so tests can read the page.
function harness(ids = [1, 2, 4], opts = {}) {
  const cellEls = {}, letterEls = {};
  for (const n of ids) { cellEls[n] = makeEl(); letterEls[n] = makeEl(); }
  const store = makeCellStore({ ids, cellEl: n => cellEls[n], letterEl: n => letterEls[n], ...opts });
  return { store, cellEls, letterEls };
}

test('setCellLetter stores and shows a letter; an empty cell reads as ""', () => {
  const { store, letterEls } = harness();
  store.setCellLetter(2, 'ab');
  assert.equal(store.getCellLetter(2), 'ab');
  assert.equal(letterEls[2].textContent, 'AB');
  assert.equal(store.getCellLetter(1), '');
  store.setCellLetter(2, '');
  assert.equal(store.getCellLetter(2), '');
  assert.equal(letterEls[2].textContent, '');
});

test('setMark marks the cell and its letter with one value, and null clears both', () => {
  const { store, cellEls, letterEls } = harness();
  store.setMark(4, 'checked');
  assert.equal(store.getMark(4), 'checked');
  assert.equal(cellEls[4].dataset.mark, 'checked');
  assert.equal(letterEls[4].dataset.mark, 'checked');
  store.setMark(4, 'revealed');
  assert.equal(store.getMark(4), 'revealed');
  assert.equal(letterEls[4].dataset.mark, 'revealed');
  store.setMark(4, null);
  assert.equal(store.getMark(4), null);
  assert.equal('mark' in cellEls[4].dataset, false);
  assert.equal('mark' in letterEls[4].dataset, false);
});

test('isConfirmedRight is true for checked and revealed, false when unmarked', () => {
  const { store } = harness();
  store.setMark(1, 'checked');
  store.setMark(2, 'revealed');
  assert.deepEqual([1, 2, 4].map(store.isConfirmedRight), [true, true, false]);
});

// The solve paints the board, not its cells (markSolved, in each engine).
test('the store has no solve painting', () => {
  const { store } = harness();
  assert.equal(store.markRestChecked, undefined);
});

test('clearCells empties every cell and leaves no cell or letter marked', () => {
  const { store, cellEls, letterEls } = harness();
  store.setCellLetter(1, 'a');
  store.setMark(1, 'checked');
  store.setMark(4, 'revealed');
  store.clearCells();
  assert.deepEqual([1, 2, 4].map(store.getCellLetter), ['', '', '']);
  for (const n of [1, 2, 4]) {
    assert.equal('mark' in cellEls[n].dataset, false);
    assert.equal('mark' in letterEls[n].dataset, false);
  }
});

test('saveFields lists only marked cells, by value', () => {
  const { store } = harness();
  store.setCellLetter(1, 'a');
  store.setCellLetter(4, 'bc');
  store.setMark(1, 'checked');
  store.setMark(4, 'revealed');
  const saved = JSON.parse(JSON.stringify(store.saveFields())); // as localStorage round-trips it
  assert.deepEqual(saved, { letters: { 1: 'a', 4: 'bc' }, marks: { 1: 'checked', 4: 'revealed' } });
});

test('restoreFields restores marks after letters', () => {
  const { store, letterEls } = harness();
  store.restoreFields({ letters: { 1: 'a', 4: 'bc' }, marks: { 1: 'checked', 4: 'revealed' } });
  assert.deepEqual([1, 2, 4].map(store.getCellLetter), ['a', '', 'bc']);
  assert.equal(letterEls[4].textContent, 'BC');
  assert.deepEqual([1, 2, 4].map(store.getMark), ['checked', null, 'revealed']);
});

// A later page may save a value this one doesn't know; it must neither paint as right
// nor count toward solved here.
test('restoreFields skips a mark value it does not know', () => {
  const { store } = harness();
  store.restoreFields({ letters: { 1: 'a' }, marks: { 1: 'someday' } });
  assert.equal(store.getMark(1), null);
  assert.equal(store.isConfirmedRight(1), false);
});

test('restoreFields keeps a wrong mark', () => {
  const { store } = harness();
  store.restoreFields({ letters: { 1: 'a' }, marks: { 1: 'wrong' } });
  assert.equal(store.getMark(1), 'wrong');
  assert.equal(store.isMarkedWrong(1), true);
});

test('wrong is not confirmed right and not locked', () => {
  const { store } = harness();
  store.setCellLetter(1, 'a');
  store.setMark(1, 'wrong');
  assert.equal(store.isConfirmedRight(1), false);
  assert.equal(store.isLocked(1), false);
});

test('a new letter clears wrong', () => {
  const { store } = harness();
  store.setCellLetter(1, 'a');
  store.setMark(1, 'wrong');
  store.setCellLetter(1, 'a');
  assert.equal(store.getMark(1), null);
  assert.equal(store.isMarkedWrong(1), false);
});

test('fitsSave accepts a save this board made, composing or not', () => {
  const { store } = harness();
  store.setCellLetter(4, 'bc');
  store.setMark(4, 'checked');
  const saved = JSON.parse(JSON.stringify(store.saveFields())); // as localStorage round-trips it
  assert.equal(store.fitsSave({ ...saved, composing: null }), true);
  assert.equal(store.fitsSave({ ...saved, composing: 4 }), true);
});

test('fitsSave accepts a save with no marks', () => {
  const { store } = harness();
  assert.equal(store.fitsSave({ letters: { 1: 'a' }, composing: null }), true);
});

// restoreFields reads `letters` unguarded, so a save without them must not fit.
test('fitsSave rejects a save with no letters object', () => {
  const { store } = harness();
  assert.equal(store.fitsSave({ marks: {}, composing: null }), false);
  assert.equal(store.fitsSave({ letters: null, marks: {}, composing: null }), false);
});

// An array is an object too, but its indices are not cell ids: index 1 would mark cell 1.
test('restoreFields does not read a marks array as a cell id map', () => {
  const { store } = harness();
  store.restoreFields({ letters: { 1: 'a' }, marks: ['checked', 'checked'] });
  assert.equal(store.getMark(1), null);
});

// Cell 3 is a gap in this board, as a block is in a Crushword grid.
test('fitsSave rejects a save that names a cell the board lacks', () => {
  const { store } = harness();
  const fits = { letters: { 1: 'a' }, marks: { 1: 'checked' }, composing: null };
  assert.equal(store.fitsSave({ ...fits, letters: { 1: 'a', 3: 'b' } }), false, 'a letter');
  assert.equal(store.fitsSave({ ...fits, marks: { 1: 'checked', 3: 'revealed' } }), false, 'a mark');
  assert.equal(store.fitsSave({ ...fits, composing: 3 }), false, 'the composing cell');
});

test('show, when given, displays each letter in place of setLetterText', () => {
  const shown = [];
  const { store } = harness([1], { show: (el, text) => shown.push(text) });
  store.setCellLetter(1, 'abc');
  store.clearCells();
  assert.deepEqual(shown, ['abc', '']);
});

// The mark layer draws each mark's shape (setupMarkLayer); the store is the one writer of
// marks, so it is the one caller.
test('setMark calls drawMark with the cell and value', () => {
  const drawn = [];
  const { store } = harness([1, 2, 4], { drawMark: (n, mark) => drawn.push([n, mark]) });
  store.setMark(2, 'wrong');
  store.setCellLetter(2, 'a');
  assert.deepEqual(drawn, [[2, 'wrong'], [2, null]]);
});

test('restoreFields draws each restored mark', () => {
  const drawn = [];
  const { store } = harness([1, 2, 4], { drawMark: (n, mark) => { if (mark) drawn.push([n, mark]); } });
  store.restoreFields({ letters: { 1: 'a', 4: 'b' }, marks: { 1: 'checked', 4: 'revealed' } });
  assert.deepEqual(drawn, [[1, 'checked'], [4, 'revealed']]);
});

// The locking rule's home is the comment on isLocked in makeCellStore.
test('isLocked is true for checked and revealed and false for none', () => {
  const { store } = harness();
  store.setMark(1, 'checked');
  store.setMark(2, 'revealed');
  assert.deepEqual([1, 2, 4].map(store.isLocked), [true, true, false]);
  store.setMark(4, 'wrong');
  assert.equal(store.isLocked(4), false);
});

// The lock's backstop: a key path that forgot to check isLocked can't overwrite a checked
// or revealed cell, or unlock it by clearing its mark.
test('setCellLetter leaves a checked or revealed cell alone', () => {
  const { store } = harness();
  for (const mark of ['checked', 'revealed']) {
    store.setMark(1, null);
    store.setCellLetter(1, 'a');
    store.setMark(1, mark);
    store.setCellLetter(1, 'q');
    store.setCellLetter(1, '');
    assert.equal(store.getCellLetter(1), 'a', mark);
    assert.equal(store.getMark(1), mark);
  }
});

test('setCellLetter still writes a wrong-marked cell, clearing the mark', () => {
  const { store } = harness();
  store.setCellLetter(1, 'x');
  store.setMark(1, 'wrong');
  store.setCellLetter(1, 'a');
  assert.equal(store.getCellLetter(1), 'a');
  assert.equal(store.getMark(1), null);
});

// Clear and Play again are the one way to empty a locked cell.
test('clearCells empties locked cells too', () => {
  const { store } = harness();
  store.setCellLetter(1, 'a');
  store.setMark(1, 'checked');
  store.setCellLetter(2, 'b');
  store.setMark(2, 'revealed');
  store.clearCells();
  assert.deepEqual([1, 2].map(store.getCellLetter), ['', '']);
  assert.deepEqual([1, 2].map(store.getMark), [null, null]);
});
