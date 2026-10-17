'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/validator');

// Minimal valid puzzle: 40 cells each direction.
// inward concat:  "abcdefghijklmnopqrst" + "tsrqponmlkjihgfedcba" — a 40-char palindrome
// outward concat: same palindrome → reverse(outward) === inward ✓
function valid() {
  return {
    kind: 'spiral',
    title: 'Test Spiral',
    inward: [
      { clue: 'One', answer: 'ABCDEFGHIJKLMNOPQRST' },
      { clue: 'Two', answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
    outward: [
      { clue: 'Three', answer: 'ABCDEFGHIJKLMNOPQRST' },
      { clue: 'Four',  answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
  };
}

test('validate: returns empty errors and warnings for valid puzzle', () => {
  assert.deepEqual(validate(valid()), { errors: [], warnings: [] });
});

// ── kind ──────────────────────────────────────────────────────────────────────

// ── header (kind/title/hashed/instructions) ────────────────────────────────────
// validateCommonHeader's own behavior (kind mismatch, missing title, hashed in
// source vs muddled, instructions type/emptiness) is covered by shared/test/
// validation.test.js. This is the single wiring test proving spiral forwards
// validateCommonHeader's errors and passes its own kind ('spiral').

test('validate: error when kind is wrong', () => {
  const p = valid(); p.kind = 'crossword';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"kind"')));
});

// ── inward / outward arrays ───────────────────────────────────────────────────

test('validate: error when inward is missing', () => {
  const p = valid(); delete p.inward;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"inward"')));
});

test('validate: error when outward is missing', () => {
  const p = valid(); delete p.outward;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"outward"')));
});

test('validate: error when inward is not an array', () => {
  const p = valid(); p.inward = 'oops';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"inward"')));
});

test('validate: error when outward is not an array', () => {
  const p = valid(); p.outward = 'oops';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"outward"')));
});

test('validate: error when inward has fewer than 2 entries', () => {
  // One entry of 40 a's each side — satisfies reversal and minimum, but inward < 2
  const p = {
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'A', answer: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }],
    outward: [{ clue: 'B', answer: 'AAAAAAAAAAAAAAAAAAAA' },
              { clue: 'C', answer: 'AAAAAAAAAAAAAAAAAAAA' }],
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"inward"') && e.includes('2')));
});

test('validate: error when outward has fewer than 2 entries', () => {
  const p = {
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'A', answer: 'AAAAAAAAAAAAAAAAAAAA' },
              { clue: 'B', answer: 'AAAAAAAAAAAAAAAAAAAA' }],
    outward: [{ clue: 'C', answer: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }],
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"outward"') && e.includes('2')));
});

// ── entry fields ──────────────────────────────────────────────────────────────

// validateEntry's own behavior (missing/empty clue, missing/empty/normalizes-to-
// empty answer) is covered by shared/test/validateEntry.test.js. This is the
// single wiring test proving spiral forwards validateEntry's errors and formats
// its label as "inward[N]".

test('validate: error when inward entry clue is missing', () => {
  const p = valid(); delete p.inward[0].clue;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('clue')));
});

// ── normalization ─────────────────────────────────────────────────────────────

test('validate: reversal check uses normalized strings', () => {
  // Hyphen stripped before reversal check — "ABCDEFGHIJ-KLMNOPQRST" →
  // "abcdefghijklmnopqrst"
  const p = valid();
  p.inward[0].answer = 'ABCDEFGHIJ-KLMNOPQRST';
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

// ── cell count constraints ────────────────────────────────────────────────────

test('validate: error when inward and outward cell counts differ', () => {
  const p = valid();
  p.inward.push({ clue: 'Extra', answer: 'X' });
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.toLowerCase().includes('cell') || e.toLowerCase().includes('count')));
});

test('validate: error when total cell count is below minimum (40)', () => {
  // inward "abcdefghij", outward reverse "jihgfedcba" — reversal holds, but only 10 cells
  const p = {
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'A', answer: 'ABCDE' }, { clue: 'B', answer: 'FGHIJ' }],
    outward: [{ clue: 'C', answer: 'JIHGF' }, { clue: 'D', answer: 'EDCBA' }],
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('40') || e.toLowerCase().includes('minimum')));
});

// ── reversal constraint ───────────────────────────────────────────────────────

test('validate: error when inward string is not the reverse of outward string', () => {
  const p = valid();
  p.outward[0].answer = 'AAAABBBBCCCCDDDDEEEE'; // breaks reversal
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.toLowerCase().includes('revers')));
});

test('outward answers repeat each rebus cell in forward order', () => {
  const { errors } = validate({
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'a', answer: 'S[HAR]ON' }, { clue: 'b', answer: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL' }],
    outward: [{ clue: 'c', answer: 'LKJIHGFEDCBAZYXWVUTSRQPONMLKJIHGFEDCBA' }, { clue: 'd', answer: 'NO[HAR]S' }],
  });
  assert.deepStrictEqual(errors, []);
});

// Outward reads every cell backward, so its rebus may be spelled either way.
test('outward answers may also spell a rebus cell backward', () => {
  const { errors } = validate({
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'a', answer: 'S[HAR]ON' }, { clue: 'b', answer: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL' }],
    outward: [{ clue: 'c', answer: 'LKJIHGFEDCBAZYXWVUTSRQPONMLKJIHGFEDCBA' }, { clue: 'd', answer: 'NO[RAH]S' }],
  });
  assert.deepStrictEqual(errors, []);
});

test('an outward rebus that is neither the cell nor its reverse is rejected, explaining both spellings', () => {
  const { errors } = validate({
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'a', answer: 'S[HAR]ON' }, { clue: 'b', answer: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKL' }],
    outward: [{ clue: 'c', answer: 'LKJIHGFEDCBAZYXWVUTSRQPONMLKJIHGFEDCBA' }, { clue: 'd', answer: 'NO[HRA]S' }],
  });
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /reverse/);
  assert.match(errors[0], /NO\[HAR\]S or NO\[RAH\]S/);
});

