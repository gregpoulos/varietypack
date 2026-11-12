'use strict';
// `validate` reads each tool's validator module alone, so it never loads the page
// builder.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const FIXTURE = path.join(ROOT, 'snake-charmer/test/fixtures/circle-8.yaml');
const PAGE = path.join('shared', 'build', 'page');

test('validate does not load the page builder', () => {
  const script = `
    const { main } = require(${JSON.stringify(path.join(ROOT, 'cli.js'))});
    main(['validate', ${JSON.stringify(FIXTURE)}]);
    console.log(Object.keys(require.cache).some(f => f.includes(${JSON.stringify(PAGE)})));
  `;
  const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(out.trim().split('\n').pop(), 'false');
});
