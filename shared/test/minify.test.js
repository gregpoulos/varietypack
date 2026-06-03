'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { minifyHtml } = require('../build/minify');

// ── block comment stripping ───────────────────────────────────────────────────

test('minifyHtml: strips /* block */ comments', () => {
  const input = `<style>
/* this is a comment */
body { color: red; }
/* another
   multi-line
   comment */
</style>`;
  const out = minifyHtml(input);
  assert.ok(!out.includes('/* this is a comment */'));
  assert.ok(!out.includes('/* another'));
  assert.ok(out.includes('body { color: red; }'));
});

// ── line-only // comment stripping ───────────────────────────────────────────

test('minifyHtml: strips line-only // comments in non-script content', () => {
  // simplePass runs on the full HTML string; // comments outside <script> blocks
  // can appear in template text or inline content
  const input = `<html>
// line-only comment
<p>content</p>
  // indented comment
</html>`;
  const out = minifyHtml(input);
  assert.ok(!out.includes('// line-only comment'));
  assert.ok(!out.includes('// indented comment'));
  assert.ok(out.includes('<p>content</p>'));
});

test('minifyHtml: preserves // mid-line (e.g. in URLs)', () => {
  const input = `<script>
var url = "https://example.com";
</script>`;
  const out = minifyHtml(input);
  assert.ok(out.includes('https://example.com'));
});

// ── blank line collapsing ─────────────────────────────────────────────────────

test('minifyHtml: collapses 3+ consecutive blank lines to 2', () => {
  const input = 'a\n\n\n\n\nb';
  const out = minifyHtml(input);
  assert.ok(!out.includes('\n\n\n'));
  assert.ok(out.includes('a'));
  assert.ok(out.includes('b'));
});

test('minifyHtml: preserves single and double blank lines', () => {
  const input = 'a\n\nb';
  const out = minifyHtml(input);
  assert.ok(out.includes('a\n\nb'));
});

// ── trailing whitespace stripping ─────────────────────────────────────────────

test('minifyHtml: strips trailing whitespace per line', () => {
  const input = 'var x = 1;   \nvar y = 2;\t\n';
  const out = minifyHtml(input);
  assert.ok(!out.includes('1;   '));
  assert.ok(!out.includes('2;\t'));
  assert.ok(out.includes('var x = 1;'));
  assert.ok(out.includes('var y = 2;'));
});

// ── script block minification ─────────────────────────────────────────────────

test('minifyHtml: minifies <script> block content', () => {
  const js = `
    function add(firstNumber, secondNumber) {
      var result = firstNumber + secondNumber;
      return result;
    }
  `;
  const input = `<html><script>${js}</script></html>`;
  const out = minifyHtml(input);
  const scriptMatch = out.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'script block present');
  const minifiedJs = scriptMatch[1];
  assert.ok(minifiedJs.length < js.length, 'script content is shorter after minification');
  // verify the minified output is still parseable JS (compiles without executing)
  assert.doesNotThrow(() => new Function(minifiedJs), 'minified script should be valid JS');
});

test('minifyHtml: minifies <script> tags that carry attributes', () => {
  const js = `function f(aLongParameterName) { var anUnusedLocal = 1; return aLongParameterName + aLongParameterName; }`;
  const input = `<script type="application/javascript">${js}</script>`;
  const out = minifyHtml(input);
  const m = out.match(/<script type="application\/javascript">([\s\S]*?)<\/script>/);
  assert.ok(m, 'attributed script tag preserved');
  assert.ok(m[1].length < js.length, `attributed script should be minified; got: ${m[1]}`);
});

// ── script string contents are not mangled by the comment/whitespace pass ──────

test('minifyHtml: preserves /* */ inside a <script> string literal', () => {
  const input = `<script>window.DATA = {note: "see /* footnote */ here"};</script>`;
  const out = minifyHtml(input);
  assert.ok(out.includes('/* footnote */'),
    `comment-like sequence inside a string must survive; got: ${out}`);
});

test('minifyHtml: does not delete across /* and */ in separate script strings', () => {
  const input = `<script>window.a = "x/*y"; window.b = "z*/w";</script>`;
  const out = minifyHtml(input);
  assert.ok(out.includes('x/*y'), `first string must survive; got: ${out}`);
  assert.ok(out.includes('z*/w'), `second string must survive; got: ${out}`);
});

// ── terser failure robustness ──────────────────────────────────────────────────

test('minifyHtml: leaves script block unchanged when terser cannot parse it', () => {
  const badJs = 'this is not }{[ valid javascript @@@@';
  const input = `<html><script>${badJs}</script></html>`;
  const out = minifyHtml(input);
  const scriptMatch = out.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'script block still present');
  assert.ok(scriptMatch[1].includes('not }{[ valid'));
});
