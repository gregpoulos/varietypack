'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { KINDS, isKnownKind, hooksFor, kindError } = require('../build/tools');

test('isKnownKind accepts only own tool names', () => {
  for (const kind of KINDS) assert.equal(isKnownKind(kind), true);
  for (const bad of ['toString', 'constructor', '__proto__', 'nope', '', undefined, null, 3, {}]) {
    assert.equal(isKnownKind(bad), false, String(bad));
  }
});

test('hooksFor returns each tool\'s validate/prepare/build hooks', () => {
  for (const kind of KINDS) {
    const hooks = hooksFor(kind);
    assert.equal(typeof hooks.validateFn, 'function', kind);
    assert.equal(typeof hooks.prepareFn, 'function', kind);
    assert.equal(typeof hooks.buildHtmlFn, 'function', kind);
  }
});

test('hooksFor throws on an unknown kind, including inherited property names', () => {
  assert.throws(() => hooksFor('nope'), /unknown kind "nope"/);
  assert.throws(() => hooksFor('toString'), /unknown kind "toString"/);
});

test('kindError reports a missing, invalid or unknown kind, else null', () => {
  assert.equal(kindError(undefined), 'missing or invalid "kind" field');
  assert.equal(kindError({}), 'missing or invalid "kind" field');
  assert.equal(kindError({ kind: 7 }), 'missing or invalid "kind" field');
  assert.equal(kindError({ kind: 'nope' }), 'unknown kind "nope"');
  assert.equal(kindError({ kind: 'toString' }), 'unknown kind "toString"');
  assert.equal(kindError({ kind: 'spiral' }), null);
});

test('requiring the registry loads no tool', () => {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, ['-e', `
    require(${JSON.stringify(require.resolve('../build/tools'))});
    console.log(Object.keys(require.cache).filter(k => /builder\\.js$/.test(k)).length);
  `]).toString().trim();
  assert.equal(out, '0');
});
