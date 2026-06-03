'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const CLI = path.resolve(__dirname, '..', 'cli.js');
const FIXTURE = path.resolve(__dirname, 'fixtures/test-78.yaml');

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'spiral-cli-test-'));
}

// ── --minify ──────────────────────────────────────────────────────────────────

test('--minify exits 0 and produces a smaller file than without it', () => {
  const dir = tmpDir();
  const normal = path.join(dir, 'normal.html');
  const minified = path.join(dir, 'minified.html');
  const r1 = run(FIXTURE, '-o', normal);
  assert.equal(r1.status, 0, r1.stderr);
  const r2 = run(FIXTURE, '--minify', '-o', minified);
  assert.equal(r2.status, 0, r2.stderr);
  const normalSize = fs.statSync(normal).size;
  const minifiedSize = fs.statSync(minified).size;
  assert.ok(minifiedSize < normalSize, `minified (${minifiedSize}) should be smaller than normal (${normalSize})`);
});

test('--help mentions --minify', () => {
  const r = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.match(r.stdout, /--minify/);
});
