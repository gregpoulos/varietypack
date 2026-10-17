'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, findCoincidentStarts } = require('../src/validator');

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

// valid()'s loop 1 starts its entries on the same ring cells as loop 0 (0 and 2),
// which warns. clean() is valid with no warnings at all: loop 1 begins mid-entry.
// concat = 'ab' + 'cdefghabc' + 'defgh' = 'abcdefghabcdefgh'; starts 0, 2, 11 % 8 = 3.
function clean() {
  return {
    kind: 'snake-charmer',
    title: 'Test Puzzle',
    entries: [
      { clue: 'One',   answer: 'AB' },
      { clue: 'Two',   answer: 'CDEFGHABC' },
      { clue: 'Three', answer: 'DEFGH' },
    ],
  };
}

test('validate: returns empty errors and warnings for valid puzzle', () => {
  assert.deepEqual(validate(clean()), { errors: [], warnings: [] });
});

// validateCommonHeader's own behavior (kind mismatch, missing title, hashed in
// source vs muddled, instructions type/emptiness) is covered by shared/test/
// validation.test.js. This is the single wiring test proving snake-charmer
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
  const p = clean();
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

// A valid puzzle with no warnings for any even ring size N: three entries of 3, N + 1 and
// N - 4 cells over a ring of letters, so the starts (0, 3, 4 mod N) never coincide.
function ringPuzzle(N) {
  const ring = Array.from({ length: N }, (_, i) => String.fromCharCode(97 + (i % 26)));
  const loops = ring.concat(ring);
  const lengths = [3, N + 1, N - 4];
  let at = 0;
  return {
    kind: 'snake-charmer',
    title: 'Test Puzzle',
    entries: lengths.map((n, i) => {
      const answer = loops.slice(at, at + n).join('');
      at += n;
      return { clue: `Clue ${i}`, answer };
    }),
  };
}

test('validate: valid shape values are accepted at a ring size every shape can lay out', () => {
  for (const shape of ['circle', 'stadium', 'turn', 'double-turn']) {
    const p = ringPuzzle(48); p.shape = shape;
    assert.deepEqual(validate(p), { errors: [], warnings: [] }, `shape: ${shape} should be valid`);
  }
});

// What ringFor throws at build time for these, validate reports up front.
test('validate: error when an explicit shape cannot lay out the ring', () => {
  const turn42 = ringPuzzle(42); turn42.shape = 'turn';            // turn needs N divisible by 4
  assert.match(validate(turn42).errors.join('\n'), /"shape" "turn" cannot lay out a ring of 42 cells: .*divisible by 4/);
  const double8 = ringPuzzle(8); double8.shape = 'double-turn';    // too small for the S-shape
  assert.match(validate(double8).errors.join('\n'), /"shape" "double-turn" cannot lay out a ring of 8 cells/);
});

// build passes its options (the --shape flag) to the validator, which then checks the
// shape the build will use. The flag wins over the YAML's shape, as in buildHtml.
test('validate: the --shape option replaces the YAML shape in the fit check', () => {
  const yamlTurn = ringPuzzle(42); yamlTurn.shape = 'turn';
  assert.deepEqual(validate(yamlTurn, { shape: 'stadium' }), { errors: [], warnings: [] });
  const flagTurn = ringPuzzle(42); flagTurn.shape = 'stadium';
  assert.match(validate(flagTurn, { shape: 'turn' }).errors.join('\n'), /--shape "turn" cannot lay out a ring of 42 cells/);
});

// The YAML's shape is checked against the names above; the flag is checked the same way.
test('validate: an unknown --shape is an error', () => {
  assert.match(validate(ringPuzzle(48), { shape: 'oval' }).errors.join('\n'),
    /--shape must be one of: circle, stadium, turn, double-turn, got "oval"/);
});

