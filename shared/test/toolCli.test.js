'use strict';

/**
 * Behavioral tests for the shared runToolCli() helper (shared/build/toolCli.js).
 *
 * These call runToolCli() directly, in-process, with Snake Charmer's real
 * buildPuzzle (the same one snake-charmer/cli.js wires up) and injected
 * argv/stdout/stderr — exercising the full behavior (flag parsing, help text,
 * overwrite protection, actual file output) without spawning a subprocess.
 * Snake Charmer is used as the representative tool since it exercises both
 * the shared path and a tool-specific flag (--shape). Behaviors tested here
 * must not be duplicated in per-tool cli.test.js files — one home per
 * behavior.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');

const { runToolCli } = require('../build/toolCli');
const { buildPuzzle } = require('../../snake-charmer/src/builder');
const { GLOBAL_OPTIONS } = require('../build/globalHelp');

const SC_FIXTURE = path.resolve(__dirname, '../../snake-charmer/test/fixtures/circle-36.yaml');

const HELP = `Build a Snake Charmer puzzle HTML from a YAML definition.

Usage: snakecharmer <input.yaml> [options]

Options:
${GLOBAL_OPTIONS}

Examples:
  snakecharmer puzzle.yaml
  snakecharmer puzzle.yaml --shape stadium --theme skeleton -o out/puzzle.html
`;

// Mirrors the shape of snake-charmer/cli.js's own runToolCli() call (same
// helpText/usageLine/extraFlagSpecs/buildPuzzle wiring); the local HELP text
// above is a fixture for these tests, not a copy of the real help string, so
// don't read it as proof the real CLI's help text is covered here.
function run(...argv) {
  let out = '';
  let err = '';
  const status = runToolCli(
    {
      helpText:       HELP,
      usageLine:      'snakecharmer <input.yaml> [options]',
      extraFlagSpecs: [
        { flag: '--shape', name: 'shape', values: ['circle', 'stadium', 'turn', 'double-turn'] },
      ],
      buildPuzzle,
    },
    {
      argv,
      stdout: { write: (s) => { out += s; } },
      stderr: { write: (s) => { err += s; } },
    }
  );
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

// ── tool-specific flag (--shape) ─────────────────────────────────────────────

test('--shape stadium exits 0 and produces output file', () => {
  const out = path.join(tmpDir('tc-shape'), 'out.html');
  const r = run(SC_FIXTURE, '--shape', 'stadium', '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out), 'output file should exist');
});

// ── --minify ──────────────────────────────────────────────────────────────────

test('--minify exits 0 and produces a smaller file than without it', () => {
  const dir      = tmpDir('tc-minify');
  const normal   = path.join(dir, 'normal.html');
  const minified = path.join(dir, 'minified.html');
  const r1 = run(SC_FIXTURE, '-o', normal);
  assert.equal(r1.status, 0, r1.stderr);
  const r2 = run(SC_FIXTURE, '--minify', '-o', minified);
  assert.equal(r2.status, 0, r2.stderr);
  const normalSize   = fs.statSync(normal).size;
  const minifiedSize = fs.statSync(minified).size;
  assert.ok(minifiedSize < normalSize,
    `minified (${minifiedSize}) should be smaller than normal (${normalSize})`);
});
