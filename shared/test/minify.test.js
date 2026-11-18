'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { minifyHtml } = require('../cli/minify');

// ── CSS minification of <style> blocks ────────────────────────────────────────

test('minifyHtml: minifies <style> CSS (collapses whitespace, not just comments)', () => {
  const css = `body {\n  color: red;\n  margin: 0;\n}`;
  const input = `<style>${css}</style>`;
  const out = minifyHtml(input);
  const m = out.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(m, 'style block present');
  assert.ok(m[1].length < css.length, 'CSS shortened by minification');
  assert.ok(m[1].includes('body{color:red'),
    `selector/declaration whitespace collapsed; got: ${m[1]}`);
});

test('minifyHtml: preserves /* */ inside a CSS string value', () => {
  // simplePass is string-unaware and would delete this; the CSS minifier keeps string
  // tokens intact.
  const input = `<style>.x::before { content: "/* not a comment */"; }</style>`;
  const out = minifyHtml(input);
  assert.ok(out.includes('/* not a comment */'),
    `comment-like sequence inside a CSS string must survive; got: ${out}`);
});

test('minifyHtml: minifies nested CSS, keeping its rules', () => {
  const css = 'html.phone { .solve-top { flex: none; } &.kb-left #solve-view { color: red; } }';
  const out = minifyHtml(`<style>${css}</style>`);
  assert.equal(out, '<style>html.phone{.solve-top{flex:none}&.kb-left #solve-view{color:red}}</style>');
});

test('minifyHtml: reports a block it leaves unminified, and nothing for one it minifies', () => {
  const skipped = [];
  minifyHtml('<script>not }{ js</script><style>a { color: red; }</style><script>let a = 1;</script>',
    message => skipped.push(message));
  assert.equal(skipped.length, 1, skipped.join('\n'));
  assert.match(skipped[0], /^a <script> was left unminified: \S/);
});

test('minifyHtml: minifies a style block that opens with a remote @import, keeping the import', () => {
  // What --font link emits (buildFontCss).
  const out = minifyHtml("<style>@import url('https://fonts.example/css2?family=X');\nbody {\n  color: red;\n}</style>");
  assert.ok(out.includes('body{color:red}'), out);
  assert.ok(out.includes('@import"https://fonts.example/css2?family=X"'), out);
});

// ── comment-like text outside script and style ─────────────────────────────────

// Outside <script>/<style> there are no JS or CSS comments: /* */ and // there are page
// text, such as a puzzle title.
test('minifyHtml: keeps /* */ in page text outside script and style blocks', () => {
  const out = minifyHtml('<title>A /* b */ c</title><h1>A /* b */ c</h1>');
  assert.equal(out, '<title>A /* b */ c</title><h1>A /* b */ c</h1>');
});

test('minifyHtml: keeps a line starting with // outside script and style blocks', () => {
  const out = minifyHtml('<html>\n// not a comment\n<p>content</p>\n</html>');
  assert.ok(out.includes('// not a comment'), out);
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
  const scriptMatch = out.match(/<script>([\s\S]*?)<\/script>/i);
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

// ── unparseable script ──────────────────────────────────────────────────

test('minifyHtml: leaves a script block unchanged when it cannot be parsed', () => {
  const badJs = 'this is not }{[ valid javascript @@@@';
  const input = `<html><script>${badJs}</script></html>`;
  const out = minifyHtml(input);
  const scriptMatch = out.match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(scriptMatch, 'script block still present');
  assert.ok(scriptMatch[1].includes('not }{[ valid'));
});