// ── sample puzzle ─────────────────────────────────────────────────────────────

test('validate: sample puzzle is valid', () => {
  const yaml = require('js-yaml');
  const fs = require('fs');
  const path = require('path');
  const raw = fs.readFileSync(path.join(__dirname, '../../examples/spiral.yaml'), 'utf8');
  const puzzle = yaml.load(raw);
  const { errors, warnings } = validate(puzzle);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

// ── multiple errors ───────────────────────────────────────────────────────────

// ── styles ────────────────────────────────────────────────────────────────────
// validateEntryStyles's own behavior (non-object styles, unrecognized names,
// non-array values, out-of-range/negative/non-integer positions) is covered by
// shared/test/validateEntry.test.js. This is the single wiring test proving
// spiral forwards the correct cellCount (from the entry's answer length) and
// label into validateEntryStyles.

test('validate: error when inward entry style position is out of range (>= length)', () => {
  const p = valid();
  // inward[0].answer is 'ABCDEFGHIJKLMNOPQRST' → length 20; position 20 is out of range
  p.inward[0].styles = { circle: [20] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('circle')));
});

// ── muddled mode ──────────────────────────────────────────────────────────────

// 9 entries per direction × 5 letters each = 45 total >= 40 ✓
function validMuddledSpiral() {
  const makeEntries = (prefix) =>
    Array.from({ length: 9 }, (_, i) => ({ clue: `${prefix}${i}`, length: 5 }));
  return {
    kind: 'spiral', title: 'Muddled Spiral',
    hashed: true, format: 2, boardHash: 'any-hash',
    inward:  makeEntries('in'),
    outward: makeEntries('out'),
  };
}

test('validate: muddled spiral passes with a skip warning', () => {
  const { errors, warnings } = validate(validMuddledSpiral());
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('muddled')));
});

test('validate: muddled spiral — inward/outward total mismatch still caught', () => {
  const p = validMuddledSpiral();
  p.inward[0].length = 6;  // inward=46, outward=45 → mismatch
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('equal')));
});

test('validate: muddled spiral — below-40 total still caught', () => {
  const makeSmall = (prefix) =>
    Array.from({ length: 2 }, (_, i) => ({ clue: `${prefix}${i}`, length: 5 }));
  const p = {
    kind: 'spiral', title: 'T',
    hashed: true, format: 2, boardHash: 'h',
    inward:  makeSmall('in'),   // total=10
    outward: makeSmall('out'),  // total=10 — both equal but <40
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('40')));
});

test('validate: muddled spiral — reversal check skipped', () => {
  const p = validMuddledSpiral();
  p.outward[0].length = 6;  // total mismatch would normally trigger reversal error in source mode
  p.inward[0].length  = 6;  // keep totals equal; no letter strings to compare
  const { errors } = validate(p);
  assert.ok(!errors.some(e => e.includes('reverse')));
});

test('validate: muddled spiral — answer: entry rejected with a use-length-not-answer message', () => {
  const p = validMuddledSpiral();
  p.inward[0] = { clue: 'a', answer: 'HELLO' };  // answer: in a muddled puzzle is not allowed
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('length:, not answer:')));
});

test('validate: muddled entries without boardHash rejected for spiral', () => {
  const p = validMuddledSpiral();
  // Drop format: 2 alongside boardHash — without it the puzzle is neither a source
  // nor a muddled file, and trips the "format: in a source puzzle" error as well.
  delete p.boardHash;
  delete p.format;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('boardHash')));
});

test('validate: an invalid (non-object) entry does not trigger a spurious reversal error', () => {
  const A40 = 'A'.repeat(40);
  const A20 = 'A'.repeat(20);
  const { errors } = validate({
    kind: 'spiral', title: 'T',
    inward:  ['not-an-object', { clue: 'x', answer: A40 }],          // inwardTotal = 0 + 40
    outward: [{ clue: 'y', answer: A20 }, { clue: 'z', answer: A20 }], // outwardTotal = 40
  });
  assert.ok(errors.some(e => e.includes('must be an object')));
  assert.ok(!errors.some(e => e.includes('reverse')),
    'reversal check must be skipped when an entry is invalid, not run against a placeholder');
});

test('validate: an inward circle without its outward partner is an error', () => {
  const p = valid();
  p.inward[0].styles = { circle: [0] };  // cell 0, the outermost cell
  const { errors } = validate(p);
  assert.ok(errors.some(e => /^outward\[\d+\]\.styles\.circle is missing position \d+/.test(e)), errors.join('|'));
});

test('validate: an inward circle with its outward partner passes', () => {
  const p = valid();
  p.inward[0].styles = { circle: [0] };
  // The outermost cell is the last cell of the last outward entry.
  const last = p.outward.length - 1;
  p.outward[last].styles = { circle: [p.outward[last].answer.length - 1] };
  assert.deepEqual(validate(p).errors, []);
});

// Each check waits only for what it needs, so an unrelated error can't hide it.
test('validate: an unrelated header error does not hide a circle error', () => {
  const p = valid();
  p.theme = 'nope';
  p.inward[0].styles = { circle: [0] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.startsWith('"theme"')), errors.join('|'));
  assert.ok(errors.some(e => /^outward\[\d+\]\.styles\.circle is missing position \d+/.test(e)), errors.join('|'));
});

test('validate: an unknown top-level key warns', () => {
  const p = valid();
  p.instruction = 2;
  assert.ok(validate(p).warnings.includes('unknown key "instruction" (is it a typo?)'), validate(p).warnings.join('|'));
});
