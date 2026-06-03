'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bandIndexOf, bandCells, centerFlatIndex, centerN } = require('../src/layout');

// ── bandIndexOf ──────────────────────────────────────────────────────────────

test('bandIndexOf: corners of outermost band are band 0', () => {
  assert.equal(bandIndexOf(1, 1, 7), 0);
  assert.equal(bandIndexOf(1, 7, 7), 0);
  assert.equal(bandIndexOf(7, 1, 7), 0);
  assert.equal(bandIndexOf(7, 7, 7), 0);
});

test('bandIndexOf: inner cells get higher band index', () => {
  assert.equal(bandIndexOf(2, 2, 7), 1);
  assert.equal(bandIndexOf(3, 3, 7), 2);
  assert.equal(bandIndexOf(4, 4, 7), 3); // center for N=7
});

test('bandIndexOf: N=5 center cell is band 2', () => {
  // center (3,3) for N=5: min(2,2,2,2) = 2
  assert.equal(bandIndexOf(3, 3, 5), 2);
});

test('bandIndexOf: N=5 band 0 and band 1 cells', () => {
  assert.equal(bandIndexOf(1, 3, 5), 0); // top edge
  assert.equal(bandIndexOf(3, 5, 5), 0); // right edge
  assert.equal(bandIndexOf(2, 2, 5), 1); // inner band
  assert.equal(bandIndexOf(2, 4, 5), 1); // inner band
});

// ── bandCells ────────────────────────────────────────────────────────────────

test('bandCells: band 0 N=5 has correct count', () => {
  assert.equal(bandCells(0, 5).length, 16); // 4*(5-1)
});

test('bandCells: band 1 N=5 has correct count', () => {
  assert.equal(bandCells(1, 5).length, 8); // 4*(5-3)
});

test('bandCells: band 0 N=7 has correct count', () => {
  assert.equal(bandCells(0, 7).length, 24); // 4*(7-1)
});

test('bandCells: band 0 N=5 starts at cell 1 (top-left)', () => {
  // n=1 is row 1, col 1 (top-left corner)
  assert.equal(bandCells(0, 5)[0], 1);
});

test('bandCells: band 0 N=5 clockwise order — top edge first', () => {
  const cells = bandCells(0, 5);
  // Top edge: n=1,2,3,4,5 (row 1, cols 1-5)
  assert.deepEqual(cells.slice(0, 5), [1, 2, 3, 4, 5]);
  // Right edge: n=10,15,20,25 (col 5, rows 2-5)
  assert.deepEqual(cells.slice(5, 9), [10, 15, 20, 25]);
  // Bottom edge: n=24,23,22,21 (row 5, cols 4-1)
  assert.deepEqual(cells.slice(9, 13), [24, 23, 22, 21]);
  // Left edge: n=16,11,6 (col 1, rows 4-2)
  assert.deepEqual(cells.slice(13, 16), [16, 11, 6]);
});

test('bandCells: band 1 N=5 clockwise order', () => {
  const cells = bandCells(1, 5);
  // Top edge: row 2, cols 2-4 → n=7,8,9
  assert.deepEqual(cells.slice(0, 3), [7, 8, 9]);
  // Right edge: col 4, rows 3-4 → n=14,19
  assert.deepEqual(cells.slice(3, 5), [14, 19]);
  // Bottom edge: row 4, cols 3-2 → n=18,17
  assert.deepEqual(cells.slice(5, 7), [18, 17]);
  // Left edge: col 2, row 3 → n=12
  assert.deepEqual(cells.slice(7, 8), [12]);
});

test('bandCells: all cells in outermost band have bandIndexOf = 0', () => {
  const N = 7;
  const cells = bandCells(0, N);
  for (const n of cells) {
    const row = Math.ceil(n / N);
    const col = ((n - 1) % N) + 1;
    assert.equal(bandIndexOf(row, col, N), 0, `cell ${n} (row ${row}, col ${col}) should be band 0`);
  }
});

// ── centerFlatIndex / centerN ────────────────────────────────────────────────

test('centerFlatIndex: N=5 → index 12 (0-indexed)', () => {
  // row 3, col 3: (3-1)*5 + (3-1) = 12
  assert.equal(centerFlatIndex(5), 12);
});

test('centerFlatIndex: N=7 → index 24 (0-indexed)', () => {
  // row 4, col 4: (4-1)*7 + (4-1) = 24
  assert.equal(centerFlatIndex(7), 24);
});

test('centerN: N=5 → cell ID 13 (1-indexed)', () => {
  // n = (3-1)*5 + 3 = 13
  assert.equal(centerN(5), 13);
});

test('centerN: N=7 → cell ID 25 (1-indexed)', () => {
  assert.equal(centerN(7), 25);
});

// ── bandCells additional edge cases ──────────────────────────────────────────

test('bandCells: band 1 N=7 clockwise order', () => {
  const cells = bandCells(1, 7);
  // Count: 4*(7-3) = 16
  assert.equal(cells.length, 16);
  // Top edge: row 2, cols 2-6 → n=9,10,11,12,13
  assert.deepEqual(cells.slice(0, 5), [9, 10, 11, 12, 13]);
  // Right edge: col 6, rows 3-6 → n=20,27,34,41
  assert.deepEqual(cells.slice(5, 9), [20, 27, 34, 41]);
  // Bottom edge: row 6, cols 5-2 → n=40,39,38,37
  assert.deepEqual(cells.slice(9, 13), [40, 39, 38, 37]);
  // Left edge: col 2, rows 5-3 → n=30,23,16
  assert.deepEqual(cells.slice(13, 16), [30, 23, 16]);
});

test('bandCells: all cells in each band have correct bandIndexOf', () => {
  const N = 7;
  const numBands = Math.floor(N / 2); // 3
  for (let k = 0; k < numBands; k++) {
    const cells = bandCells(k, N);
    for (const n of cells) {
      const row = Math.ceil(n / N);
      const col = ((n - 1) % N) + 1;
      assert.equal(bandIndexOf(row, col, N), k,
        `band ${k}: cell ${n} (row ${row}, col ${col}) has wrong bandIndexOf`);
    }
  }
});

test('bandCells: N=3 band 0 has 8 cells', () => {
  assert.equal(bandCells(0, 3).length, 8); // 4*(3-1)=8
});

test('bandCells: N=3 center cell is single-element band', () => {
  // For N=3, k=1 is the center band — should return [centerN(3)] = [5]
  assert.deepEqual(bandCells(1, 3), [centerN(3)]);
  assert.equal(centerN(3), 5); // row=2, col=2 → n=(2-1)*3+2=5 ✓
});