test('validate: the same ring is fine with a shape that fits, or with no shape', () => {
  for (const shape of [undefined, 'circle', 'stadium', 'double-turn']) {
    const p = ringPuzzle(42); if (shape) p.shape = shape;
    assert.deepEqual(validate(p), { errors: [], warnings: [] }, `shape: ${shape}`);
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

// ── styles ────────────────────────────────────────────────────────────────────
// validateEntryStyles's own behavior (non-object styles, unrecognized names,
// non-array values, out-of-range/negative/non-integer positions) is covered by
// shared/test/validateEntry.test.js. This is the single wiring test proving
// snake-charmer forwards the correct cellCount (from the entry's answer
// length) and label into validateEntryStyles.

test('validate: error when position is out of range', () => {
  const p = valid();
  p.entries[0].styles = { circle: [2] };  // AB has length 2, position 2 is out of range
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('entries[0]') && e.includes('out of range')));
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

test('validate: a circle on one loop\'s entry but not the other\'s is an error', () => {
  const p = valid();
  p.entries[0].styles = { circle: [1] };
  const { errors } = validate(p);
  assert.ok(errors.some(e => /^entries\[2\]\.styles\.circle is missing position 1/.test(e)), errors.join('|'));
});

test('validate: a circle on both loops\' entries passes', () => {
  const p = valid();
  p.entries[0].styles = { circle: [1] };
  p.entries[2].styles = { circle: [1] };
  assert.deepEqual(validate(p).errors, []);
});

// ── coincident starts ─────────────────────────────────────────────────────────
// Two entries starting on one ring cell would put two numbers on one square.

test('findCoincidentStarts: returns empty array when no entries share a start cell', () => {
  // ringSize=3, loops=2. e0(len2) starts ring 0; e1(len4) starts ring 2. Distinct starts.
  assert.deepEqual(findCoincidentStarts([2, 4], 2), []);
});

test('findCoincidentStarts: returns ring positions where two entries share a start cell', () => {
  // ringSize=4, loops=2. Starts: e0→0, e1→2, e2→0, e3→2 (loop 1 lands on the same cells).
  assert.deepEqual(findCoincidentStarts([2, 2, 2, 2], 2), [0, 2]);
});

test('validate: warns, without erroring, when entries from both loops start on one ring cell', () => {
  const { errors, warnings } = validate(valid());   // starts 0, 2, 8 % 8 = 0, 10 % 8 = 2
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, [
    '2 ring cell(s) have entries from multiple loops starting on the same square: cells 0, 2',
  ]);
});

test('validate: warns about coincident starts in a muddled puzzle too', () => {
  const { muddlePuzzle } = require('../../shared/build/muddleUtils');
  const { HOOKS } = require('../src/builder');
  const { muddled } = muddlePuzzle(valid(), HOOKS);
  assert.ok(validate(muddled).warnings.some(w => /starting on the same square/.test(w)));
});

// Each check waits only for what it needs, so an unrelated error can't hide it.
test('validate: an unrelated header error does not hide a circle error or the coincident-starts warning', () => {
  const p = valid();
  p.theme = 'nope';
  p.entries[0].styles = { circle: [1] };
  const { errors, warnings } = validate(p);
  assert.ok(errors.some(e => e.startsWith('"theme"')), errors.join('|'));
  assert.ok(errors.some(e => /^entries\[2\]\.styles\.circle is missing position 1/.test(e)), errors.join('|'));
  assert.ok(warnings.some(w => /starting on the same square/.test(w)), warnings.join('|'));
});

// A bad entry of even length leaves the total divisible, so a ring size alone doesn't
// keep the misaligned cells out of the ring check; only every entry parsing does.
test('validate: a bad entry does not also produce a spurious ring mismatch', () => {
  const { errors } = validate({ kind: 'snake-charmer', title: 'T', entries: [
    { clue: 'a', answer: 'AAAAAA' }, { clue: 'b', answer: 'BBBBBB' },
    { clue: 'c', answer: 'AA[AA' }, { clue: 'd', answer: 'AABBBBBB' },
  ] });
  assert.deepEqual(errors, ['entries[2].answer: unclosed "[" in answer']);
});

test('validate: an unknown top-level key warns', () => {
  const p = valid();
  p.instruction = 2;
  assert.ok(validate(p).warnings.includes('unknown key "instruction" (is it a typo?)'), validate(p).warnings.join('|'));
});
