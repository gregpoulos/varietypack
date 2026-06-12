'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparePuzzle } = require('../src/hasher');
const sha256hex  = require('../../shared/sha256hex');

// ── preparePuzzle (non-hashed, default) ──────────────────────────────────────

test('preparePuzzle: non-hashed mode returns letters array of length ringSize', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  // concat='abcdefabcdef', ringSize=6
  const result = preparePuzzle(puzzle);
  assert.deepEqual(result.letters, ['a','b','c','d','e','f']);
});

test('preparePuzzle: non-hashed mode entries have no hash, no answer', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  for (const e of result.entries) {
    assert.equal(e.answer, undefined);
    assert.equal(e.hash, undefined);
  }
});

test('preparePuzzle: non-hashed mode entries have clue and length', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.entries[0].clue, 'One');
  assert.equal(result.entries[0].length, 3);
  assert.equal(result.entries[2].length, 6);
});

test('preparePuzzle: non-hashed letters normalize multi-word answer (LIE TO → lieto)', () => {
  // LIE TO + LIETO = 'lietolieto', ringSize=5, letters=['l','i','e','t','o']
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'A', answer: 'LIE TO' },
      { clue: 'B', answer: 'LIETO' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.deepEqual(result.letters, ['l','i','e','t','o']);
});

// ── preparePuzzle (hashed: true) ─────────────────────────────────────────────

test('preparePuzzle: hashed mode has boardHash, no letters, no per-entry hash', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2, hashed: true,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.letters, undefined);
  assert.match(result.boardHash, /^[0-9a-f]{64}$/);
  for (const e of result.entries) {
    assert.equal(e.hash, undefined);
    assert.equal(e.answer, undefined);
  }
});

test('preparePuzzle: boardHash equals sha256hex of the ring string', () => {
  // concat = normalize('ABC'+'DEF'+'ABCDEF') = 'abcdefabcdef', ringSize = 12/2 = 6
  // ring string = 'abcdef' — same as letters.join('') in non-hashed mode
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2, hashed: true,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.boardHash, sha256hex('abcdef'));
});

test('preparePuzzle: boardHash equals sha256hex(letters.join("")) for the same puzzle', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const nonHashed = preparePuzzle({ ...puzzle, hashed: false });
  const hashed    = preparePuzzle({ ...puzzle, hashed: true });
  assert.equal(hashed.boardHash, sha256hex(nonHashed.letters.join('')));
});

test('preparePuzzle: result includes loops and hashed fields', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.loops, 2);
  assert.equal(result.hashed, false);
});

test('preparePuzzle: defaults loops to 2 and hashed to false', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.loops, 2);
  assert.equal(result.hashed, false);
});

// ── preparePuzzle styles ──────────────────────────────────────────────────────

test('preparePuzzle: passes styles through to entry when present', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC', styles: { circle: [0, 2] } },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.deepEqual(result.entries[0].styles, { circle: [0, 2] });
  assert.equal(result.entries[1].styles, undefined);
});

test('preparePuzzle: omits styles key when entry has no styles', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  for (const e of result.entries) {
    assert.equal(e.styles, undefined);
  }
});

// ── boardHash passthrough (muddled mode) ──────────────────────────────────────

test('preparePuzzle: passthrough — when puzzle.boardHash present, uses it directly without recomputing', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    hashed: true,
    boardHash: 'precomputed-hash-abc',
    entries: [
      { clue: 'One',   hash: 'h1', length: 6 },
      { clue: 'Two',   hash: 'h2', length: 6 },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.boardHash, 'precomputed-hash-abc');
  assert.ok(!('letters' in result));
});

test('preparePuzzle: passthrough — no per-entry hash in PUZZLE_DATA entries', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    hashed: true,
    boardHash: 'precomputed-hash',
    entries: [
      { clue: 'One', length: 3 },
      { clue: 'Two', length: 3 },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.ok(!('hash' in result.entries[0]));
  assert.ok(!('hash' in result.entries[1]));
});

test('preparePuzzle: non-hashed mode unchanged — still computes letters array', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One',   answer: 'ABC' },
      { clue: 'Two',   answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.deepEqual(result.letters, ['a','b','c','d','e','f']);
  assert.ok('boardHash' in result);
});

// ── boardHash in non-hashed mode ──────────────────────────────────────────────

// The puzzle used in non-hashed boardHash tests:
//   entries ABC + DEF + ABCDEF with loops=2
//   concat = 'abcdefabcdef', ringSize=6, ring='abcdef'
const RING_PUZZLE = {
  kind: 'snake-charmer', title: 'T', date: '2026', loops: 2,
  entries: [
    { clue: 'One',   answer: 'ABC'    },
    { clue: 'Two',   answer: 'DEF'    },
    { clue: 'Three', answer: 'ABCDEF' },
  ],
};

test('preparePuzzle non-hashed: boardHash is present', () => {
  const result = preparePuzzle(RING_PUZZLE);
  assert.ok(result.boardHash, 'boardHash must be present in non-hashed output');
});

test('preparePuzzle non-hashed: boardHash equals sha256hex(ring)', () => {
  const result = preparePuzzle(RING_PUZZLE);
  assert.strictEqual(result.boardHash, sha256hex('abcdef'));
});

test('preparePuzzle non-hashed: letters still present alongside boardHash', () => {
  const result = preparePuzzle(RING_PUZZLE);
  assert.ok(Array.isArray(result.letters));
  assert.deepEqual(result.letters, ['a','b','c','d','e','f']);
});

test('preparePuzzle hashed: boardHash is present (existing contract)', () => {
  const result = preparePuzzle({ ...RING_PUZZLE, hashed: true });
  assert.strictEqual(result.boardHash, sha256hex('abcdef'));
  assert.strictEqual(result.letters, undefined);
});
