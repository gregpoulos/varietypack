'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntryMaps, stepInOrder, nextCell, prevCell, arrowTarget, typeAt, deleteBefore } = require('../src/typing.mjs');

// 3x3 fully open grid: across {1,4,5} (each len 3), down {1,2,3} (each len 3).
// cellId = row*3 + col + 1 (1-indexed, row-major over the whole 3x3 grid).
const GRID3 = ['...', '...', '...'];

test('buildEntryMaps: across/down orders match the grid numbering', () => {
  const { across, down } = buildEntryMaps(GRID3);
  assert.deepEqual(across.order, [1, 4, 5]);
  assert.deepEqual(down.order, [1, 2, 3]);
});

test('buildEntryMaps: cellsOf lists an entry\'s cells in entry order', () => {
  const { across, down } = buildEntryMaps(GRID3);
  assert.deepEqual(across.cellsOf[1], [1, 2, 3]);   // row 0
  assert.deepEqual(across.cellsOf[4], [4, 5, 6]);   // row 1
  assert.deepEqual(down.cellsOf[1], [1, 4, 7]);     // col 0
});

test('buildEntryMaps: at gives num/pos/len for a cell', () => {
  const { across, down } = buildEntryMaps(GRID3);
  assert.deepEqual(across.at[2], { num: 1, pos: 1, len: 3 }); // (0,1), mid of across[1]
  assert.deepEqual(down.at[2], { num: 2, pos: 0, len: 3 });   // (0,1), start of down[2]
});

test('buildEntryMaps: a cell with no entry in a direction is undefined there', () => {
  // In a grid with a block, some cells only belong to one direction.
  const grid = ['.#.', '...'];
  const { across, down } = buildEntryMaps(grid);
  // (0,0) is cellId 1: across run at row0 is length 1 (blocked at col1) -> no across
  // slot.
  assert.equal(across.at[1], undefined);
  assert.ok(down.at[1]); // col 0 has a down run of length 2
});

test('stepInOrder steps either way, wrapping', () => {
  const order = [1, 4, 5];
  assert.equal(stepInOrder(order, 1, 1), 4);
  assert.equal(stepInOrder(order, 5, 1), 1);
  assert.equal(stepInOrder(order, 1, -1), 5);
  assert.equal(stepInOrder(order, 4, -1), 1);
});

// ── nextCell / prevCell ───────────────────────────────────────────────────────

test('nextCell / prevCell: step within an entry', () => {
  const maps = buildEntryMaps(GRID3);
  assert.equal(nextCell(maps, 1, 'across'), 2);
  assert.equal(prevCell(maps, 3, 'across'), 2);
  assert.equal(nextCell(maps, 1, 'down'), 4);
});

test('nextCell: from an entry\'s last cell, the next entry\'s first, wrapping', () => {
  const maps = buildEntryMaps(GRID3);
  assert.equal(nextCell(maps, 3, 'across'), 4);        // end of across 1 -> start of across 4
  assert.equal(nextCell(maps, 9, 'across'), 1);        // end of across 5 -> start of across 1
  assert.equal(nextCell(maps, 7, 'down'), 2);          // end of down 1 -> start of down 2
});

test('prevCell: from an entry\'s first cell, the previous entry\'s last, wrapping', () => {
  const maps = buildEntryMaps(GRID3);
  assert.equal(prevCell(maps, 4, 'across'), 3);
  assert.equal(prevCell(maps, 1, 'across'), 9);        // wraps to across 5's last cell
  assert.equal(prevCell(maps, 2, 'down'), 7);
});

// ── arrowTarget ───────────────────────────────────────────────────────────────

test('arrowTarget: skips block runs, and is null past the grid edge', () => {
  const grid = ['.##.', '....'];
  assert.equal(arrowTarget(grid, 1, 0, 1), 4);         // (0,0) right: jumps the two blocks to (0,3)
  assert.equal(arrowTarget(grid, 4, 0, -1), 1);        // and back
  assert.equal(arrowTarget(grid, 1, 1, 0), 5);         // down
  assert.equal(arrowTarget(grid, 1, -1, 0), null);     // off the top
  assert.equal(arrowTarget(grid, 8, 0, 1), null);      // off the right
});

// ── typeAt ────────────────────────────────────────────────────────────────────

test('typeAt: inserts at the cursor while the cell has room', () => {
  assert.deepEqual(typeAt('AC', 1, 'B', 3), { content: 'ABC', pos: 2 });
  assert.deepEqual(typeAt('', 0, 'A', 3), { content: 'A', pos: 1 });
});

test('typeAt: overwrites at the cursor once the cell is full', () => {
  assert.deepEqual(typeAt('ABC', 1, 'X', 3), { content: 'AXC', pos: 2 });
  assert.deepEqual(typeAt('ABC', 0, 'X', 3), { content: 'XBC', pos: 1 });
});

test('typeAt: at a full cell\'s very end, overwrites the last letter', () => {
  assert.deepEqual(typeAt('ABC', 3, 'X', 3), { content: 'ABX', pos: 3 });
  assert.deepEqual(typeAt('A', 1, 'X', 1), { content: 'X', pos: 1 });
});

test('typeAt: reaching the cap is visible in the returned position', () => {
  assert.equal(typeAt('AB', 2, 'C', 3).pos, 3);
});

// ── deleteBefore ──────────────────────────────────────────────────────────────

test('deleteBefore: removes the letter before the cursor', () => {
  assert.deepEqual(deleteBefore('ABC', 2, false), { content: 'AC', pos: 1 });
  assert.deepEqual(deleteBefore('ABC', 3, false), { content: 'AB', pos: 2 });
});

test('deleteBefore with toStart: everything before the cursor', () => {
  assert.deepEqual(deleteBefore('ABC', 2, true), { content: 'C', pos: 0 });
  assert.deepEqual(deleteBefore('ABC', 3, true), { content: '', pos: 0 });
});

