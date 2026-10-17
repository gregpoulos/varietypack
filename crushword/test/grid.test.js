'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveSlots, slotCells, isSymmetric, isConnected, uncluedCells, uncrossedCells } = require('../src/grid.mjs');

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

test('slotCells: an across slot runs along its row, a down slot along its column', () => {
  const slot = { num: 7, r: 1, c: 2, len: 3 };
  assert.deepEqual(slotCells(slot, 'across'), [{ r: 1, c: 2 }, { r: 1, c: 3 }, { r: 1, c: 4 }]);
  assert.deepEqual(slotCells(slot, 'down'),   [{ r: 1, c: 2 }, { r: 2, c: 2 }, { r: 3, c: 2 }]);
});

test('slotCells: every derived slot covers exactly its len open cells, in reading order', () => {
  const grid = ['..#..', '.....', '#...#', '.....', '..#..'];
  const { acrossSlots, downSlots } = deriveSlots(grid);
  for (const [dir, slots] of [['across', acrossSlots], ['down', downSlots]]) {
    for (const slot of slots) {
      const cells = slotCells(slot, dir);
      assert.equal(cells.length, slot.len);
      cells.forEach(({ r, c }, i) => {
        assert.equal(grid[r][c], '.');
        if (i > 0) assert.deepEqual([r - cells[i - 1].r, c - cells[i - 1].c], dir === 'across' ? [0, 1] : [1, 0]);
      });
    }
  }
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

test('uncrossedCells: the plus-shaped grid gives its five cells crossed only once, in row-major order', () => {
  assert.deepEqual(uncrossedCells(['.#.', '...', '.#.']), [
    { r: 0, c: 0, dir: 'down' },
    { r: 0, c: 2, dir: 'down' },
    { r: 1, c: 1, dir: 'across' },
    { r: 2, c: 0, dir: 'down' },
    { r: 2, c: 2, dir: 'down' },
  ]);
});

test('uncrossedCells: a fully open grid has none', () => {
  assert.deepEqual(uncrossedCells(['...', '...', '...']), []);
});

test('uncrossedCells: a cell in no entry at all is not "crossed only once" (uncluedCells owns it)', () => {
  assert.deepEqual(uncrossedCells(['.#.', '###', '.#.']), []);
});

