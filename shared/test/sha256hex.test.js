'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const esbuild = require('esbuild');
const { sha256hex } = require('../sha256hex.mjs');

test('sha256hex: runs as part of a page script (no module system, no crypto dependency)', () => {
  // Bundle it the way a page's script is, then run that in a sandbox with no globals at
  // all.
  const { outputFiles } = esbuild.buildSync({
    stdin: { contents: "import { sha256hex } from './sha256hex.mjs'; globalThis.out = sha256hex('hello');", resolveDir: __dirname + '/..' },
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent',
  });
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(outputFiles[0].text, sandbox);
  assert.equal(sandbox.out, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('sha256hex: matches Node crypto.createHash output', () => {
  const crypto = require('crypto');
  const nodeHash = str => crypto.createHash('sha256').update(str).digest('hex');
  for (const input of ['', 'abc', 'hello world', 'lieto']) {
    assert.equal(sha256hex(input), nodeHash(input), `mismatch for input: ${input}`);
  }
});

// Real board strings span several 64-byte blocks; these lengths straddle the padding
// boundary (55/56 bytes) and the block boundary (64), once and twice over.
test('sha256hex: matches Node crypto across block and padding boundaries', () => {
  const crypto = require('crypto');
  const nodeHash = str => crypto.createHash('sha256').update(str).digest('hex');
  for (const len of [55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 1000]) {
    const input = Array.from({ length: len }, (_, i) => 'ab.c1'[i % 5]).join('');
    assert.equal(sha256hex(input), nodeHash(input), `mismatch at length ${len}`);
  }
});
