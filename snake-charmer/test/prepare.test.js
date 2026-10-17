'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparePuzzle } = require('../src/prepare');
const { sha256hex }  = require('../../shared/sha256hex.mjs');
const { joinCells } = require('../../shared/boardString.mjs');

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

test('preparePuzzle: non-hashed mode entries have no answer', () => {
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

// ── preparePuzzle (hashed: true) ─────────────────────────────────────────────

test('preparePuzzle: boardHash equals sha256hex of the ring string', () => {
  // cells = 'ABC'+'DEF'+'ABCDEF' → a,b,c,d,e,f,a,b,c,d,e,f, ringSize = 12/2 = 6
  // ring string = 'a.b.c.d.e.f' — same as joinCells(letters) in non-hashed mode
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2, hashed: true,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.boardHash, sha256hex(joinCells(['a','b','c','d','e','f'])));
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

// ── rebus cells ───────────────────────────────────────────────────────────────

// 'A[BC]DEFGHI' → cells a, bc, d, e, f, g, h, i = 8 cells.
// Ring size 8 satisfies the validator's minimum of 8 and its even-size requirement;
// 2 loops × 8 cells = 16 total, divisible by loops.
const REBUS_RING = 'A[BC]DEFGHI';

test('ring slicing keeps a rebus cell intact', () => {
  const prepared = preparePuzzle({
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'loop0', answer: REBUS_RING },
      { clue: 'loop1', answer: REBUS_RING },
    ],
  });
  assert.deepStrictEqual(prepared.letters, ['a', 'bc', 'd', 'e', 'f', 'g', 'h', 'i']);
});

// ── muddled entries (length only, no plaintext) ──────────────────────────────

test('preparePuzzle: a muddled puzzle keeps its stored boardHash and entry lengths', () => {
  const result = preparePuzzle({
    kind: 'snake-charmer', title: 'T', loops: 2, hashed: true,
    boardHash: 'precomputed-hash-abc',
    entries: [{ clue: 'One', length: 6 }, { clue: 'Two', length: 6 }],
  });
  assert.equal(result.boardHash, 'precomputed-hash-abc');
  assert.deepEqual(result.entries.map(e => e.length), [6, 6]);
});
