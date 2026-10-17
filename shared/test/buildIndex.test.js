'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const buildIndex = require('../cli/buildIndex');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'buildindex-'));
}

test('buildIndex: writes index.html with the heading and one link per puzzle', () => {
  const dir = tmpDir();
  buildIndex([{ name: 'a.html', title: 'Alpha' }, { name: 'b.html', title: 'Beta' }], dir, 'Demo Puzzles');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /<title>Demo Puzzles<\/title>/);
  assert.match(html, /<h1>Demo Puzzles<\/h1>/);
  assert.match(html, /<a href="a\.html">Alpha<\/a>/);
  assert.match(html, /<a href="b\.html">Beta<\/a>/);
});

test('buildIndex: escapes HTML in titles, names, and heading', () => {
  const dir = tmpDir();
  buildIndex([{ name: 'x.html', title: 'A & <B>' }], dir, 'Tom & Jerry');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /A &amp; &lt;B&gt;/);
  assert.match(html, /Tom &amp; Jerry/);
  assert.doesNotMatch(html, /<B>/);
});

test('buildIndex: shows a placeholder when there are no puzzles', () => {
  const dir = tmpDir();
  buildIndex([], dir, 'Empty');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /No puzzles built yet/);
});

// $-pattern injection in the replacement value passed to replaceAll: a plain-string
// replacement reinterprets $$, $&, $`, $' in the (already HTML-escaped) title, so any
// one of them shows whether the replacer is a function.

test("buildIndex: title containing $' survives verbatim post-escaping", () => {
  const dir = tmpDir();
  buildIndex([{ name: 'a.html', title: "Demo $' Title" }], dir, 'Heading');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes("Demo $&#39; Title"));
});
