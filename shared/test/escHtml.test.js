'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const escHtml = require('../escHtml');

const CASES = [
  ['escapes ampersand',              'a & b',              'a &amp; b'],
  ['escapes less-than',              '<div>',              '&lt;div&gt;'],
  ['escapes greater-than',           'a > b',              'a &gt; b'],
  ['escapes double quote',           '"hello"',            '&quot;hello&quot;'],
  ['escapes multiple characters',    '<a href="x&y">',     '&lt;a href=&quot;x&amp;y&quot;&gt;'],
  ['returns plain string unchanged', 'hello world',        'hello world'],
  ['handles empty string',           '',                   ''],
  ['escapes single quote',           "it's",               'it&#39;s'],
];

for (const [label, input, expected] of CASES) {
  test(`escHtml: ${label}`, () => {
    assert.equal(escHtml(input), expected);
  });
}
