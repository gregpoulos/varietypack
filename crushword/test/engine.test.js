'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntryMaps, nextInOrder, prevInOrder } = require('../src/template/engine');

// 3x3 fully open grid: across {1,4,5} (each len 3), down {1,2,3} (each len 3).
// cellId = row*3 + col + 1 (1-indexed, row-major over the whole 3x3 grid).
const GRID3 = ['...', '...', '...'];

test('buildEntryMaps: across/down orders match the grid numbering', () => {
  const { acrossOrder, downOrder } = buildEntryMaps(GRID3);
  assert.deepEqual(acrossOrder, [1, 4, 5]);
  assert.deepEqual(downOrder, [1, 2, 3]);
});

test('buildEntryMaps: cellsOfAcross/cellsOfDown list cells in entry order', () => {
  const { cellsOfAcross, cellsOfDown } = buildEntryMaps(GRID3);
  assert.deepEqual(cellsOfAcross[1], [1, 2, 3]);   // row 0
  assert.deepEqual(cellsOfAcross[4], [4, 5, 6]);   // row 1
  assert.deepEqual(cellsOfDown[1], [1, 4, 7]);     // col 0
});

test('buildEntryMaps: acrossAt/downAt give num/pos/len for a cell', () => {
  const { acrossAt, downAt } = buildEntryMaps(GRID3);
  assert.deepEqual(acrossAt[2], { num: 1, pos: 1, len: 3 }); // (0,1), mid of across[1]
  assert.deepEqual(downAt[2], { num: 2, pos: 0, len: 3 });   // (0,1), start of down[2]
});

test('buildEntryMaps: a cell with no entry in a direction is undefined there', () => {
  // In a grid with a block, some cells only belong to one direction.
  const grid = ['.#.', '...'];
  const { acrossAt, downAt } = buildEntryMaps(grid);
  // (0,0) is cellId 1: across run at row0 is length 1 (blocked at col1) -> no across slot.
  assert.equal(acrossAt[1], undefined);
  assert.ok(downAt[1]); // col 0 has a down run of length 2
});

test('nextInOrder / prevInOrder wrap', () => {
  const order = [1, 4, 5];
  assert.equal(nextInOrder(order, 1), 4);
  assert.equal(nextInOrder(order, 5), 1);
  assert.equal(prevInOrder(order, 1), 5);
  assert.equal(prevInOrder(order, 4), 1);
});
