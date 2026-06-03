'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparePuzzle } = require('../src/hasher');
const sha256hex = require('../../shared/sha256hex');

// 5×5 puzzle from the plan's test reference
function minimalPuzzle() {
  return {
    kind: 'marching-bands', title: 'Test', hashed: false,
    rows: [
      { entries: [{ clue: 'A', answer: 'AB' },    { clue: 'B', answer: 'CDE' }] },
      { entries: [{ clue: 'C', answer: 'FG' },    { clue: 'D', answer: 'HIJ' }] },
      { entries: [{ clue: 'E', answer: 'KL' },    { clue: 'F', answer: 'MN'  }] },
      { entries: [{ clue: 'G', answer: 'OPQ' },   { clue: 'H', answer: 'RS'  }] },
      { entries: [{ clue: 'I', answer: 'TU' },    { clue: 'J', answer: 'VWX' }] },
    ],
    bands: [
      { entries: [
        { clue: 'K', answer: 'ABCDE' }, { clue: 'L', answer: 'JNSX' },
        { clue: 'M', answer: 'WVUT'  }, { clue: 'N', answer: 'OKF'  },
      ] },
      { entries: [
        { clue: 'O', answer: 'GHI' }, { clue: 'P', answer: 'MR' },
        { clue: 'Q', answer: 'QP'  }, { clue: 'R', answer: 'L'  },
      ] },
    ],
  };
}

test('preparePuzzle: includes metadata fields', () => {
  const p = { ...minimalPuzzle(), author: 'Greg', date: '2026' };
  const r = preparePuzzle(p);
  assert.equal(r.title, 'Test');
  assert.equal(r.author, 'Greg');
  assert.equal(r.date, '2026');
  assert.equal(r.kind, 'marching-bands');
  assert.equal(r.hashed, false);
  assert.equal(r.size, 5);
});

test('preparePuzzle: omits author/date when absent', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.author, undefined);
  assert.equal(r.date, undefined);
});

test('preparePuzzle: instructions passed through when present', () => {
  const p = { ...minimalPuzzle(), instructions: 'Solve it.' };
  const r = preparePuzzle(p);
  assert.equal(r.instructions, 'Solve it.');
});

test('preparePuzzle: instructions absent when not set', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.instructions, undefined);
});

test('preparePuzzle: row entries have clue and length (not answer)', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.rows[0].entries[0].clue, 'A');
  assert.equal(r.rows[0].entries[0].length, 2); // 'AB'
  assert.equal(r.rows[0].entries[1].length, 3); // 'CDE'
  assert.equal(r.rows[0].entries[0].answer, undefined);
});

test('preparePuzzle: band entries have clue and length (not answer)', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.bands[0].entries[0].clue, 'K');
  assert.equal(r.bands[0].entries[0].length, 5); // 'ABCDE'
  assert.equal(r.bands[0].entries[0].answer, undefined);
});

test('preparePuzzle: styles preserved when present', () => {
  const p = minimalPuzzle();
  p.rows[0].entries[0].styles = { circle: [0] };
  const r = preparePuzzle(p);
  assert.deepEqual(r.rows[0].entries[0].styles, { circle: [0] });
});

test('preparePuzzle: non-hashed builds letters array row-major', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.ok(Array.isArray(r.letters));
  // N=5, so 5*5=25 elements (null at center index 12)
  assert.equal(r.letters.length, 25);
  // Row 1: a,b,c,d,e
  assert.deepEqual(r.letters.slice(0, 5), ['a', 'b', 'c', 'd', 'e']);
  // Row 2: f,g,h,i,j
  assert.deepEqual(r.letters.slice(5, 10), ['f', 'g', 'h', 'i', 'j']);
  // Row 3: k,l,null,m,n (center at index 12)
  assert.deepEqual(r.letters.slice(10, 15), ['k', 'l', null, 'm', 'n']);
  // Row 5: t,u,v,w,x
  assert.deepEqual(r.letters.slice(20, 25), ['t', 'u', 'v', 'w', 'x']);
});

test('preparePuzzle: non-hashed does not include boardHash', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.boardHash, undefined);
});

test('preparePuzzle: hashed mode has boardHash, no letters', () => {
  const p = { ...minimalPuzzle(), hashed: true };
  const r = preparePuzzle(p);
  assert.equal(r.letters, undefined);
  assert.match(r.boardHash, /^[0-9a-f]{64}$/);
});

test('preparePuzzle: boardHash is sha256 of row-major letters skipping center, lowercase', () => {
  const p = { ...minimalPuzzle(), hashed: true };
  const r = preparePuzzle(p);
  // Row-major: abcde fghij kl mn opqrs tuvwx (center skipped)
  const expected = sha256hex('abcdefghijklmnopqrstuvwx');
  assert.equal(r.boardHash, expected);
});
