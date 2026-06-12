'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { validateEntry, hasLengthWithoutHash } = require('../build/validateEntry');

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
  assert.equal(result, 5);
});

test('validateEntry: empty clue string on source entry — pushes error but still returns length', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: '', answer: 'HELLO' }, 'entries[0]', false, errors, warnings);
  assert.ok(errors.some(e => e.includes('clue')));
  assert.equal(result, 5);
});

test('validateEntry: valid source entry — returns normalized letter count', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'Some clue', answer: 'HELLO' }, 'entries[0]', false, errors, warnings);
  assert.equal(result, 5);
  assert.equal(errors.length, 0);
});

test('validateEntry: valid source entry with multi-word answer — normalizes correctly', () => {
  const errors = [], warnings = [];
  // "LIE TO" normalizes to "lieto" (5 letters)
  const result = validateEntry({ clue: 'Fib', answer: 'LIE TO' }, 'entries[0]', false, errors, warnings);
  assert.equal(result, 5);
  assert.equal(errors.length, 0);
});

test('validateEntry: valid source entry with hyphenated answer — normalizes correctly', () => {
  const errors = [], warnings = [];
  // "WAH-WAH" normalizes to "wahwah" (6 letters)
  const result = validateEntry({ clue: 'Repetitive sound', answer: 'WAH-WAH' }, 'entries[0]', false, errors, warnings);
  assert.equal(result, 6);
  assert.equal(errors.length, 0);
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

test('validateEntry: valid muddled entry — returns length', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ clue: 'A clue', length: 5 }, 'entries[0]', true, errors, warnings);
  assert.equal(result, 5);
  assert.equal(errors.length, 0);
});

test('validateEntry: valid muddled entry without clue — pushes error but still returns length', () => {
  const errors = [], warnings = [];
  const result = validateEntry({ length: 7 }, 'entries[0]', true, errors, warnings);
  assert.ok(errors.some(e => e.includes('clue')));
  assert.equal(result, 7);
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

test('hasLengthWithoutHash: empty entry array and not muddled — returns false, no error', () => {
  const errors = [];
  const result = hasLengthWithoutHash([], false, errors);
  assert.equal(result, false);
  assert.equal(errors.length, 0);
});
