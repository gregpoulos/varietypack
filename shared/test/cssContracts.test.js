'use strict';
// Values a stylesheet and a page script each hold a copy of, because CSS can't share
// them: a media query can't read a custom property, and a script's timer can't read an
// animation's duration before it runs. Each test fails when the copies drift.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('the landscape-phone query is the same in phone.css, theme-components.css and engine-phone.mjs', () => {
  const inScript = read('engine-phone.mjs').match(/const LANDSCAPE_PHONE = '([^']+)'/)[1];
  for (const file of ['phone.css', 'themes/theme-components.css']) {
    const queries = [...read(file).matchAll(/@media screen and (\(orientation: landscape\)[^{]*?)\s*\{/g)].map(m => m[1]);
    assert.deepEqual(queries, [inScript], file);
  }
});

test("the wrong-check flash lasts as long in base.css as engine-chrome.mjs's timer", () => {
  const inScript = read('engine-chrome.mjs').match(/const FLASH_WRONG_MS = (\d+);/)[1];
  const inCss = read('base.css').match(/--flash-wrong-duration:\s*(\d+)ms;/)[1];
  assert.equal(inCss, inScript);
});
