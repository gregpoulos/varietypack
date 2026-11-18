'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparePuzzle } = require('../src/prepare');
const { sha256hex } = require('../../shared/sha256hex.mjs');
const { joinCells } = require('../../shared/boardString.mjs');

function minimal() {
  return {
    kind: 'spiral', title: 'Test', hashed: false,
    inward:  [{ clue: 'A', answer: 'ABCD' }, { clue: 'B', answer: 'EFGH' }],
    outward: [{ clue: 'C', answer: 'HGFE' }, { clue: 'D', answer: 'DCBA' }],
  };
}

test('preparePuzzle: non-hashed includes letters array', () => {
  const r = preparePuzzle(minimal());
  assert.ok(Array.isArray(r.letters));
  assert.equal(r.letters.length, 8); // 4+4 cells
  assert.deepEqual(r.letters, ['a','b','c','d','e','f','g','h']);
});

test('preparePuzzle: boardHash equals sha256hex of inward canonical string', () => {
  // minimal() inward: ABCD, EFGH → cells: a,b,c,d,e,f,g,h → canonical: 'a.b.c.d.e.f.g.h'
  // same as joinCells(letters) in non-hashed mode
  const p = { ...minimal(), hashed: true };
  const r = preparePuzzle(p);
  assert.equal(r.boardHash, sha256hex(joinCells(['a','b','c','d','e','f','g','h'])));
});

// ── boardHash passthrough (muddled mode) ──────────────────────────────────────

test('letters carries one entry per cell, including multi-letter cells', () => {
  const puzzle = {
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'a', answer: 'S[HAR]ON' }],
    outward: [{ clue: 'b', answer: 'NO[HAR]S' }],
  };
  const prepared = preparePuzzle(puzzle);
  assert.deepStrictEqual(prepared.letters, ['s', 'har', 'o', 'n']);
});

// ── muddled entries (length only, no plaintext) ──────────────────────────────

test('preparePuzzle: a muddled puzzle keeps its stored boardHash and entry lengths', () => {
  const r = preparePuzzle({
    kind: 'spiral', title: 'T', hashed: true, boardHash: 'precomputed-spiral-hash',
    inward:  [{ clue: 'a', length: 5 }, { clue: 'b', length: 5 }],
    outward: [{ clue: 'c', length: 5 }, { clue: 'd', length: 5 }],
  });
  assert.equal(r.boardHash, 'precomputed-spiral-hash');
  assert.deepEqual(r.inward.map(e => e.length), [5, 5]);
  assert.deepEqual(r.outward.map(e => e.length), [5, 5]);
});
