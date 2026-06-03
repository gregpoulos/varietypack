'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sha256hex = require('../sha256hex');

test('sha256hex: known input produces correct hex digest', () => {
  // echo -n "hello" | shasum -a 256
  const result = sha256hex('hello');
  assert.equal(result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('sha256hex: empty string produces correct hex digest', () => {
  // echo -n "" | shasum -a 256
  const result = sha256hex('');
  assert.equal(result, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('sha256hex: returns a 64-character hex string', () => {
  const result = sha256hex('test');
  assert.match(result, /^[0-9a-f]{64}$/);
});

test('sha256hex: works as a standalone browser script (no module, no crypto dependency)', () => {
  // Run the module source in a vm sandbox with no globals to confirm it needs neither
  const source = fs.readFileSync(path.join(__dirname, '../sha256hex.js'), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const result = sandbox.sha256hex('hello');
  assert.equal(result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('sha256hex: matches Node crypto.createHash output', () => {
  const crypto = require('crypto');
  const nodeHash = str => crypto.createHash('sha256').update(str).digest('hex');
  for (const input of ['', 'abc', 'hello world', 'lieto']) {
    assert.equal(sha256hex(input), nodeHash(input), `mismatch for input: ${input}`);
  }
});
