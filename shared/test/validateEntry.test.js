'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { validateEntry, validateEntryStyles, hasLengthWithoutHash, checkCellStyles } = require('../build/validateEntry');

// ── validateEntry ─────────────────────────────────────────────────────────────

test('validateEntry: null entry — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry(null, 'entries[0]', false, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.length > 0, 'should push an error');
});

test('validateEntry: non-object entry — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry('not an object', 'entries[0]', false, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.length > 0);
});

test('validateEntry: missing answer on source entry — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue' }, 'entries[0]', false, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.some(e => e.includes('answer')));
});

test('validateEntry: whitespace-only answer on source entry — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue', answer: '   ' }, 'entries[0]', false, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.some(e => e.includes('answer')));
});

test('validateEntry: answer normalizes to empty string — pushes error and returns null', () => {
  // answer contains only non-alpha characters
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue', answer: '---' }, 'entries[0]', false, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.some(e => e.includes('answer')));
});

test('validateEntry: missing clue on source entry — pushes error but still returns length', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ answer: 'HELLO' }, 'entries[0]', false, errors, warnings);
  // clue is missing — an error is pushed
  assert.ok(errors.some(e => e.includes('clue')));
  // but the entry is otherwise valid — still returns the length
  assert.equal(result.length, 5);
});

test('validateEntry: empty clue string on source entry — pushes error but still returns length', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: '', answer: 'HELLO' }, 'entries[0]', false, errors, warnings);
  assert.ok(errors.some(e => e.includes('clue')));
  assert.equal(result.length, 5);
});

test('validateEntry: valid source entry — returns cell count and cells', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'Some clue', answer: 'HELLO' }, 'entries[0]', false, errors, warnings);
  assert.deepEqual(result, { length: 5, cells: ['h', 'e', 'l', 'l', 'o'] });
  assert.equal(errors.length, 0);
});

test('bracket grammar errors carry the entry label', () => {
  const errors = [], warnings = [];
  const len = validateEntry({ clue: 'c', answer: 'S[HARON' }, 'inward[2]', false, errors, warnings);
  assert.strictEqual(len, null);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /^inward\[2\]/);
  assert.match(errors[0], /unclosed/);
});

test('a valid rebus entry returns its cell count', () => {
  const errors = [], warnings = [];
  const len = validateEntry({ clue: 'c', answer: 'S[HAR]ON' }, 'entries[0]', false, errors, warnings);
  assert.deepStrictEqual(len, { length: 4, cells: ['s', 'har', 'o', 'n'] });
  assert.deepStrictEqual(errors, []);
});

test('a four-letter group passes without comment', () => {
  const errors = [], warnings = [];
  validateEntry({ clue: 'c', answer: 'A[BCDE]F' }, 'entries[0]', false, errors, warnings);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(warnings, []);
});

test('a five-letter group warns', () => {
  const errors = [], warnings = [];
  validateEntry({ clue: 'c', answer: 'A[BCDEF]G' }, 'entries[0]', false, errors, warnings);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(warnings.length, 1);
  assert.match(warnings[0], /entries\[0\]/);
  assert.match(warnings[0], /5 letters/);
});

test('styles positions are bounded by cell count, not letter count', () => {
  const errors = [], warnings = [];
  // 4 cells; position 3 is the last valid one.
  validateEntry({ clue: 'c', answer: 'S[HAR]ON', styles: { circle: [3] } },
    'entries[0]', false, errors, warnings);
  assert.deepStrictEqual(errors, []);

  const errors2 = [], warnings2 = [];
  validateEntry({ clue: 'c', answer: 'S[HAR]ON', styles: { circle: [4] } },
    'entries[0]', false, errors2, warnings2);
  assert.strictEqual(errors2.length, 1);
  assert.match(errors2[0], /out of range/);
});

test('validateEntry: non-string answer — pushes error and does not throw', () => {
  const errors = [], warnings = [];
  assert.doesNotThrow(() => {
    const result = validateEntry({ clue: 'c', answer: 123 }, 'entries[0]', false, errors, warnings);
    assert.strictEqual(result, null);
  });
  assert.ok(errors.some(e => e.includes('answer')));
});

// ── validateEntry — muddled path ──────────────────────────────────────────────

test('validateEntry: muddled entry missing length — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue' }, 'entries[0]', true, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.some(e => e.includes('length')));
});

test('validateEntry: muddled entry with non-integer length — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue', length: 'five' }, 'entries[0]', true, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.some(e => e.includes('length')));
});

test('validateEntry: muddled entry with length < 1 — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue', length: 0 }, 'entries[0]', true, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.some(e => e.includes('length')));
});

