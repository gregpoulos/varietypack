'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveSlots, isSymmetric, isConnected, uncluedCells } = require('../src/grid');

test('deriveSlots: fully open 3x3 grid — every cell checked in both directions', () => {
  const grid = ['...', '...', '...'];
  const { acrossSlots, downSlots } = deriveSlots(grid);
  assert.deepEqual(acrossSlots, [
    { num: 1, r: 0, c: 0, len: 3 },
    { num: 4, r: 1, c: 0, len: 3 },
    { num: 5, r: 2, c: 0, len: 3 },
  ]);
  assert.deepEqual(downSlots, [
    { num: 1, r: 0, c: 0, len: 3 },
    { num: 2, r: 0, c: 1, len: 3 },
    { num: 3, r: 0, c: 2, len: 3 },
  ]);
});

test('deriveSlots: plus-shaped grid — length-1 runs never get their own slot', () => {
  // .#.
  // ...
  // .#.
  // Row 0/2 corners have across-run length 1 (blocked immediately beside them),
  // so they only ever start a down slot, never an across one.
  const grid = ['.#.', '...', '.#.'];
  const { acrossSlots, downSlots } = deriveSlots(grid);
  assert.deepEqual(acrossSlots, [{ num: 3, r: 1, c: 0, len: 3 }]);
  assert.deepEqual(downSlots, [
    { num: 1, r: 0, c: 0, len: 3 },
    { num: 2, r: 0, c: 2, len: 3 },
  ]);
});

test('deriveSlots: L-shaped grid', () => {
  // ..
  // .#
  const grid = ['..', '.#'];
  const { acrossSlots, downSlots } = deriveSlots(grid);
  assert.deepEqual(acrossSlots, [{ num: 1, r: 0, c: 0, len: 2 }]);
  assert.deepEqual(downSlots, [{ num: 1, r: 0, c: 0, len: 2 }]);
});

test('isSymmetric: true for a 180-degree-symmetric block pattern', () => {
  assert.equal(isSymmetric(['.#.', '...', '.#.']), true);
});

test('isSymmetric: false when the pattern does not match under 180-degree rotation', () => {
  assert.equal(isSymmetric(['##.', '...', '.#.']), false);
});

test('isConnected: true when every open cell reaches every other', () => {
  assert.equal(isConnected(['...', '...', '...']), true);
});

test('isConnected: false when open cells form two separate regions', () => {
  assert.equal(isConnected(['..#', '###', '#..']), false);
});

test('isConnected: true for a grid with no open cells (vacuously connected)', () => {
  assert.equal(isConnected(['##', '##']), true);
});

test('uncluedCells: empty when every open cell belongs to some slot', () => {
  assert.deepEqual(uncluedCells(['.#.', '...', '.#.']), []);
});

test('uncluedCells: an open cell with only length-1 runs in both directions is reported', () => {
  // ..#
  // ..#
  // ##.   <- (2,2) is open but boxed in: no across run, no down run
  assert.deepEqual(uncluedCells(['..#', '..#', '##.']), [{ r: 2, c: 2 }]);
});
