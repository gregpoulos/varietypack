'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cellCoords, gridDimensions, svgSize, deriveNumbering, cellDimensions } = require('../src/layout');

test('cellCoords: top-left pixel origin of a cell, width and height independent', () => {
  assert.deepEqual(cellCoords(0, 0, 34, 34), { x: 0, y: 0 });
  assert.deepEqual(cellCoords(2, 3, 50, 34), { x: 150, y: 68 });
});

test('gridDimensions: rows and cols from a rectangular grid', () => {
  assert.deepEqual(gridDimensions(['...', '...']), { rows: 2, cols: 3 });
});

test('svgSize: pixel width/height from grid dimensions and cell dimensions', () => {
  assert.deepEqual(svgSize(['...', '...'], 50, 34), { width: 150, height: 68 });
});

test('deriveNumbering: numbers every cell that starts an across or down slot', () => {
  // 3x3 fully open grid: across {1,4,5}, down {1,2,3} (see grid.test.js).
  const grid = ['...', '...', '...'];
  const numbering = deriveNumbering(grid);
  assert.deepEqual(numbering, { '0,0': 1, '1,0': 4, '2,0': 5, '0,1': 2, '0,2': 3 });
});

test('deriveNumbering: a cell starting both an across and down slot gets one shared number', () => {
  const grid = ['...', '...', '...'];
  const numbering = deriveNumbering(grid);
  // (0,0) starts both across[1] and down[1] — same number, one entry.
  assert.equal(numbering['0,0'], 1);
});

test('deriveNumbering: a non-starting open cell has no entry', () => {
  const grid = ['...', '...', '...'];
  const numbering = deriveNumbering(grid);
  assert.equal(numbering['1,1'], undefined);
});

// ── cellDimensions ───────────────────────────────────────────────────────────

test('cellDimensions: height is always the base size regardless of maxCellLetters', () => {
  assert.equal(cellDimensions(1, 34).height, 34);
  assert.equal(cellDimensions(3, 34).height, 34);
  assert.equal(cellDimensions(6, 34).height, 34);
});

test('cellDimensions: width equals the base size (square) when only one letter fits', () => {
  assert.equal(cellDimensions(1, 34).width, 34);
});

test('cellDimensions: width grows strictly with maxCellLetters', () => {
  const w1 = cellDimensions(1, 34).width;
  const w3 = cellDimensions(3, 34).width;
  const w5 = cellDimensions(5, 34).width;
  assert.ok(w3 > w1, 'width for maxCellLetters=3 should exceed maxCellLetters=1');
  assert.ok(w5 > w3, 'width for maxCellLetters=5 should exceed maxCellLetters=3');
});

test('cellDimensions: defaults baseSize to 34 when omitted', () => {
  assert.deepEqual(cellDimensions(1), { width: 34, height: 34 });
});
