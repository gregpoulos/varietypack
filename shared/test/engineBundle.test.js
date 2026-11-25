'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('vm');
const os       = require('os');
const { execFileSync } = require('child_process');
const esbuild  = require('esbuild');
const { engineJs } = require('../build/engineBundle');
const { KINDS } = require('../build/tools');

test('engineJs: every tool has a script that parses', () => {
  for (const tool of KINDS) {
    const js = engineJs(tool);
    assert.ok(js.includes('PUZZLE_DATA'), `${tool}: the engine reads the puzzle data`);
    assert.doesNotThrow(() => new vm.Script(js), tool);
  }
});

// A directory build asks for a tool's script once per puzzle. Counted on a fresh copy
// of the module, whose cache the tests above haven't filled, given a counting esbuild
// (its exports are getters, so the real one can't be patched).
test('engineJs: bundles each tool once per process', () => {
  const modulePath = require.resolve('../build/engineBundle');
  const esbuildPath = require.resolve('esbuild');
  const realEntry = require.cache[esbuildPath];
  let calls = 0;
  const counting = { buildSync: (...args) => { calls++; return esbuild.buildSync(...args); } };
  require.cache[esbuildPath] = { ...realEntry, exports: counting };
  delete require.cache[modulePath];
  try {
    const fresh = require(modulePath);
    fresh.engineJs('spiral');
    fresh.engineJs('spiral');
  } finally {
    require.cache[esbuildPath] = realEntry;
    delete require.cache[modulePath];
  }
  assert.equal(calls, 1);
});

// esbuild marks each module in the bundle with a comment holding its path, so a path
// taken from the working directory would make the same tree build different pages from
// different directories, and a byte-for-byte comparison of two builds report false
// differences (docs/TESTING.md → "What to run when").
// esbuild reads the directory once, when it loads, so the other build is another process.
test('engineJs: the script is the same whatever directory the build runs from', () => {
  const modulePath = require.resolve('../build/engineBundle');
  const elsewhere = execFileSync(process.execPath,
    ['-e', `process.stdout.write(require(${JSON.stringify(modulePath)}).engineJs('spiral'))`],
    { cwd: os.tmpdir(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(elsewhere, engineJs('spiral'));
});

// injectTemplate inserts the script as it is, so a closing </script or an opening <!--
// anywhere in it would end or confuse the page's script element.
test('engineJs: no script contains </script or <!--', () => {
  for (const tool of KINDS) {
    assert.doesNotMatch(engineJs(tool), /<\/script|<!--/i, tool);
  }
});

// An ES module is strict by definition, but esbuild emits an iife without the directive,
// so without it the page script would run sloppy (an assignment to an undeclared name
// would create a global instead of throwing).
test('engineJs: every script opens with the strict-mode directive', () => {
  for (const tool of KINDS) {
    assert.match(engineJs(tool), /^"use strict";/, tool);
  }
});

test('engineJs: an unknown tool is refused', () => {
  assert.throws(() => engineJs('nope'), /unknown tool/);
});
