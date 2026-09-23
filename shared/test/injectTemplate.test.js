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

// $-pattern injection: a plain-string replaceAll replacement interprets
// special patterns ($$, $&, $`, $') in the replacement value itself. A
// function replacer's return value is inserted literally. These four cases
// cover title (escaped, but escHtml doesn't touch '$') and a puzzleData
// value (unescaped JSON), since the vulnerability applies to every
// placeholder substitution, not just title.

test('injectTemplate: title containing $$ survives verbatim', () => {
  const result = injectTemplate(TEMPLATE, { title: 'Demo $$ Puzzle', css: '', js: '', puzzleData: {} });
  assert.ok(result.includes('Demo $$ Puzzle'));
});

test('injectTemplate: title containing $& survives verbatim (post-escaping)', () => {
  const result = injectTemplate(TEMPLATE, { title: 'Demo $& Puzzle', css: '', js: '', puzzleData: {} });
  assert.ok(result.includes('Demo $&amp; Puzzle'));
});

test('injectTemplate: title containing $` survives verbatim', () => {
  const result = injectTemplate(TEMPLATE, { title: 'Demo $` Puzzle', css: '', js: '', puzzleData: {} });
  assert.ok(result.includes('Demo $` Puzzle'));
});

test('injectTemplate: title containing $\' survives verbatim and does not close the data script early', () => {
  const result = injectTemplate(TEMPLATE, {
    title: "Demo $'<img src=x onerror=alert(1)>", css: '', js: '',
    puzzleData: { x: 1 },
  });
  assert.ok(result.includes("Demo $&#39;&lt;img src=x onerror=alert(1)&gt;"));
  // The data <script> block must not contain a </script> tag introduced by
  // $'-expansion (the "rest of the template" past the TITLE match).
  const scriptOpen = result.indexOf('window.PUZZLE_DATA');
  const scriptTagEnd = result.indexOf('</script>', scriptOpen);
  const nextScriptOpenTag = result.indexOf('<script>', scriptOpen + 1);
  // The first </script> after the data assignment must close that same
  // block cleanly — i.e. nothing from the title leaked in between — and any
  // later <script> tag must come strictly after it, confirming scriptTagEnd
  // is the real closing tag for this block, not a spurious one the leak
  // introduced before the template's next legitimate <script>.
  assert.ok(scriptTagEnd !== -1);
  assert.ok(result.slice(scriptOpen, scriptTagEnd).includes('"x": 1'));
  assert.ok(nextScriptOpenTag === -1 || nextScriptOpenTag > scriptTagEnd);
});

test('injectTemplate: puzzleData value containing $$ survives verbatim (not collapsed)', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: '', puzzleData: { note: 'a$$b' } });
  assert.ok(result.includes('a$$b'));
});

test('injectTemplate: puzzleData value containing $& survives verbatim', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: '', puzzleData: { note: 'a$&b' } });
  assert.ok(result.includes('a$&b'));
});

test('injectTemplate: puzzleData value containing $` survives verbatim', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: '', puzzleData: { note: 'a$`b' } });
  assert.ok(result.includes('a$`b'));
});

test('injectTemplate: puzzleData value containing $\' survives verbatim', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: '', puzzleData: { note: "a$'b" } });
  assert.ok(result.includes("a$'b"));
});
