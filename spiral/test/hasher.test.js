'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparePuzzle } = require('../src/hasher');
const sha256hex = require('../../shared/sha256hex');
const { joinCells } = require('../../shared/boardString');

function minimal() {
  return {
    kind: 'spiral', title: 'Test', hashed: false,
    inward:  [{ clue: 'A', answer: 'ABCD' }, { clue: 'B', answer: 'EFGH' }],
    outward: [{ clue: 'C', answer: 'HGFE' }, { clue: 'D', answer: 'DCBA' }],
  };
}

test('preparePuzzle: includes title, author, date, hashed', () => {
  const p = { ...minimal(), author: 'Greg', date: '2026' };
  const r = preparePuzzle(p);
  assert.equal(r.title, 'Test');
  assert.equal(r.author, 'Greg');
  assert.equal(r.date, '2026');
  assert.equal(r.hashed, false);
});

test('preparePuzzle: inward/outward entries have clue and length', () => {
  const r = preparePuzzle(minimal());
  assert.equal(r.inward[0].clue, 'A');
  assert.equal(r.inward[0].length, 4);
  assert.equal(r.outward[0].clue, 'C');
  assert.equal(r.outward[0].length, 4);
});

test('preparePuzzle: non-hashed includes letters array', () => {
  const r = preparePuzzle(minimal());
  assert.ok(Array.isArray(r.letters));
  assert.equal(r.letters.length, 8); // 4+4 cells
  assert.deepEqual(r.letters, ['a','b','c','d','e','f','g','h']);
});

test('preparePuzzle: non-hashed includes boardHash', () => {
  const r = preparePuzzle(minimal());
  assert.ok('boardHash' in r, 'boardHash must be present in non-hashed output');
});

test('preparePuzzle: hashed mode has boardHash, no letters', () => {
  const p = { ...minimal(), hashed: true };
  const r = preparePuzzle(p);
  assert.equal(r.letters, undefined);
  assert.match(r.boardHash, /^[0-9a-f]{64}$/);
});

test('preparePuzzle: boardHash equals sha256hex of inward canonical string', () => {
  // minimal() inward: ABCD, EFGH → cells: a,b,c,d,e,f,g,h → canonical: 'a.b.c.d.e.f.g.h'
  // same as joinCells(letters) in non-hashed mode
  const p = { ...minimal(), hashed: true };
  const r = preparePuzzle(p);
  assert.equal(r.boardHash, sha256hex(joinCells(['a','b','c','d','e','f','g','h'])));
});

test('preparePuzzle: boardHash equals sha256hex(joinCells(letters)) for the same puzzle', () => {
  const p = {
    kind: 'spiral', title: 'T', hashed: false,
    inward:  [{ clue: 'A', answer: 'ABCD' }, { clue: 'B', answer: 'EFGH' }],
    outward: [{ clue: 'C', answer: 'HGFE' }, { clue: 'D', answer: 'DCBA' }],
  };
  const nonHashed = preparePuzzle({ ...p, hashed: false });
  const hashed    = preparePuzzle({ ...p, hashed: true });
  assert.equal(hashed.boardHash, sha256hex(joinCells(nonHashed.letters)));
});

test('preparePuzzle: normalizes spaces and hyphens in answers', () => {
  const p = {
    kind: 'spiral', title: 'T', hashed: false,
    inward:  [{ clue: 'A', answer: 'WAH-WAH' }],
    outward: [{ clue: 'B', answer: 'HAW WAH' }],
  };
  const r = preparePuzzle(p);
  assert.equal(r.inward[0].length, 6);  // wahwah
  assert.deepEqual(r.letters, ['w','a','h','w','a','h']);
});

test('preparePuzzle: hashed:true defaults to false when absent', () => {
  const p = minimal();
  delete p.hashed;
  const r = preparePuzzle(p);
  assert.equal(r.hashed, false);
  assert.ok(Array.isArray(r.letters));
});

test('preparePuzzle: instructions is rendered as markdown when present', () => {
  const p = { ...minimal(), instructions: 'Solve the *spiral*.' };
  const r = preparePuzzle(p);
  assert.equal(r.instructions, '<p>Solve the <em>spiral</em>.</p>\n');
});

// ── styles passthrough ────────────────────────────────────────────────────────

test('preparePuzzle: passes styles through to inward entry when present', () => {
  const p = minimal();
  p.inward[0].styles = { circle: [0, 2] };
  const r = preparePuzzle(p);
  assert.deepEqual(r.inward[0].styles, { circle: [0, 2] });
  assert.equal(r.inward[1].styles, undefined);
});

// ── boardHash passthrough (muddled mode) ──────────────────────────────────────

test('preparePuzzle: passthrough — uses puzzle.boardHash directly without recomputing', () => {
  const puzzle = {
    kind: 'spiral', title: 'T',
    hashed: true,
    boardHash: 'precomputed-spiral-hash',
    inward:  [{ clue: 'a', hash: 'h1', length: 5 }, { clue: 'b', hash: 'h2', length: 5 }],
    outward: [{ clue: 'c', hash: 'h3', length: 5 }, { clue: 'd', hash: 'h4', length: 5 }],
  };
  const result = preparePuzzle(puzzle);
  assert.equal(result.boardHash, 'precomputed-spiral-hash');
  assert.ok(!('letters' in result));
});

test('letters carries one entry per cell, including multi-letter cells', () => {
  const puzzle = {
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'a', answer: 'S[HAR]ON' }],
    outward: [{ clue: 'b', answer: 'NO[HAR]S' }],
  };
  const prepared = preparePuzzle(puzzle);
  assert.deepStrictEqual(prepared.letters, ['s', 'har', 'o', 'n']);
});
