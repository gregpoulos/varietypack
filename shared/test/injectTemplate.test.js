'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const injectTemplate = require('../build/injectTemplate');

const TEMPLATE = '<!DOCTYPE html><title>{{TITLE}}</title><style>{{CSS}}</style><script>{{PUZZLE_DATA}}</script>\n<script>{{JS}}</script>';

test('injectTemplate: replaces {{TITLE}} with HTML-escaped title', () => {
  const result = injectTemplate(TEMPLATE, { title: 'My Puzzle', css: '', js: '', puzzleData: {} });
  assert.ok(result.includes('<title>My Puzzle</title>'));
});

test('injectTemplate: escapes HTML special chars in title', () => {
  const result = injectTemplate(TEMPLATE, { title: '<b>Test & "Check"</b>', css: '', js: '', puzzleData: {} });
  assert.ok(result.includes('&lt;b&gt;Test &amp; &quot;Check&quot;&lt;/b&gt;'));
});

test('injectTemplate: replaces {{CSS}} with provided CSS', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: 'body{color:red}', js: '', puzzleData: {} });
  assert.ok(result.includes('body{color:red}'));
});

test('injectTemplate: replaces {{JS}} with provided JS', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: 'console.log(1)', puzzleData: {} });
  assert.ok(result.includes('console.log(1)'));
});

test('injectTemplate: injects window.PUZZLE_DATA assignment', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: '', puzzleData: { x: 1 } });
  assert.ok(result.includes('window.PUZZLE_DATA'));
  assert.ok(result.includes('"x": 1'));
});

test('injectTemplate: XSS protection — replaces </ with <\\/ in data', () => {
  const result = injectTemplate(TEMPLATE, {
    title: 'T', css: '', js: '',
    puzzleData: { evil: '</script><script>alert(1)' },
  });
  assert.ok(!result.includes('</script><script>'));
  assert.ok(result.includes('<\\/script>'));
});
