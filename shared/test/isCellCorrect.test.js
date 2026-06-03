'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const isCellCorrect = require('../isCellCorrect');

test('isCellCorrect: same letter (uppercase input) returns true', () => {
  assert.equal(isCellCorrect('A', 'a'), true);
});

test('isCellCorrect: same letter (lowercase input) returns true', () => {
  assert.equal(isCellCorrect('a', 'A'), true);
});

test('isCellCorrect: same letter (both same case) returns true', () => {
  assert.equal(isCellCorrect('B', 'B'), true);
});

test('isCellCorrect: different letters returns false', () => {
  assert.equal(isCellCorrect('A', 'B'), false);
});

test('isCellCorrect: empty string returns false', () => {
  assert.equal(isCellCorrect('', 'A'), false);
});
