'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const normalize = require('../normalize');

test('normalize: lowercases a string', () => {
  assert.equal(normalize('HELLO'), 'hello');
});

test('normalize: strips spaces from multi-word answer', () => {
  assert.equal(normalize('LIE TO'), 'lieto');
});

test('normalize: strips internal spaces', () => {
  assert.equal(normalize('GUESS WHO'), 'guesswho');
});

test('normalize: strips leading and trailing whitespace', () => {
  assert.equal(normalize('  MALL  '), 'mall');
});

test('normalize: strips tabs and newlines', () => {
  assert.equal(normalize('A\tB\nC'), 'abc');
});

test('normalize: strips hyphens', () => {
  assert.equal(normalize('WAH-WAH'), 'wahwah');
});

test('normalize: strips hyphens and spaces together', () => {
  assert.equal(normalize('SELF - SERVE'), 'selfserve');
});

test('normalize: handles already-lowercase input', () => {
  assert.equal(normalize('imago'), 'imago');
});

test('normalize: handles empty string', () => {
  assert.equal(normalize(''), '');
});

test('normalize: strips apostrophes', () => {
  assert.equal(normalize("DON'T"), 'dont');
});

test('normalize: strips other punctuation', () => {
  assert.equal(normalize('MR. T'), 'mrt');
});
