'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const CLI = path.resolve(__dirname, '..', 'cli.js');
const FIXTURE = path.resolve(__dirname, 'fixtures/circle-36.yaml');

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sc-cli-test-'));
}

test('--help writes usage to stdout and exits 0', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, '');
});

test('-h writes usage to stdout and exits 0', () => {
  const result = spawnSync(process.execPath, [CLI, '-h'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, '');
});

test('no args writes usage to stderr and exits 1', () => {
  const result = spawnSync(process.execPath, [CLI], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.equal(result.stdout, '');
});

// ── overwrite protection ──────────────────────────────────────────────────────

test('exits 1 with error when output file already exists', () => {
  const out = path.join(tmpDir(), 'out.html');
  run(FIXTURE, '-o', out); // first build
  const r = run(FIXTURE, '-o', out); // second build without --force
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
  assert.match(r.stderr, /--force/);
});

test('--force overwrites existing output file', () => {
  const out = path.join(tmpDir(), 'out.html');
  run(FIXTURE, '-o', out);
  const r = run(FIXTURE, '--force', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

test('-f overwrites existing output file', () => {
  const out = path.join(tmpDir(), 'out.html');
  run(FIXTURE, '-o', out);
  const r = run(FIXTURE, '-f', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

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
