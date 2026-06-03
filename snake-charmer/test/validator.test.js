'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/validator');

// Helper: a minimal valid puzzle
// concat = 'ab' + 'cdefgh' + 'ab' + 'cdefgh' = 'abcdefghabcdefgh' → period 8 ✓
// 4 entries: 4 % 2 (loops) = 0 ✓
function valid() {
  return {
    kind: 'snake-charmer',
    title: 'Test Puzzle',
    entries: [
      { clue: 'One',   answer: 'AB' },
      { clue: 'Two',   answer: 'CDEFGH' },
      { clue: 'Three', answer: 'AB' },
      { clue: 'Four',  answer: 'CDEFGH' },
    ],
  };
}

test('validate: returns empty errors and warnings for valid puzzle', () => {
  assert.deepEqual(validate(valid()), { errors: [], warnings: [] });
});

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

test('validate: error when entries is not an array', () => {
  const p = valid(); p.entries = 'oops';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"entries"')));
});

test('validate: error when fewer than 3 entries', () => {
  const p = valid(); p.entries = p.entries.slice(0, 2);
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"entries"') && e.includes('3')));
});

test('validate: error when entry clue is missing', () => {
  const p = valid(); delete p.entries[0].clue;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('clue')));
});

test('validate: error when entry clue is empty string', () => {
  const p = valid(); p.entries[0].clue = '';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('clue')));
});

test('validate: error when entry answer is missing', () => {
  const p = valid(); delete p.entries[0].answer;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('answer')));
});

test('validate: error when entry answer is empty string', () => {
  const p = valid(); p.entries[0].answer = '';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('answer')));
});

test('validate: error when entry answer normalizes to empty (only numbers/punctuation)', () => {
  const p = valid(); p.entries[0].answer = '1984!';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('answer')));
});

test('validate: error when ring size is less than 8', () => {
  // 6 total cells, loops=2 → ringSize=3 < 8
  const p = {
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'A', answer: 'AB' },
      { clue: 'B', answer: 'CD' },
      { clue: 'C', answer: 'EF' },
    ],
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('8') && e.toLowerCase().includes('ring')));
});


test('validate: error when total cells not divisible by loops', () => {
  const p = {
    kind: 'snake-charmer', title: 'T',
    loops: 3,
    entries: [
      { clue: 'A', answer: 'ABCDE' },
      { clue: 'B', answer: 'ABCDE' },
      { clue: 'C', answer: 'ABCD' },
    ],
  };
  // 5+5+4=14, loops=3 → 14%3 !== 0
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('divisible') || e.includes('loops')));
});

test('validate: error when answers fail period constraint', () => {
  const p = {
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'A', answer: 'ABC' },
      { clue: 'B', answer: 'DEF' },
      { clue: 'C', answer: 'ABCXYZ' },
    ],
  };
  // concat='abcdefabcxyz', loop0='abcdef', loop1='abcxyz' → mismatch at pos 3-5
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.toLowerCase().includes('loop') || e.toLowerCase().includes('period')));
});

test('validate: explicit loops:2 is accepted', () => {
  const p = valid();
  p.loops = 2;
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: loops:3 accepted when puzzle satisfies period-3 constraint', () => {
  // concat must have period 8: 'abcdefghabcdefghabcdefgh' (24 cells, loops=3, ringSize=8)
  const p = {
    kind: 'snake-charmer', title: 'T',
    loops: 3,
    entries: [
      { clue: 'A', answer: 'ABCDEFGH' },
      { clue: 'B', answer: 'ABCDEFGH' },
      { clue: 'C', answer: 'ABCDEFGH' },
    ],
  };
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: shape omitted is accepted', () => {
  assert.deepEqual(validate(valid()), { errors: [], warnings: [] });
});

test('validate: valid shape values are accepted', () => {
  for (const shape of ['circle', 'stadium', 'turn', 'double-turn']) {
    const p = valid(); p.shape = shape;
    assert.deepEqual(validate(p), { errors: [], warnings: [] }, `shape: ${shape} should be valid`);
  }
});

test('validate: error when shape is an unrecognized value', () => {
  const p = valid(); p.shape = 'hexagon';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"shape"')));
});

