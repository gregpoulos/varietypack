'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeCellStore } = require('../engine-state.mjs');

// Mock cell or letter element: only textContent and classList are touched, as in
// engine-state.composer.test.js.
function makeEl() {
  const classes = new Set();
  return {
    textContent: '',
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

test('setCorrect marks the cell and its letter together; isCorrect reads it', () => {
  const { store, cellEls, letterEls } = harness();
  store.setCorrect(4, true);
  assert.ok(store.isCorrect(4));
  assert.ok(cellEls[4].classList.contains('correct'));
  assert.ok(letterEls[4].classList.contains('correct'));
  store.setCorrect(4, false);
  assert.equal(store.isCorrect(4), false);
  assert.equal(letterEls[4].classList.contains('correct'), false);
});

test('a new letter clears the cell\'s correct mark', () => {
  const { store } = harness();
  store.setCellLetter(1, 'a');
  store.setCorrect(1, true);
  store.setCellLetter(1, 'b');
  assert.equal(store.isCorrect(1), false);
});

test('markAllCorrect marks every cell; clearCells empties and unmarks every cell', () => {
  const { store } = harness();
  store.setCellLetter(1, 'a');
  store.setCellLetter(4, 'b');
  store.markAllCorrect();
  assert.deepEqual([1, 2, 4].map(store.isCorrect), [true, true, true]);
  store.clearCells();
  assert.deepEqual([1, 2, 4].map(store.getCellLetter), ['', '', '']);
  assert.deepEqual([1, 2, 4].map(store.isCorrect), [false, false, false]);
});

test('saveFields gives letters keyed by cell id and the correct cells; restoreFields puts them back', () => {
  const a = harness().store;
  a.setCellLetter(1, 'a');
  a.setCellLetter(4, 'bc');
  a.setCorrect(4, true);
  const saved = JSON.parse(JSON.stringify(a.saveFields())); // as localStorage round-trips it
  assert.deepEqual(saved, { letters: { 1: 'a', 4: 'bc' }, correct: [4] });

  const { store: b, letterEls } = harness();
  b.restoreFields(saved);
  assert.deepEqual([1, 2, 4].map(b.getCellLetter), ['a', '', 'bc']);
  assert.equal(letterEls[4].textContent, 'BC');
  assert.deepEqual([1, 2, 4].map(b.isCorrect), [false, false, true]);
});

test('fitsSave accepts a save this board made, composing or not', () => {
  const { store } = harness();
  store.setCellLetter(4, 'bc');
  const saved = JSON.parse(JSON.stringify(store.saveFields())); // as localStorage round-trips it
  assert.equal(store.fitsSave({ ...saved, composing: null }), true);
  assert.equal(store.fitsSave({ ...saved, composing: 4 }), true);
});

// Cell 3 is a gap in this board, as a block is in a Crushword grid.
test('fitsSave rejects a save that names a cell the board lacks', () => {
  const { store } = harness();
  const fits = { letters: { 1: 'a' }, correct: [1], composing: null };
  assert.equal(store.fitsSave({ ...fits, letters: { 1: 'a', 3: 'b' } }), false, 'a letter');
  assert.equal(store.fitsSave({ ...fits, correct: [1, 3] }), false, 'a correct mark');
  assert.equal(store.fitsSave({ ...fits, composing: 3 }), false, 'the composing cell');
});

test('show, when given, displays each letter in place of setLetterText', () => {
  const shown = [];
  const { store } = harness([1], { show: (el, text) => shown.push(text) });
  store.setCellLetter(1, 'abc');
  store.clearCells();
  assert.deepEqual(shown, ['abc', '']);
});
