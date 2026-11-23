'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { formatCell, formatAnswer, sameCells } = require('../src/model/cells');

test('formatCell: empty, single letter, rebus', () => {
  assert.equal(formatCell(''), '·');
  assert.equal(formatCell('a'), 'A');
  assert.equal(formatCell('har'), '[HAR]');
});

test('formatAnswer: brackets a rebus cell, and refuses an empty one', () => {
  assert.equal(formatAnswer(['s', 'har', 'o', 'n']), 'S[HAR]ON');
  assert.throws(() => formatAnswer(['a', '', 'b']), /empty/);
});

test('sameCells compares element by element', () => {
  assert.equal(sameCells(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameCells(['a', 'b'], ['a']), false);
  assert.equal(sameCells(['a', 'b'], ['a', 'c']), false);
});
