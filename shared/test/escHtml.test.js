'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const escHtml = require('../escHtml');

test('escHtml: escapes ampersand', () => {
  assert.equal(escHtml('a & b'), 'a &amp; b');
});

test('escHtml: escapes less-than', () => {
  assert.equal(escHtml('<div>'), '&lt;div&gt;');
});

test('escHtml: escapes greater-than', () => {
  assert.equal(escHtml('a > b'), 'a &gt; b');
});

test('escHtml: escapes double quote', () => {
  assert.equal(escHtml('"hello"'), '&quot;hello&quot;');
});

test('escHtml: escapes multiple characters', () => {
  assert.equal(escHtml('<a href="x&y">'), '&lt;a href=&quot;x&amp;y&quot;&gt;');
});

test('escHtml: returns plain string unchanged', () => {
  assert.equal(escHtml('hello world'), 'hello world');
});

test('escHtml: handles empty string', () => {
  assert.equal(escHtml(''), '');
});

test('escHtml: escapes single quote', () => {
  assert.equal(escHtml("it's"), 'it&#39;s');
});