test('validateEntry: muddled entry with answer present — pushes error and returns null', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue', answer: 'HELLO', length: 5 }, 'entries[0]', true, errors, warnings);
  assert.equal(result, null);
  assert.ok(errors.some(e => e.includes('answer')));
});

test('validateEntry: valid muddled entry — returns length and null cells', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue', length: 5 }, 'entries[0]', true, errors, warnings);
  assert.deepEqual(result, { length: 5, cells: null });
  assert.equal(errors.length, 0);
});

test('validateEntry: valid muddled entry without clue — pushes error but still returns length', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ length: 7 }, 'entries[0]', true, errors, warnings);
  assert.ok(errors.some(e => e.includes('clue')));
  assert.deepEqual(result, { length: 7, cells: null });
});

// ── hasLengthWithoutHash ──────────────────────────────────────────────────────

test('hasLengthWithoutHash: normal source entries and not muddled — returns false, no error', () => {
  const entries = [
    { clue: 'A', answer: 'FOO' },
    { clue: 'B', answer: 'BAR' },
  ];
  const errors = [];
  const result = hasLengthWithoutHash(entries, false, errors);
  assert.equal(result, false);
  assert.equal(errors.length, 0);
});

test('hasLengthWithoutHash: muddled entries with boardHash present — returns false, no error', () => {
  const entries = [
    { clue: 'A', length: 3 },
    { clue: 'B', length: 4 },
  ];
  const errors = [];
  // isMuddled = true (boardHash present)
  const result = hasLengthWithoutHash(entries, true, errors);
  assert.equal(result, false);
  assert.equal(errors.length, 0);
});

test('hasLengthWithoutHash: muddled entry (length: without answer:) without boardHash — returns true and pushes error', () => {
  const entries = [
    { clue: 'A', length: 3 },
    { clue: 'B', length: 4 },
  ];
  const errors = [];
  // isMuddled = false (no boardHash at top level)
  const result = hasLengthWithoutHash(entries, false, errors);
  assert.equal(result, true);
  assert.ok(errors.length > 0, 'should push an error');
  assert.ok(errors[0].includes('boardHash'));
});

test('hasLengthWithoutHash: mixed entries with one muddled entry but no boardHash — returns true', () => {
  const entries = [
    { clue: 'A', answer: 'FOO' },
    { clue: 'B', length: 4 },   // muddled entry without answer
  ];
  const errors = [];
  const result = hasLengthWithoutHash(entries, false, errors);
  assert.equal(result, true);
  assert.ok(errors.length > 0);
});

test('hasLengthWithoutHash: null/non-object entries in array are skipped safely', () => {
  const entries = [null, 'not-an-entry', 42];
  const errors = [];
  const result = hasLengthWithoutHash(entries, false, errors);
  assert.equal(result, false);
  assert.equal(errors.length, 0);
});

// ── validateEntryStyles ───────────────────────────────────────────────────────

function runStyles(entry, label = 'entries[0]', cellCount = 4) {
  const errors = [], warnings = [];
  validateEntryStyles(entry, label, cellCount, errors, warnings);
  return { errors, warnings };
}

test('validateEntryStyles: no-op when styles is absent', () => {
  const { errors, warnings } = runStyles({});
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validateEntryStyles: error when styles is null', () => {
  const { errors } = runStyles({ styles: null });
  assert.ok(errors.some(e => e.includes('entries[0].styles must be an object')));
});

test('validateEntryStyles: error when styles is a string', () => {
  const { errors } = runStyles({ styles: 'circle' });
  assert.ok(errors.some(e => e.includes('entries[0].styles must be an object')));
});

test('validateEntryStyles: error when styles is an array', () => {
  const { errors } = runStyles({ styles: [0, 1] });
  assert.ok(errors.some(e => e.includes('entries[0].styles must be an object')));
});

test('validateEntryStyles: warning for unrecognized style name', () => {
  const { errors, warnings } = runStyles({ styles: { 'blue-shade': [0] } });
  assert.ok(warnings.some(w => w.includes('unrecognized style "blue-shade"')));
  assert.deepEqual(errors, []);
});

test('validateEntryStyles: error when style value is not an array', () => {
  const { errors } = runStyles({ styles: { circle: 0 } });
  assert.ok(errors.some(e => e.includes('circle') && e.includes('must be an array')));
});

test('validateEntryStyles: error when position is out of range', () => {
  const { errors } = runStyles({ styles: { circle: [4] } }, 'entries[0]', 4);
  assert.ok(errors.some(e => e.includes('position 4 is out of range (answer has 4 cells)')));
});

