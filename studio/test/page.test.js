'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('vm');
const { buildPage, escapeInlineScript, ROOT } = require('../build');

function inlineScriptBody(html) {
  const start = html.indexOf('<script>') + '<script>'.length;
  return html.slice(start, html.lastIndexOf('</script>'));
}

test('escapeInlineScript: rewrites "<!--" and "</script"', () => {
  assert.equal(escapeInlineScript('"<!--</script>"'), '"\\x3C!--\\x3C/script>"');
});

test('buildPage: the page has exactly one closing script tag', async () => {
  const html = await buildPage();
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
});

test('buildPage: the inline script contains no "<!--"', async () => {
  const html = await buildPage();
  assert.ok(!inlineScriptBody(html).includes('<!--'));
});

test('buildPage: the inline script still parses', async () => {
  const html = await buildPage();
  assert.doesNotThrow(() => new vm.Script(inlineScriptBody(html)));
});

test('buildPage: no absolute path from the build machine', async () => {
  const html = await buildPage();
  assert.ok(!html.includes(ROOT));
});
