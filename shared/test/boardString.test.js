'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { CELL_DELIM, joinCells } = require('../boardString.mjs');

test('CELL_DELIM is a single non-alphabetic character', () => {
  assert.strictEqual(CELL_DELIM, '.');
  assert.match(CELL_DELIM, /^[^a-z]$/);
});

test('joinCells joins single-letter cells with the delimiter', () => {
  assert.strictEqual(joinCells(['p', 'a', 'r', 'i', 's']), 'p.a.r.i.s');
});

test('joinCells preserves multi-letter cell boundaries', () => {
  assert.strictEqual(joinCells(['s', 'har', 'o', 'n']), 's.har.o.n');
});

test('joinCells distinguishes segmentations with identical letters', () => {
  assert.notStrictEqual(joinCells(['har', 'o']), joinCells(['ha', 'ro']));
});

