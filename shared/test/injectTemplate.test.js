'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const injectTemplate = require('../build/injectTemplate');

const TEMPLATE = '<!DOCTYPE html><title>{{TITLE}}</title><style>{{CSS}}</style><script>{{PUZZLE_DATA}}</script>\n<script>{{JS}}</script>';

test('injectTemplate: escapes HTML special chars in title', () => {
  const result = injectTemplate(TEMPLATE, { title: '<b>Test & "Check"</b>', css: '', js: '', puzzleData: {} });
  assert.ok(result.includes('&lt;b&gt;Test &amp; &quot;Check&quot;&lt;/b&gt;'));
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

// Inside a <script>, "<!--" followed later by "<script" puts the HTML parser in a state
// where the element's own </script> no longer closes it, and the page script after it
// never runs. Author text (a title) can hold both.
test('injectTemplate: no <!-- reaches the data script, and the data still reads back as written', () => {
  const puzzleData = { title: 'Fun <!-- <script> puzzle' };
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: '', puzzleData });
  const data = result.match(/window\.PUZZLE_DATA = ([\s\S]*?);<\/script>/)[1];
  assert.ok(!data.includes('<!--'), data);
  assert.deepEqual(JSON.parse(data), puzzleData);
});

// $-pattern injection: a plain-string replacement interprets the special patterns
// ($$, $&, $`, $') in the replacement value itself, so any one of them shows whether
// the replacer is a function, whose return value is inserted literally. One case each
// for the title (escaped, but escHtml doesn't touch '$') and a puzzleData value
// (unescaped JSON), since the vulnerability applies to every placeholder.

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

test('injectTemplate: puzzleData value containing $& survives verbatim', () => {
  const result = injectTemplate(TEMPLATE, { title: 'T', css: '', js: '', puzzleData: { note: 'a$&b' } });
  assert.ok(result.includes('a$&b'));
});

// Inserted text is never searched for placeholders again: a title or stylesheet that
// happens to contain one keeps it literally.
test('injectTemplate: a placeholder inside an inserted value is left as written', () => {
  const result = injectTemplate(TEMPLATE, { title: 'My {{CSS}} puzzle', css: '/* {{JS}} */', js: 'go()', puzzleData: {} });
  assert.ok(result.includes('<title>My {{CSS}} puzzle</title>'));
  assert.ok(result.includes('<style>/* {{JS}} */</style>'));
});
