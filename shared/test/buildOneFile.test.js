'use strict';

/**
 * Behavioral tests for buildOneFile() (shared/cli/buildOneFile.js): the output-path and
 * overwrite checks every `varietypack build` file goes through, and where a build error
 * lands. Called in-process with the real build and
 * injected stdout/stderr. Flag parsing and help are `varietypack build`'s, covered in
 * test/cli.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');

const { buildOneFile } = require('../cli/buildOneFile');
const { loadKnownPuzzle } = require('../cli/cliTools');

const SC_FIXTURE = path.resolve(__dirname, '../../snake-charmer/test/fixtures/circle-36.yaml');

function build(values, input = SC_FIXTURE) {
  let out = '';
  let err = '';
  const status = buildOneFile({ input, loaded: loadKnownPuzzle(input), values }, {
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
  });
  return { status, stdout: out, stderr: err };
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

test('builds to -o and reports the title and path', () => {
  const out = path.join(tmpDir('rtb-ok'), 'out.html');
  const r = build({ output: out });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out));
  assert.match(r.stdout, /^Built ".+" → /);
});

test('without -o, writes the page beside the puzzle', () => {
  const dir = tmpDir('rtb-default');
  const input = path.join(dir, 'puzzle.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const r = build({}, input);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'puzzle.html')));
});

test('exits 1 with error when output file already exists', () => {
  const out = path.join(tmpDir('rtb-exist'), 'out.html');
  build({ output: out });
  const r = build({ output: out });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
  assert.match(r.stderr, /--force/);
});

test('force overwrites an existing output file', () => {
  const out = path.join(tmpDir('rtb-force'), 'out.html');
  build({ output: out });
  const r = build({ output: out, force: true });
  assert.equal(r.status, 0, r.stderr);
});

test('force never overwrites the input file itself', () => {
  const input = path.join(tmpDir('rtb-self'), 'puzzle.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const r = build({ output: input, force: true }, input);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /output path is the input file/);
  assert.equal(fs.readFileSync(input, 'utf8'), fs.readFileSync(SC_FIXTURE, 'utf8'));
});

test('a tool option (shape) reaches the build', () => {
  const out = path.join(tmpDir('rtb-shape'), 'out.html');
  const r = build({ output: out, shape: 'stadium' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out));
});

test('a build error goes to stderr and exits 1, leaving no output', () => {
  const dir = tmpDir('rtb-err');
  const input = path.join(dir, 'bad.yaml');
  fs.writeFileSync(input, 'kind: snake-charmer\ntitle: Bad\n');
  const out = path.join(dir, 'out.html');
  const r = build({ output: out }, input);
  assert.equal(r.status, 1);
  assert.notEqual(r.stderr, '');
  assert.ok(!fs.existsSync(out));
});
