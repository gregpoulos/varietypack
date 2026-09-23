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

// validateCommonHeader's own behavior (kind mismatch, missing title, hashed in
// source vs muddled, instructions type/emptiness) is covered by shared/test/
// builderUtils.test.js. This is the single wiring test proving snake-charmer
// forwards validateCommonHeader's errors and passes its own kind
// ('snake-charmer').

test('validate: error when kind is wrong', () => {
  const p = valid(); p.kind = 'crossword';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"kind"')));
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

// validateEntry's own behavior (missing/empty clue, missing/empty/normalizes-to-
// empty answer) is covered by shared/test/validateEntry.test.js. This is the
// single wiring test proving snake-charmer forwards validateEntry's errors and
// formats its label as "entries[N]".

test('validate: error when entry clue is missing', () => {
  const p = valid(); delete p.entries[0].clue;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('clue')));
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
    entries: [
      { clue: 'A', answer: 'ABCDE' },
      { clue: 'B', answer: 'FGHIJ' },
      { clue: 'C', answer: 'KLM' },
    ],
  };
  // 5+5+3=13, default loops=2 → 13%2 !== 0
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('divisible')));
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

test('validate: loops:3 is rejected — multi-loop (>2) is not yet supported', () => {
  // Even a puzzle that satisfies the period-3 constraint is rejected: the browser
  // engine only handles loops=2. Multi-loop is a planned future feature (see TODOS.md).
  const p = {
    kind: 'snake-charmer', title: 'T',
    loops: 3,
    entries: [
      { clue: 'A', answer: 'ABCDEFGH' },
      { clue: 'B', answer: 'ABCDEFGH' },
      { clue: 'C', answer: 'ABCDEFGH' },
    ],
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('loops')));
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

test('validate: error when loops is less than 2', () => {
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
// validateEntryStyles's own behavior (non-object styles, unrecognized names,
// non-array values, out-of-range/negative/non-integer positions) is covered by
// shared/test/builderUtils.test.js. This is the single wiring test proving
// snake-charmer forwards the correct cellCount (from the entry's answer
// length) and label into validateEntryStyles.

test('validate: error when position is out of range', () => {
  const p = valid();
  p.entries[0].styles = { circle: [2] };  // AB has length 2, position 2 is out of range
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('out of range')));
});

test('validate: multi-word answer positions ignore spaces', () => {
  // 'A B' strips to 'ab' (2 cells) — same normalized content as 'AB', period constraint holds
  const p = valid();
  p.entries[0].answer = 'A B';
  p.entries[0].styles = { circle: [1] };  // position 1 = b, valid for 2-cell answer
  const { errors } = validate(p);
  assert.equal(errors.length, 0);
});

// ── muddled mode ──────────────────────────────────────────────────────────────

// Minimal valid muddled snake-charmer: 4 entries, total=16 cells, ringSize=8
function validMuddled() {
  return {
    kind: 'snake-charmer', title: 'Muddled Puzzle',
    hashed: true, format: 2, boardHash: 'any-hash',
    entries: [
      { clue: 'One',   length: 2 },
      { clue: 'Two',   length: 6 },
      { clue: 'Three', length: 2 },
      { clue: 'Four',  length: 6 },
    ],
  };
}

test('validate: muddled puzzle passes with a skip warning', () => {
  const { errors, warnings } = validate(validMuddled());
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('muddled')));
});

test('validate: muddled — length-based structural checks still enforced (total not divisible by loops)', () => {
  const p = validMuddled();
  p.entries[0].length = 3;  // total=17, not divisible by 2
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('divisible')));
});

test('validate: muddled — error when entry missing length', () => {
  const p = validMuddled();
  delete p.entries[0].length;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]')));
});

test('validate: muddled — answer: entry rejected with a use-length-not-answer message', () => {
  const p = validMuddled();
  p.entries[0] = { clue: 'One', answer: 'AB' };  // answer: in a muddled puzzle is not allowed
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('length:, not answer:')));
});

test('validate: muddled entries without boardHash rejected', () => {
  const p = validMuddled();
  // Drop format: 2 alongside boardHash — without it the puzzle is neither a source
  // nor a muddled file, and trips the "format: in a source puzzle" error as well.
  delete p.boardHash;
  delete p.format;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('boardHash')));
});

test('validate: ring-equality check skipped in muddled mode', () => {
  // Entries with only length: — if letters were known they might fail ring-equality;
  // validator must not attempt the check and must return no errors.
  // (3 entries required by structural minimum; total=24, ringSize=8, all even/>=8.)
  const p = {
    kind: 'snake-charmer', title: 'T',
    hashed: true, format: 2, boardHash: 'h',
    entries: [
      { clue: 'a', length: 8 },
      { clue: 'b', length: 8 },
      { clue: 'c', length: 8 },
    ],
  };
  const { errors } = validate(p);
  assert.deepEqual(errors, []);
});

test('loops must bracket the same groups at the same cells', () => {
  const { errors } = validate({
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'l0a', answer: 'A[BC]DE' },
      { clue: 'l0b', answer: 'FGHI' },
      { clue: 'l1',  answer: 'A[BC]DEFGHI' },
    ],
  });
  assert.deepStrictEqual(errors, []);
});

test('a loop whose bracketing differs is rejected', () => {
  const { errors } = validate({
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'l0a', answer: 'A[BC]DE' },
      { clue: 'l0b', answer: 'FGHI' },
      { clue: 'l1',  answer: 'AB[CD]EFGHI' },   // a b cd e f g h i — same letters, different cells
    ],
  });
  assert.ok(errors.some(e => /cells differ from loop 0/.test(e)));
});
