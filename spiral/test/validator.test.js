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

test('validate: error when kind is wrong', () => {
  const p = valid(); p.kind = 'crossword';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"kind"')));
});

test('validate: error when kind is missing', () => {
  const p = valid(); delete p.kind;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"kind"')));
});

// ── title ─────────────────────────────────────────────────────────────────────

test('validate: error when title is missing', () => {
  const p = valid(); delete p.title;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"title"')));
});

test('validate: error when title is empty string', () => {
  const p = valid(); p.title = '';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"title"')));
});

// ── hashed ────────────────────────────────────────────────────────────────────

test('validate: hashed:true is accepted', () => {
  const p = valid(); p.hashed = true;
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: hashed:false is accepted', () => {
  const p = valid(); p.hashed = false;
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: error when hashed is not a boolean', () => {
  const p = valid(); p.hashed = 'yes';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"hashed"')));
});

// ── instructions ─────────────────────────────────────────────────────────────

test('validate: instructions field is accepted when a non-empty string', () => {
  const p = valid(); p.instructions = 'Solve the spiral.';
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: error when instructions is not a string', () => {
  const p = valid(); p.instructions = 42;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"instructions"')));
});

test('validate: error when instructions is an empty string', () => {
  const p = valid(); p.instructions = '   ';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"instructions"')));
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

test('validate: error when inward entry clue is missing', () => {
  const p = valid(); delete p.inward[0].clue;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('clue')));
});

test('validate: error when inward entry clue is empty string', () => {
  const p = valid(); p.inward[0].clue = '';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('clue')));
});

test('validate: error when outward entry clue is missing', () => {
  const p = valid(); delete p.outward[1].clue;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('outward[1]') && e.includes('clue')));
});

test('validate: error when inward entry answer is missing', () => {
  const p = valid(); delete p.inward[0].answer;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('answer')));
});

test('validate: error when outward entry answer is empty string', () => {
  const p = valid(); p.outward[0].answer = '';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('outward[0]') && e.includes('answer')));
});

test('validate: error when inward entry answer normalizes to empty (only numbers/punctuation)', () => {
  const p = valid(); p.inward[0].answer = '1984!';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('answer')));
});

test('validate: error when outward entry answer normalizes to empty (only numbers/punctuation)', () => {
  const p = valid(); p.outward[0].answer = '---';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('outward[0]') && e.includes('answer')));
});

// ── normalization ─────────────────────────────────────────────────────────────

test('validate: spaces in answers are stripped for cell counting', () => {
  const p = valid();
  p.inward[0].answer = 'A B C D E F G H I J K L M N O P Q R S T'; // 20 letters with spaces
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: hyphens in answers are stripped for cell counting', () => {
  const p = valid();
  p.inward[0].answer = 'A-B-C-D-E-F-G-H-I-J-K-L-M-N-O-P-Q-R-S-T'; // 20 letters with hyphens
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: reversal check uses normalized strings', () => {
  // Hyphen stripped before reversal check — "ABCDEFGHIJ-KLMNOPQRST" → "abcdefghijklmnopqrst"
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

test('validate: multiple errors returned together', () => {
  const p = { kind: 'wrong', title: '', inward: [], outward: [] };
  const { errors } = validate(p);
  assert.ok(errors.length >= 3);
});

// ── styles ────────────────────────────────────────────────────────────────────

test('validate: styles omitted on inward entry is valid', () => {
  assert.deepEqual(validate(valid()), { errors: [], warnings: [] });
});

test('validate: circle style with valid positions accepted on inward entry', () => {
  const p = valid();
  p.inward[0].styles = { circle: [0, 1] };
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: circle style with valid positions accepted on outward entry', () => {
  const p = valid();
  p.outward[0].styles = { circle: [0, 3] };
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: empty styles object is accepted on inward entry', () => {
  const p = valid();
  p.inward[0].styles = {};
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: error when inward entry styles is not an object', () => {
  const p = valid();
  p.inward[0].styles = 'circle';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('styles')));
});

test('validate: error when inward entry styles is an array', () => {
  const p = valid();
  p.inward[0].styles = [0, 1];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('styles')));
});

test('validate: error when outward entry styles value is not an array', () => {
  const p = valid();
  p.outward[0].styles = { circle: 0 };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('outward[0]') && e.includes('circle')));
});

test('validate: error when inward entry style position is out of range (>= length)', () => {
  const p = valid();
  // inward[0].answer is 'ABCDEFGHIJKLMNOPQRST' → length 20; position 20 is out of range
  p.inward[0].styles = { circle: [20] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('circle')));
});

test('validate: error when outward entry style position is negative', () => {
  const p = valid();
  p.outward[1].styles = { circle: [-1] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('outward[1]') && e.includes('circle')));
});

test('validate: error when style position is a non-integer float', () => {
  const p = valid();
  p.inward[0].styles = { circle: [0.5] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('inward[0]') && e.includes('circle')));
});

test('validate: warning for unrecognized style name on inward entry', () => {
  const p = valid();
  p.inward[0].styles = { 'blue-shade': [0] };
  const { warnings, errors } = validate(p);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('inward[0]') && w.includes('blue-shade')));
});

test('validate: warning for unrecognized style name on outward entry', () => {
  const p = valid();
  p.outward[0].styles = { 'blue-shade': [0] };
  const { warnings, errors } = validate(p);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('outward[0]') && w.includes('blue-shade')));
});

test('validate: valid position at last index of entry (boundary check)', () => {
  const p = valid();
  // inward[1].answer is 'TSRQPONMLKJIHGFEDCBA' → length 20; position 19 is valid
  p.inward[1].styles = { circle: [19] };
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});
