'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderClueMarkdown, renderInstructionsMarkdown } = require('../build/renderMarkdown');

// ── renderClueMarkdown (inline) ──────────────────────────────────────────────

test('renderClueMarkdown: bold', () => {
  assert.equal(renderClueMarkdown('**bold**'), '<strong>bold</strong>');
});

test('renderClueMarkdown: italic', () => {
  assert.equal(renderClueMarkdown('*italic*'), '<em>italic</em>');
});

test('renderClueMarkdown: code/monospace', () => {
  assert.equal(renderClueMarkdown('`code`'), '<code>code</code>');
});

test('renderClueMarkdown: link', () => {
  assert.equal(
    renderClueMarkdown('[text](https://example.com)'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">text</a>'
  );
});

test('renderClueMarkdown: strikethrough', () => {
  assert.equal(renderClueMarkdown('~~gone~~'), '<s>gone</s>');
});

test('renderClueMarkdown: subscript', () => {
  assert.equal(renderClueMarkdown('H~2~O'), 'H<sub>2</sub>O');
});

test('renderClueMarkdown: superscript', () => {
  assert.equal(renderClueMarkdown('29^th^'), '29<sup>th</sup>');
});

test('renderClueMarkdown: emoji shortcode', () => {
  assert.equal(renderClueMarkdown(':smile:'), '😄');
});

test('renderClueMarkdown: nested formatting (bold link)', () => {
  assert.equal(
    renderClueMarkdown('[**bold link**](https://x.com)'),
    '<a href="https://x.com" target="_blank" rel="noopener noreferrer"><strong>bold link</strong></a>'
  );
});

test('renderClueMarkdown: plain text passes through unchanged', () => {
  assert.equal(renderClueMarkdown('plain clue text'), 'plain clue text');
});

test('renderClueMarkdown: unclosed markup degrades to literal text, no crash', () => {
  assert.doesNotThrow(() => renderClueMarkdown('unclosed **bold'));
  assert.equal(renderClueMarkdown('unclosed **bold'), 'unclosed **bold');
});

test('renderClueMarkdown: HTML in the source is escaped, never executed', () => {
  assert.equal(
    renderClueMarkdown('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  );
});

test('renderClueMarkdown: HTML-special characters are escaped in plain text too', () => {
  assert.equal(renderClueMarkdown('a & b < c'), 'a &amp; b &lt; c');
});

test('renderClueMarkdown: a script-executing link scheme is rejected, not rendered as a link', () => {
  const result = renderClueMarkdown('[bad](javascript:alert(1))');
  assert.ok(!result.includes('<a'), `should not render an <a> tag: ${result}`);
});

test('renderClueMarkdown: an http(s) link opens in a new tab, safely', () => {
  const out = renderClueMarkdown('[ok](https://example.com)');
  // target="_blank" so clicking a clue link never navigates the puzzle page
  // itself away (and loses solve state in this tab); rel="noopener
  // noreferrer" is the standard safety pairing for target="_blank".
  assert.match(out, /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">ok<\/a>/);
});

// ── typographer (smart quotes, dashes, ellipsis) ─────────────────────────────

test('renderClueMarkdown: straight double quotes become curly', () => {
  assert.equal(renderClueMarkdown('a "quoted" word'), 'a “quoted” word');
});

test('renderClueMarkdown: an apostrophe becomes a curly closing single quote', () => {
  assert.equal(renderClueMarkdown("it's"), 'it’s');
});

test('renderClueMarkdown: a double hyphen becomes an en dash', () => {
  assert.equal(renderClueMarkdown('a--b'), 'a–b');
});

test('renderClueMarkdown: a triple hyphen becomes an em dash', () => {
  assert.equal(renderClueMarkdown('a---b'), 'a—b');
});

test('renderClueMarkdown: three dots become an ellipsis', () => {
  assert.equal(renderClueMarkdown('wait...'), 'wait…');
});

test('renderClueMarkdown: a backslash-escaped quote stays straight', () => {
  assert.equal(renderClueMarkdown('a \\"straight\\" word'), 'a &quot;straight&quot; word');
});

test('renderClueMarkdown: a backslash-escaped asterisk is literal, not emphasis', () => {
  assert.equal(renderClueMarkdown('5\\*7=35'), '5*7=35');
});

test('renderInstructionsMarkdown: straight quotes become curly', () => {
  assert.equal(renderInstructionsMarkdown('Say "go".'), '<p>Say “go”.</p>\n');
});

// ── renderInstructionsMarkdown (block) ───────────────────────────────────────

test('renderInstructionsMarkdown: a single paragraph becomes one <p>', () => {
  assert.equal(renderInstructionsMarkdown('Solve it.'), '<p>Solve it.</p>\n');
});

test('renderInstructionsMarkdown: blank-line-separated text becomes separate <p> elements', () => {
  assert.equal(
    renderInstructionsMarkdown('Fill in the blanks.\n\nEnjoy the puzzle.'),
    '<p>Fill in the blanks.</p>\n<p>Enjoy the puzzle.</p>\n'
  );
});

test('renderInstructionsMarkdown: inline formatting works inside a paragraph', () => {
  assert.equal(renderInstructionsMarkdown('Answers read **inward**.'), '<p>Answers read <strong>inward</strong>.</p>\n');
});
