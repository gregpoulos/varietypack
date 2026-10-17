'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { formatCell, formatAnswer, formatSequence, parseSequence, sameCells, diffCells } = require('../src/model/cells');
const { StructureError } = require('../src/model/errors');

test('StructureError is an Error with its own name', () => {
  const e = new StructureError('nope');
  assert.ok(e instanceof Error);
  assert.equal(e.name, 'StructureError');
  assert.equal(e.message, 'nope');
});

test('formatCell: empty, single letter, rebus', () => {
  assert.equal(formatCell(''), '·');
  assert.equal(formatCell('a'), 'A');
  assert.equal(formatCell('har'), '[HAR]');
});

test('formatAnswer: brackets a rebus cell, and refuses an empty one', () => {
  assert.equal(formatAnswer(['s', 'har', 'o', 'n']), 'S[HAR]ON');
  assert.throws(() => formatAnswer(['a', '', 'b']), /empty/);
});

test('formatSequence: like formatAnswer, with _ for an empty cell', () => {
  assert.equal(formatSequence(['a', '', 'har']), 'A_[HAR]');
});

test('parseSequence: letters, rebus groups and _', () => {
  assert.deepEqual(parseSequence('S[HAR]ON'), { cells: ['s', 'har', 'o', 'n'], error: null });
  assert.deepEqual(parseSequence('AB_C'), { cells: ['a', 'b', '', 'c'], error: null });
});

test('parseSequence: spaces, hyphens and apostrophes are skipped', () => {
  assert.equal(parseSequence('LIE TO').cells.length, 5);
  assert.deepEqual(parseSequence("DON'T WAH-WAH").cells.join(''), 'dontwahwah');
});

test('parseSequence: each bracket grammar error is reported', () => {
  assert.match(parseSequence('A[BC').error, /unclosed "\["/);
  assert.match(parseSequence('A[B[C]]').error, /nested "\["/);
  assert.match(parseSequence('AB]').error, /unmatched "\]"/);
  assert.match(parseSequence('A[]B').error, /contains no letters/);
  assert.equal(parseSequence('A[]B').cells, null);
});

test('sameCells compares element by element', () => {
  assert.equal(sameCells(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameCells(['a', 'b'], ['a']), false);
  assert.equal(sameCells(['a', 'b'], ['a', 'c']), false);
});

test('diffCells: insert in the middle, delete at the end, replace one', () => {
  assert.deepEqual(diffCells(['a', 'b', 'c'], ['a', 'x', 'b', 'c']), { start: 1, removed: 0, inserted: 1 });
  assert.deepEqual(diffCells(['a', 'b', 'c'], ['a', 'b']), { start: 2, removed: 1, inserted: 0 });
  assert.deepEqual(diffCells(['a', 'b', 'c'], ['a', 'x', 'c']), { start: 1, removed: 1, inserted: 1 });
});

test('diffCells: the prefix and suffix never overlap (repeated letters)', () => {
  assert.deepEqual(diffCells(['a', 'a', 'a'], ['a', 'a', 'a', 'a']), { start: 3, removed: 0, inserted: 1 });
});

test('diffCells: identical sequences', () => {
  assert.deepEqual(diffCells(['a', 'b'], ['a', 'b']), { start: 2, removed: 0, inserted: 0 });
});
