'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildEntryMaps } = require('../src/typing.mjs');
const { crossingRows } = require('../src/crossings.mjs');

// 3×4 grid. Row 0 is a 4-cell Across; column 3 has no Down entry through row 0
// because (1,3) is blocked, so cell 4 is uncrossed.
const GRID = ['....', '...#', '...#'];
const maps = buildEntryMaps(GRID);

test('crossingRows: an Across entry lists the Down entry through each cell, in order', () => {
  const m = crossingRows(maps, 2, 'across');        // cell 2 = (0,1), in 1-Across
  assert.equal(m.num, 1);
  assert.deepEqual(m.cells, [1, 2, 3, 4]);
  assert.deepEqual(m.rows.map(r => r.cell), [1, 2, 3, 4]);
  assert.deepEqual(m.rows.slice(0, 3).map(r => r.crossing.num), [1, 2, 3]);
  assert.deepEqual(m.rows[0].crossing.cells, [1, 5, 9]);
});

test('crossingRows: a cell with no entry the other way has a null crossing', () => {
  assert.equal(crossingRows(maps, 1, 'across').rows[3].crossing, null);
});

test('crossingRows: a Down entry lists Across entries top to bottom', () => {
  const m = crossingRows(maps, 5, 'down');          // cell 5 = (1,0), in 1-Down
  assert.equal(m.num, 1);
  assert.deepEqual(m.rows.map(r => r.crossing.num), [1, 4, 5]);
});

test('crossingRows: the result is the same from any cell of the entry', () => {
  assert.deepEqual(crossingRows(maps, 1, 'across'), crossingRows(maps, 4, 'across'));
});