test('validateEntryStyles: error when position is negative', () => {
  const { errors } = runStyles({ styles: { circle: [-1] } });
  assert.ok(errors.some(e => e.includes('position -1 is out of range')));
});

test('validateEntryStyles: error when position is non-integer', () => {
  const { errors } = runStyles({ styles: { circle: [0.5] } });
  assert.ok(errors.some(e => e.includes('position 0.5 is out of range')));
});

test('validateEntryStyles: valid positions produce no errors', () => {
  const { errors, warnings } = runStyles({ styles: { circle: [0, 3] } }, 'entries[0]', 4);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validateEntryStyles: empty styles object produces no errors', () => {
  const { errors, warnings } = runStyles({ styles: {} });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validateEntryStyles: multiple style names — known valid and unknown both processed', () => {
  const { errors, warnings } = runStyles({ styles: { circle: [0], 'blue-shade': [1] } }, 'entries[0]', 4);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('unrecognized style "blue-shade"')));
  assert.ok(!warnings.some(w => w.includes('circle')));
});

test('validateEntryStyles: entryLabel appears in all error messages', () => {
  const { errors } = runStyles({ styles: { circle: [99] } }, 'inward[2]', 4);
  assert.ok(errors.every(e => e.startsWith('inward[2]')));
});

// ── checkCellStyles ───────────────────────────────────────────────────────────

const circ = (...p) => ({ styles: { circle: p } });
function run(coverage) { const errors = []; checkCellStyles(coverage, errors); return errors; }

test('checkCellStyles: a circle listed on both entries passes', () => {
  assert.deepEqual(run([
    { label: 'a', entry: circ(1), cells: ['x', 'y'] },
    { label: 'b', entry: circ(0), cells: ['y', 'z'] },
  ]), []);
});

test('checkCellStyles: a circle on one of two covering entries names the position to add', () => {
  const errors = run([
    { label: 'a', entry: circ(1), cells: ['x', 'y'] },
    { label: 'b', entry: {},      cells: ['y', 'z'] },
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^b\.styles\.circle is missing position 0: that cell is styled by a position 1/);
});

test('checkCellStyles: off-by-one positions report both cells', () => {
  const errors = run([
    { label: 'a', entry: circ(0), cells: ['x', 'y'] },
    { label: 'b', entry: circ(1), cells: ['x', 'y'] },
  ]);
  assert.equal(errors.length, 2);
  assert.ok(errors.some(e => /^b\.styles\.circle is missing position 0/.test(e)), errors.join('|'));
  assert.ok(errors.some(e => /^a\.styles\.circle is missing position 1/.test(e)), errors.join('|'));
});

test('checkCellStyles: a cell covered by one entry needs only that entry', () => {
  assert.deepEqual(run([
    { label: 'a', entry: circ(0), cells: ['x'] },
    { label: 'b', entry: {},      cells: ['y'] },
  ]), []);
});

test('checkCellStyles: an entry covering a cell twice must list both positions', () => {
  const errors = run([{ label: 'a', entry: circ(0), cells: ['x', 'y', 'x'] }]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^a\.styles\.circle is missing position 2: that cell is styled by a position 0/);
});

test('checkCellStyles: out-of-range and non-integer positions are left to validateEntryStyles', () => {
  assert.deepEqual(run([{ label: 'a', entry: circ(5, 0.5), cells: ['x'] }]), []);
});

test('checkCellStyles: entries without styles are fine', () => {
  assert.deepEqual(run([{ label: 'a', entry: { clue: 'c' }, cells: ['x'] }]), []);
});

// ── sameCell ──────────────────────────────────────────────────────────────────

const { sameCell } = require('../build/validateEntry');

test('sameCell: a cell matches itself, and its reverse only when read backward', () => {
  assert.equal(sameCell('cat', 'cat', false), true);
  assert.equal(sameCell('tac', 'cat', false), false);
  assert.equal(sameCell('tac', 'cat', true), true);
  assert.equal(sameCell('cta', 'cat', true), false);   // a reversal, not any rearrangement
});

// ── unknown keys ──────────────────────────────────────────────────────────────

test('validateEntry: an unknown key warns (a typo would otherwise be ignored); known keys don\'t', () => {
  const warnings = [];
  validateEntry({ clue: 'c', answer: 'CAT', style: { circle: [0] } }, 'inward[0]', false, [], warnings);
  assert.deepEqual(warnings, ['inward[0]: unknown key "style" (is it a typo?)']);
  const none = [];
  validateEntry({ clue: 'c', answer: 'CAT', length: 3, styles: { circle: [0] } }, 'inward[0]', false, [], none);
  assert.deepEqual(none, []);
});
