'use strict';

/**
 * Behavioral tests for the shared runToolCli() helper (shared/build/toolCli.js).
 *
 * These tests invoke a real per-tool CLI via subprocess so they exercise the
 * full behavior, not just the module in isolation. Snake Charmer is used as the
 * representative tool since it exercises both the shared path and a tool-specific
 * flag (--shape). Behaviors tested here must not be duplicated in per-tool
 * cli.test.js files — one home per behavior.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');

// Representative tool: Snake Charmer
const SC_CLI     = path.resolve(__dirname, '../../snake-charmer/cli.js');
const SC_FIXTURE = path.resolve(__dirname, '../../snake-charmer/test/fixtures/circle-36.yaml');

function run(cli, ...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

// ── help flags ────────────────────────────────────────────────────────────────

test('--help writes usage to stdout and exits 0', () => {
  const r = run(SC_CLI, '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.equal(r.stderr, '');
});

test('-h writes usage to stdout and exits 0', () => {
  const r = run(SC_CLI, '-h');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.equal(r.stderr, '');
});

test('--help mentions --minify', () => {
  const r = run(SC_CLI, '--help');
  assert.match(r.stdout, /--minify/);
});

// ── no-args / missing input ───────────────────────────────────────────────────

test('no args writes usage to stderr and exits 1', () => {
  const r = run(SC_CLI);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage:/);
  assert.equal(r.stdout, '');
});

test('flags without a positional input file exits 1 with error', () => {
  const r = run(SC_CLI, '--theme', 'broadsheet');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no input file/);
});

// ── invalid flag ──────────────────────────────────────────────────────────────

test('unknown flag exits 1 with error message', () => {
  const r = run(SC_CLI, SC_FIXTURE, '--unknown-flag');
  assert.equal(r.status, 1);
  assert.notEqual(r.stderr, '');
});

// ── overwrite protection ──────────────────────────────────────────────────────

test('exits 1 with error when output file already exists', () => {
  const out = path.join(tmpDir('tc-exist'), 'out.html');
  run(SC_CLI, SC_FIXTURE, '-o', out);          // first build
  const r = run(SC_CLI, SC_FIXTURE, '-o', out); // second without --force
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
  assert.match(r.stderr, /--force/);
});

test('--force overwrites existing output file', () => {
  const out = path.join(tmpDir('tc-force'), 'out.html');
  run(SC_CLI, SC_FIXTURE, '-o', out);
  const r = run(SC_CLI, SC_FIXTURE, '--force', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

test('-f overwrites existing output file', () => {
  const out = path.join(tmpDir('tc-f'), 'out.html');
  run(SC_CLI, SC_FIXTURE, '-o', out);
  const r = run(SC_CLI, SC_FIXTURE, '-f', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

// ── tool-specific flag (--shape) ─────────────────────────────────────────────

test('--shape stadium exits 0 and produces output file', () => {
  const out = path.join(tmpDir('tc-shape'), 'out.html');
  const r = run(SC_CLI, SC_FIXTURE, '--shape', 'stadium', '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out), 'output file should exist');
});

// ── --minify ──────────────────────────────────────────────────────────────────

test('--minify exits 0 and produces a smaller file than without it', () => {
  const dir      = tmpDir('tc-minify');
  const normal   = path.join(dir, 'normal.html');
  const minified = path.join(dir, 'minified.html');
  const r1 = run(SC_CLI, SC_FIXTURE, '-o', normal);
  assert.equal(r1.status, 0, r1.stderr);
  const r2 = run(SC_CLI, SC_FIXTURE, '--minify', '-o', minified);
  assert.equal(r2.status, 0, r2.stderr);
  const normalSize   = fs.statSync(normal).size;
  const minifiedSize = fs.statSync(minified).size;
  assert.ok(minifiedSize < normalSize,
    `minified (${minifiedSize}) should be smaller than normal (${normalSize})`);
});
