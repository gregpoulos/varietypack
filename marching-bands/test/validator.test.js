'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/validator');

function minimalPuzzle() {
  return {
    kind: 'marching-bands',
    title: 'Test',
    rows: [
      { entries: [{ clue: 'A', answer: 'AB' }, { clue: 'B', answer: 'CDE' }] },
      { entries: [{ clue: 'C', answer: 'FG' }, { clue: 'D', answer: 'HIJ' }] },
      { entries: [{ clue: 'E', answer: 'KL' }, { clue: 'F', answer: 'MN' }] },  // center row
      { entries: [{ clue: 'G', answer: 'OPQ' }, { clue: 'H', answer: 'RS' }] },
      { entries: [{ clue: 'I', answer: 'TU' }, { clue: 'J', answer: 'VWX' }] },
    ],
    bands: [
      { entries: [
        { clue: 'K', answer: 'ABCDE' },
        { clue: 'L', answer: 'JNSX' },
        { clue: 'M', answer: 'WVUT' },
        { clue: 'N', answer: 'OKF' },
      ] },
      { entries: [
        { clue: 'O', answer: 'GHI' },
        { clue: 'P', answer: 'MR' },
        { clue: 'Q', answer: 'QP' },
        { clue: 'R', answer: 'L' },
      ] },
    ],
  };
}

test('validate: accepts minimal valid puzzle', () => {
  const { errors, warnings } = validate(minimalPuzzle());
  assert.deepEqual(errors, []);
});

test('validate: rejects wrong kind', () => {
  const p = { ...minimalPuzzle(), kind: 'spiral' };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"kind"')));
});

test('validate: rejects missing title', () => {
  const p = { ...minimalPuzzle(), title: '' };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"title"')));
});

test('validate: rejects non-boolean hashed', () => {
  const p = { ...minimalPuzzle(), hashed: 'yes' };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"hashed"')));
});

test('validate: accepts optional fields — size, instructions, author, date', () => {
  const p = { ...minimalPuzzle(), size: 5, instructions: 'Solve it.', author: 'Greg', date: '2026' };
  const { errors } = validate(p);
  assert.deepEqual(errors, []);
});

test('validate: rejects size that does not match derived N', () => {
  const p = { ...minimalPuzzle(), size: 7 };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"size"')));
});

test('validate: rejects wrong row count', () => {
  const p = minimalPuzzle();
  p.rows = p.rows.slice(0, 4); // only 4 rows for N=5
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('rows')));
});

test('validate: rejects row whose entries do not sum to N', () => {
  const p = minimalPuzzle();
  p.rows[1].entries[0].answer = 'F'; // sum = 1+3 = 4, not 5
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('rows[1]') && e.includes('sum')));
});

test('validate: center row must sum to N-1', () => {
  const p = minimalPuzzle();
  // center row is rows[2] for N=5 (row index 2 = row number 3 = (5+1)/2)
  p.rows[2].entries[0].answer = 'KLM'; // makes sum 3+2=5, not 4
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('rows[2]') && e.includes('sum')));
});

test('validate: rejects wrong band count', () => {
  const p = minimalPuzzle();
  p.bands = [p.bands[0]]; // only 1 band for N=5, expected floor(5/2)=2
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('band') && e.includes('2')));
});

test('validate: rejects band whose entries do not sum to 4*(N-1-2k)', () => {
  const p = minimalPuzzle();
  p.bands[0].entries[0].answer = 'ABC'; // band 0 sum = 3+4+4+3 = 14, not 16
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('bands[0]') && e.includes('sum')));
});

test('validate: rejects a row/band letter conflict at a shared cell', () => {
  const p = minimalPuzzle();
  // Band 1 covers cell (2,4); changing GHI→GHX puts X there, but row 2's
  // answer HIJ already places I in that cell. The grids disagree.
  p.bands[1].entries[0].answer = 'GHX';
  const { errors } = validate(p);
  assert.ok(
    errors.some(e => /disagree|conflict/i.test(e)),
    `expected a row/band conflict error, got: ${JSON.stringify(errors)}`
  );
});

test('validate: warns on unknown style name', () => {
  const p = minimalPuzzle();
  p.rows[0].entries[0].styles = { underline: [0] };
  const { errors, warnings } = validate(p);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('underline')));
});

test('validate: accepts valid even-N puzzle (N=4)', () => {
  const p = {
    kind: 'marching-bands',
    title: 'Even N',
    rows: [
      { entries: [{ clue: 'r1', answer: 'ABCD' }] },   // sum=4 ✓
      { entries: [{ clue: 'r2', answer: 'EFGH' }] },   // sum=4 ✓
      { entries: [{ clue: 'r3', answer: 'IJKL' }] },   // sum=4 ✓
      { entries: [{ clue: 'r4', answer: 'MNOP' }] },   // sum=4 ✓
    ],
    // Bands read clockwise off the row-derived grid:
    //   band 0 cells → A B C D H L P O N M I E
    //   band 1 cells → F G K J
    bands: [
      { entries: [
        { clue: 'b0a', answer: 'ABCDHLPO' },   // 8
        { clue: 'b0b', answer: 'NMIE' },        // 4 → total 12 ✓
      ] },
      { entries: [
        { clue: 'b1a', answer: 'FGKJ' },        // 4 ✓
      ] },
    ],
  };
  const { errors } = validate(p);
  assert.deepEqual(errors, []);
});
