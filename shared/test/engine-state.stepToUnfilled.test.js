'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { stepToUnfilled } = require('../engine-state.mjs');

// Entries a..d own cells 1-2, 3-4, 5-6, 7-8. `filled` is the set of cells with content.
const CELLS = { a: [1, 2], b: [3, 4], c: [5, 6], d: [7, 8] };
const ORDER = ['a', 'b', 'c', 'd'];
const step = (from, dir, filled) =>
  stepToUnfilled(ORDER, from, dir, k => CELLS[k], n => filled.has(n));

test('skips filled entries going forward and lands on the next incomplete one', () => {
  const filled = new Set([3, 4, 5, 6]);
  assert.deepEqual(step('a', 1, filled), { entry: 'd', cell: 7 });
});

test('skips filled entries going backward', () => {
  const filled = new Set([5, 6, 7, 8]);
  assert.deepEqual(step('d', -1, filled), { entry: 'b', cell: 3 });
});

test('lands on the first unfilled cell of a partly filled entry, not its first cell', () => {
  const filled = new Set([5]);
  assert.deepEqual(step('a', 1, new Set([3, 4])), { entry: 'c', cell: 5 });
  assert.deepEqual(step('b', 1, filled), { entry: 'c', cell: 6 });
});

test('wraps past the end of the order', () => {
  const filled = new Set([7, 8]);
  assert.deepEqual(step('c', 1, filled), { entry: 'a', cell: 1 });
});

test('comes back to the starting entry when it is the only incomplete one', () => {
  const filled = new Set([1, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(step('a', 1, filled), { entry: 'a', cell: 2 });
});

test('steps plainly to the neighbor\'s first cell when every entry is filled', () => {
  const filled = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(step('b', 1, filled), { entry: 'c', cell: 5 });
  assert.deepEqual(step('a', -1, filled), { entry: 'd', cell: 7 });
});
