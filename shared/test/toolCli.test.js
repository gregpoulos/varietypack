'use strict';

/**
 * Behavioral tests for the shared runToolCli() helper (shared/cli/toolCli.js).
 *
 * These call runToolCli() directly, in-process, with Snake Charmer's real
 * CLI config (exported by snake-charmer/cli.js) and injected
 * argv/stdout/stderr — exercising the full behavior (flag parsing, help text,
 * overwrite protection, actual file output) without spawning a subprocess.
 * Snake Charmer is used as the representative tool since it exercises both
 * the shared path and a tool-specific flag (--shape). The real per-tool entry
 * points are covered by the dispatcher test in test/cli.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');

const { runToolCli } = require('../cli/toolCli');
const { CLI_CONFIG } = require('../../snake-charmer/cli');

const SC_FIXTURE = path.resolve(__dirname, '../../snake-charmer/test/fixtures/circle-36.yaml');

function run(...argv) {
  let out = '';
  let err = '';
  const status = runToolCli(CLI_CONFIG, {
    argv,
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
  });
  return { status, stdout: out, stderr: err };
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

// ── help flags ────────────────────────────────────────────────────────────────
// -h/--help alias semantics live in globalHelp.test.js; the no-args case below
// is runToolCli's own (stderr usage line, not the full help).

test('--help writes usage to stdout and exits 0', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.equal(r.stderr, '');
});

test('--help mentions --minify', () => {
  const r = run('--help');
  assert.match(r.stdout, /--minify/);
});

// ── no-args / missing input ───────────────────────────────────────────────────

test('no args writes usage to stderr and exits 1', () => {
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage:/);
  assert.equal(r.stdout, '');
});

test('flags without a positional input file exits 1 with error', () => {
  const r = run('--theme', 'broadsheet');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no input file/);
});

// ── invalid flag ──────────────────────────────────────────────────────────────

test('unknown flag exits 1 with error message', () => {
  const r = run(SC_FIXTURE, '--unknown-flag');
  assert.equal(r.status, 1);
  assert.notEqual(r.stderr, '');
});

// ── overwrite protection ──────────────────────────────────────────────────────

test('exits 1 with error when output file already exists', () => {
  const out = path.join(tmpDir('tc-exist'), 'out.html');
  run(SC_FIXTURE, '-o', out);          // first build
  const r = run(SC_FIXTURE, '-o', out); // second without --force
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
  assert.match(r.stderr, /--force/);
});

test('--force overwrites existing output file', () => {
  const out = path.join(tmpDir('tc-force'), 'out.html');
  run(SC_FIXTURE, '-o', out);
  const r = run(SC_FIXTURE, '--force', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

test('-f overwrites existing output file', () => {
  const out = path.join(tmpDir('tc-f'), 'out.html');
  run(SC_FIXTURE, '-o', out);
  const r = run(SC_FIXTURE, '-f', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

test('-f never overwrites the input file itself', () => {
  const input = path.join(tmpDir('tc-self'), 'puzzle.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const r = run(input, '-f', '-o', input);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /output path is the input file/);
  assert.equal(fs.readFileSync(input, 'utf8'), fs.readFileSync(SC_FIXTURE, 'utf8'));
});

// ── tool-specific flag (--shape) ─────────────────────────────────────────────

test('--shape stadium exits 0 and produces output file', () => {
  const out = path.join(tmpDir('tc-shape'), 'out.html');
  const r = run(SC_FIXTURE, '--shape', 'stadium', '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out), 'output file should exist');
});

// ── stray arguments ───────────────────────────────────────────────────────────

test('a second input path is an error, not silently ignored', () => {
  const out = path.join(tmpDir('tc-stray'), 'out.html');
  const r = run(SC_FIXTURE, 'extra.yaml', '-o', out);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unexpected argument 'extra\.yaml'/);
  assert.ok(!fs.existsSync(out));
});
