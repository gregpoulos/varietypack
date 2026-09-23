'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const normalize = require('../normalize');

const CASES = [
  ['lowercases a string',                    'HELLO',      'hello'],
  ['strips spaces from multi-word answer',   'LIE TO',     'lieto'],
  ['strips internal spaces',                 'GUESS WHO',  'guesswho'],
  ['strips leading and trailing whitespace', '  MALL  ',   'mall'],
  ['strips tabs and newlines',                'A\tB\nC',    'abc'],
  ['strips hyphens',                         'WAH-WAH',    'wahwah'],
  ['strips hyphens and spaces together',     'SELF - SERVE', 'selfserve'],
  ['handles already-lowercase input',        'imago',      'imago'],
  ['handles empty string',                   '',           ''],
  ['strips apostrophes',                     "DON'T",      'dont'],
  ['strips other punctuation',               'MR. T',      'mrt'],
];

for (const [label, input, expected] of CASES) {
  test(`normalize: ${label}`, () => {
    assert.equal(normalize(input), expected);
  });
}
