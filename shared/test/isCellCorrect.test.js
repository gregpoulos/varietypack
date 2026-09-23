'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const isCellCorrect = require('../isCellCorrect');

const CASES = [
  ['same letter (uppercase input) returns true', 'A', 'a', true],
  ['same letter (lowercase input) returns true', 'a', 'A', true],
  ['same letter (both same case) returns true',  'B', 'B', true],
  ['different letters returns false',            'A', 'B', false],
  ['empty string returns false',                 '',  'A', false],
];

for (const [label, entered, answer, expected] of CASES) {
  test(`isCellCorrect: ${label}`, () => {
    assert.equal(isCellCorrect(entered, answer), expected);
  });
}
