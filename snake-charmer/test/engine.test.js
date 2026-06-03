'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEntryMaps,
  nextRingPos,
  prevRingPos,
} = require('../src/template/engine');

// 3 entries of lengths [2,2,4] with loops=2 → total 8 cells, ringSize=4.
// concatPos: e0 → 0,1; e1 → 2,3; e2 → 4,5,6,7 (ring 0,1,2,3 in loop 1).
// Loop 0: ring 0,1 = e0; ring 2,3 = e1
// Loop 1: ring 0,1,2,3 = e2
const ENTRIES = [{ length: 2 }, { length: 2 }, { length: 4 }];
const LOOPS = 2;

// ── buildEntryMaps ─────────────────────────────────────────────────────────────

test('buildEntryMaps: assigns correct entryAtCell for a simple 4-cell / 2-loop ring', () => {
  const { entryAtCell } = buildEntryMaps(ENTRIES, LOOPS);
  assert.equal(entryAtCell.length, 4);
  // Loop 0
  assert.deepEqual(entryAtCell.map(c => c[0]), [0, 0, 1, 1]);
  // Loop 1 — entry 2 spans the whole ring
  assert.deepEqual(entryAtCell.map(c => c[1]), [2, 2, 2, 2]);
});

test('buildEntryMaps: ringPosByEntry lists correct ring positions for each entry', () => {
  const { ringPosByEntry } = buildEntryMaps(ENTRIES, LOOPS);
  assert.deepEqual(ringPosByEntry[0], [0, 1]);
  assert.deepEqual(ringPosByEntry[1], [2, 3]);
  assert.deepEqual(ringPosByEntry[2], [0, 1, 2, 3]);
});

test('buildEntryMaps: canonicalStart points to posInEntry===0 for each entry', () => {
  const { canonicalStart } = buildEntryMaps(ENTRIES, LOOPS);
  assert.deepEqual(canonicalStart[0], { ringPos: 0, loop: 0 });
  assert.deepEqual(canonicalStart[1], { ringPos: 2, loop: 0 });
  assert.deepEqual(canonicalStart[2], { ringPos: 0, loop: 1 });
});

test('buildEntryMaps: entries spanning a loop boundary appear in correct loop', () => {
  // entries [3,3] loops=2 → ringSize=3. e0 → ring 0,1,2 loop0; e1 → ring 0,1,2 loop1.
  const { entryAtCell, canonicalStart } = buildEntryMaps([{ length: 3 }, { length: 3 }], 2);
  assert.deepEqual(entryAtCell.map(c => c[0]), [0, 0, 0]);
  assert.deepEqual(entryAtCell.map(c => c[1]), [1, 1, 1]);
  assert.deepEqual(canonicalStart[1], { ringPos: 0, loop: 1 });
});

// ── nextRingPos / prevRingPos ──────────────────────────────────────────────────

test('nextRingPos: advances normally', () => {
  assert.equal(nextRingPos(0, 4), 1);
  assert.equal(nextRingPos(2, 4), 3);
});

test('nextRingPos: wraps from last to first', () => {
  assert.equal(nextRingPos(3, 4), 0);
});

test('prevRingPos: retreats normally', () => {
  assert.equal(prevRingPos(3, 4), 2);
  assert.equal(prevRingPos(1, 4), 0);
});

test('prevRingPos: wraps from first to last', () => {
  assert.equal(prevRingPos(0, 4), 3);
});