test('validate: hashed:true is accepted', () => {
  const p = valid();
  p.hashed = true;
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: hashed:false is accepted (default)', () => {
  const p = valid();
  p.hashed = false;
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: error when loops is not a positive integer >= 2', () => {
  const p = valid();
  p.loops = 1;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('loops')));
});

test('validate: error when loops is a float', () => {
  const p = valid();
  p.loops = 1.5;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('loops')));
});

test('validate: error when ring size is odd', () => {
  // 18 cells, loops=2 → ring=9 (odd); period constraint holds
  const p = {
    kind: 'snake-charmer', title: 'T',
    loops: 2,
    entries: [
      { clue: 'A', answer: 'ABCD' },
      { clue: 'B', answer: 'EFGHI' },
      { clue: 'C', answer: 'ABCDEFGHI' },
    ],
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.toLowerCase().includes('even') || e.toLowerCase().includes('ring')));
});

test('validate: multiple errors returned together', () => {
  const p = { kind: 'wrong', title: '', entries: [] };
  const { errors } = validate(p);
  assert.ok(errors.length >= 3);
});

// ── styles ────────────────────────────────────────────────────────────────────

test('validate: styles omitted is valid', () => {
  assert.deepEqual(validate(valid()), { errors: [], warnings: [] });
});

test('validate: circle style with valid positions is accepted', () => {
  const p = valid();
  p.entries[0].styles = { circle: [0, 1] };  // AB → positions 0 and 1
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: empty styles object is accepted', () => {
  const p = valid();
  p.entries[0].styles = {};
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: error when styles is not an object', () => {
  const p = valid();
  p.entries[0].styles = 'circle';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('styles')));
});

test('validate: error when styles is an array', () => {
  const p = valid();
  p.entries[0].styles = [0, 1];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('styles')));
});

test('validate: error when style positions is not an array', () => {
  const p = valid();
  p.entries[0].styles = { circle: 0 };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('circle')));
});

test('validate: error when position is out of range', () => {
  const p = valid();
  p.entries[0].styles = { circle: [2] };  // AB has length 2, position 2 is out of range
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('out of range')));
});

test('validate: error when position is negative', () => {
  const p = valid();
  p.entries[0].styles = { circle: [-1] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('out of range')));
});

test('validate: error when position is a float', () => {
  const p = valid();
  p.entries[0].styles = { circle: [0.5] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('out of range')));
});

test('validate: warning for unrecognized style name', () => {
  const p = valid();
  p.entries[0].styles = { 'blue-shade': [0] };
  const { errors, warnings } = validate(p);
  assert.equal(errors.length, 0);
  assert.ok(warnings.some(w => w.includes('entries[0]') && w.includes('blue-shade')));
});

test('validate: positions count stripped letters, not raw characters', () => {
  const p = valid();
  // entries[1] answer is 'CDEFGH' (6 cells); position 5 is the last valid
  p.entries[1].styles = { circle: [5] };
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: multi-word answer positions ignore spaces', () => {
  // 'A B' strips to 'ab' (2 cells) — same normalized content as 'AB', period constraint holds
  const p = valid();
  p.entries[0].answer = 'A B';
  p.entries[0].styles = { circle: [1] };  // position 1 = b, valid for 2-cell answer
  const { errors } = validate(p);
  assert.equal(errors.length, 0);
});

// ── instructions ──────────────────────────────────────────────────────────────

test('validate: instructions omitted is valid', () => {
  assert.deepEqual(validate(valid()), { errors: [], warnings: [] });
});

test('validate: instructions as a non-empty string is accepted', () => {
  const p = valid();
  p.instructions = 'Fill in the blanks.';
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: instructions with newlines is accepted', () => {
  const p = valid();
  p.instructions = 'Fill in the blanks.\n\nEnjoy the puzzle.';
  assert.deepEqual(validate(p), { errors: [], warnings: [] });
});

test('validate: error when instructions is not a string', () => {
  const p = valid();
  p.instructions = 42;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"instructions"')));
});

test('validate: error when instructions is an empty string', () => {
  const p = valid();
  p.instructions = '';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"instructions"')));
});

test('validate: error when instructions is whitespace only', () => {
  const p = valid();
  p.instructions = '   ';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"instructions"')));
});
