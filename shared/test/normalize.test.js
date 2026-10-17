'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, foldLetters } = require('../normalize.mjs');

const CASES = [
  ['lowercases a string',                    'HELLO',      'hello'],
  ['strips spaces from multi-word answer',   'LIE TO',     'lieto'],
  ['strips leading and trailing whitespace', '  MALL  ',   'mall'],
  ['strips tabs and newlines',                'A\tB\nC',    'abc'],
  ['strips hyphens',                         'WAH-WAH',    'wahwah'],
  ['handles empty string',                   '',           ''],
  ['strips apostrophes',                     "DON'T",      'dont'],
  ['strips other punctuation',               'MR. T',      'mrt'],
  ['folds accented letters to their base',   'JALAPEÑO',   'jalapeno'],
  ['folds a decomposed accent (e + U+0301)', 'CAFE\u0301', 'cafe'],
  ['folds compatibility forms (ligature)',   '\uFB01LM',   'film'],
  ['folds full-width letters',               'ＣＡＴ',      'cat'],
  ['drops letters with no a–z base',         'ÆØßΔ',       ''],
  ['keeps digits',                           'R2-D2',      'r2d2'],
  ['folds superscript and circled digits',   '²①',         '21'],
];

for (const [label, input, expected] of CASES) {
  test(`normalize: ${label}`, () => {
    assert.equal(normalize(input), expected);
  });
}

test('foldLetters: folds accents and compatibility forms, keeping case and punctuation', () => {
  assert.equal(foldLetters('Café \uFB01［1］-Ñ'), 'Cafe fi[1]-N');
});
