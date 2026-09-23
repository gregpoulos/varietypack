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

// validateCommonHeader's own behavior (kind mismatch, missing title, hashed in
// source vs muddled, instructions type/emptiness) is covered by shared/test/
// builderUtils.test.js. This is the single wiring test proving marching-bands
// forwards validateCommonHeader's errors and passes its own kind
// ('marching-bands').

test('validate: rejects wrong kind', () => {
  const p = { ...minimalPuzzle(), kind: 'spiral' };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"kind"')));
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

// ── muddled mode ──────────────────────────────────────────────────────────────

// Minimal valid N=3 muddled MB:
//   rows[0]: 2+1=3,  rows[1]: 1+1=2=N-1,  rows[2]: 2+1=3
//   bands[0]: 3+2+3=8 = 4*(3-1)
function validMuddledMB() {
  return {
    kind: 'marching-bands', title: 'T',
    hashed: true, format: 2, boardHash: 'any-hash',
    rows: [
      { entries: [{ clue: 'a', length: 2 }, { clue: 'b', length: 1 }] },
      { entries: [{ clue: 'c', length: 1 }, { clue: 'd', length: 1 }] },
      { entries: [{ clue: 'e', length: 2 }, { clue: 'f', length: 1 }] },
    ],
    bands: [
      { entries: [{ clue: 'g', length: 3 }, { clue: 'h', length: 2 }, { clue: 'i', length: 3 }] },
    ],
  };
}

test('validate: muddled MB passes with a skip warning', () => {
  const { errors, warnings } = validate(validMuddledMB());
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('muddled')));
});

test('validate: muddled MB — row length-sum check still enforced', () => {
  const p = validMuddledMB();
  p.rows[1].entries[0].length = 99;  // rows[1] sum = 100, expected 2 (N-1=2) → error
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('rows[1]') && e.includes('sum')));
});

test('validate: muddled MB — band length-sum check still enforced', () => {
  const p = validMuddledMB();
  p.bands[0].entries[0].length = 99;  // band[0] sum != 8 → error
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('bands[0]') && e.includes('sum')));
});

test('validate: muddled MB — cross-check skipped (no letter comparison)', () => {
  const p = validMuddledMB();
  const { errors } = validate(p);
  assert.deepEqual(errors, []);
});

test('validate: muddled — answer: in rows[0] rejected with a use-length-not-answer message', () => {
  const p = validMuddledMB();
  p.rows[0].entries[0] = { clue: 'a', answer: 'AB' };  // answer: in a muddled puzzle is not allowed
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('rows[0].entries[0]') && e.includes('length:, not answer:')));
});

test('validate: muddled — answer: in a band entry rejected with a use-length-not-answer message', () => {
  const p = validMuddledMB();
  p.bands[0].entries[0] = { clue: 'g', answer: 'ABCDEF' };  // answer: on the validateEntries path
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('bands[0].entries[0]') && e.includes('length:, not answer:')));
});

test('validate: muddled entries without boardHash rejected for marching-bands', () => {
  const p = validMuddledMB();
  // Drop format: 2 alongside boardHash — without it the puzzle is neither a source
  // nor a muddled file, and trips the "format: in a source puzzle" error as well.
  delete p.boardHash;
  delete p.format;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('boardHash')));
});

// 3x3 rebus fixture, per Task 4's construction:
//   Flat 1-indexed cells: 1 2 3 / 4 [5=black centre] 6 / 7 8 9
//   Grid: 1=s 2=har 3=o 4=n 6=e 7=t 8=a 9=p
//   Band 0 clockwise traversal (8 cells) = 1,2,3,6,9,8,7,4 = s har o e p a t n
function makeRebusPuzzle3x3(bandAnswer) {
  return {
    kind: 'marching-bands', title: 'T',
    rows: [
      { entries: [{ clue: 'r1', answer: 'S[HAR]O' }] },
      { entries: [{ clue: 'r2', answer: 'NE' }] },
      { entries: [{ clue: 'r3', answer: 'TAP' }] },
    ],
    bands: [{ entries: [{ clue: 'b0', answer: bandAnswer }] }],
  };
}

test('a rebus cell must be bracketed identically in its row and its band', () => {
  // Band cells: s har o e p a t n — agrees with row 1 at cells 1, 2, 3.
  const { errors } = validate(makeRebusPuzzle3x3('S[HAR]OEPATN'));
  assert.deepStrictEqual(errors, []);
});

test('a rebus bracketed differently on the band is rejected', () => {
  // Band cells: s ha ro e p a t n — still 8 cells, still the same letters,
  // but cell 2 is "ha"/cell 3 is "ro" where the row says "har"/"o". A regex that
  // merely checks for *some* "rows and bands disagree" error is not discriminating
  // here: normalize() strips brackets, so the old letter-space cross-check flattens
  // both this fixture and the agreeing one to the identical letter sequence and
  // reports the same errors for either — it can't tell them apart. The old
  // implementation also misaligns row0 (5 letters into 3 cell slots), producing
  // five spurious single-character mismatches at unrelated cells regardless of the
  // band's bracketing. So this asserts both: exactly two errors (old code produces
  // five), and that they name the two disagreeing cells with their cell-space
  // values ("har"/"ha" and "o"/"ro") — pinning the behavior that matters without
  // pinning exact wording or order.
  const { errors } = validate(makeRebusPuzzle3x3('S[HA][RO]EPATN'));
  assert.strictEqual(errors.length, 2, `expected exactly 2 errors, got: ${JSON.stringify(errors)}`);
  assert.ok(
    errors.some(e => e.includes('(1, 2)') && e.includes('"har"') && e.includes('"ha"')),
    `expected an error for cell (1, 2) with "har"/"ha", got: ${JSON.stringify(errors)}`
  );
  assert.ok(
    errors.some(e => e.includes('(1, 3)') && e.includes('"o"') && e.includes('"ro"')),
    `expected an error for cell (1, 3) with "o"/"ro", got: ${JSON.stringify(errors)}`
  );
});

test('rows[0] validation issues are reported exactly once, not double-reported', () => {
  const p = minimalPuzzle();
  // Add an entry with an empty clue (1 error) and unknown style (1 warning)
  p.rows[0].entries[0] = { clue: '', answer: 'AB', styles: { underline: [0] } };
  const { errors, warnings } = validate(p);
  assert.strictEqual(
    errors.length, 1,
    `expected exactly 1 error for empty clue in rows[0], got ${errors.length}: ${JSON.stringify(errors)}`
  );
  assert.strictEqual(
    warnings.length, 1,
    `expected exactly 1 warning for unknown style in rows[0], got ${warnings.length}: ${JSON.stringify(warnings)}`
  );
});
