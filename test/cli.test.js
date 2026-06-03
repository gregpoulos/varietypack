'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const CLI = path.resolve(__dirname, '..', 'cli.js');
const SC_FIXTURE = path.resolve(__dirname, '..', 'snake-charmer/test/fixtures/circle-36.yaml');
const SP_FIXTURE = path.resolve(__dirname, '..', 'spiral/test/fixtures/test-100.yaml');

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-cli-test-'));
}

// --- help / no-args ---

test('--help writes usage to stdout and exits 0', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.equal(r.stderr, '');
});

test('-h writes usage to stdout and exits 0', () => {
  const r = run('-h');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.equal(r.stderr, '');
});

test('no args writes usage to stdout and exits 1', () => {
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Usage:/);
});

test('unknown subcommand exits 1 with error', () => {
  const r = run('bogus-subcommand');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown subcommand/i);
});

// --- build: single-file auto-detection ---

test('build: auto-detects snake-charmer from kind field and builds', () => {
  const out = path.join(tmpDir(), 'out.html');
  const r = run('build', SC_FIXTURE, '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out));
});

test('build: auto-detects spiral from kind field and builds', () => {
  const out = path.join(tmpDir(), 'out.html');
  const r = run('build', SP_FIXTURE, '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out));
});

test('build: yaml file not found exits 1', () => {
  const r = run('build', 'nonexistent.yaml');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not found/i);
});

test('build: yaml with no kind field exits 1', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'nokind.yaml');
  fs.writeFileSync(f, 'title: "No Kind"\n');
  const r = run('build', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /kind/i);
});

test('build: yaml with unknown kind exits 1', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'badkind.yaml');
  fs.writeFileSync(f, 'kind: widget\ntitle: "Bad"\n');
  const r = run('build', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown kind/i);
});

// --- build: directory mode ---

test('build: directory mode builds all YAMLs in place', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(dir, 'sp.yaml'));
  const r = run('build', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'sc.html')));
  assert.ok(fs.existsSync(path.join(dir, 'sp.html')));
});

test('build: directory mode with -o writes HTML files to output directory', () => {
  const inDir = tmpDir();
  const outDir = path.join(tmpDir(), 'output');
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(inDir, 'sp.yaml'));
  const r = run('build', inDir, '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(outDir, 'sc.html')));
  assert.ok(fs.existsSync(path.join(outDir, 'sp.html')));
  assert.ok(!fs.existsSync(path.join(inDir, 'sc.html')));
});

test('build: directory mode creates output directory if it does not exist', () => {
  const inDir = tmpDir();
  const outDir = path.join(tmpDir(), 'new', 'nested');
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  const r = run('build', inDir, '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(outDir, 'sc.html')));
});

test('build: directory mode with no YAML files exits 1', () => {
  const dir = tmpDir();
  const r = run('build', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No YAML files/i);
});

test('build: directory mode skips files with unknown kind and exits 1', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'bad.yaml'), 'kind: widget\ntitle: "Bad"\n');
  const r = run('build', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Skipping/);
});

test('build: directory mode skips malformed YAML and still builds the valid files', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'bad.yaml'), 'title: [unterminated\n');
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'good.yaml'));
  const r = run('build', dir);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /could not parse/i);
  assert.ok(fs.existsSync(path.join(dir, 'good.html')), 'valid puzzle should still build');
});

test('build: single malformed YAML file exits 1 with a parse error', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'bad.yaml');
  fs.writeFileSync(f, 'title: [unterminated\n');
  const r = run('build', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not parse/i);
});

test('build: directory mode dangling -o exits 1 with error', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  const r = run('build', dir, '-o');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /-o requires a value/);
});

// ── overwrite protection ──────────────────────────────────────────────────────

test('build: exits 1 with error when output file already exists (single file)', () => {
  const out = path.join(tmpDir(), 'out.html');
  run('build', SC_FIXTURE, '-o', out);
  const r = run('build', SC_FIXTURE, '-o', out);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
});

test('build: --force allows overwriting an existing output file', () => {
  const out = path.join(tmpDir(), 'out.html');
  run('build', SC_FIXTURE, '-o', out);
  const r = run('build', SC_FIXTURE, '--force', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

test('build: directory mode exits 1 when output files already exist', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  run('build', inDir, '-o', outDir);
  const r = run('build', inDir, '-o', outDir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
});

test('build: directory mode --force overwrites existing output files', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  run('build', inDir, '-o', outDir);
  const r = run('build', inDir, '--force', '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
});

test('build: directory mode in-place: exits 1 when output already exists next to input', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  run('build', dir);
  const r = run('build', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/);
});

test('build: directory mode in-place: --force overwrites output next to input', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  run('build', dir);
  const r = run('build', dir, '--force');
  assert.equal(r.status, 0, r.stderr);
});

// ── --build-index flag ────────────────────────────────────────────────────────

test('build: --build-index creates index.html in output directory', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(inDir, 'sp.yaml'));
  const r = run('build', inDir, '--build-index', '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(outDir, 'index.html')));
});

test('build: without --build-index does not create index.html', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  const r = run('build', inDir, '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(outDir, 'index.html')));
});

test('build: --build-index writes index.html in place when no -o', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  const r = run('build', dir, '--build-index');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'index.html')));
});

test('build: --build-index links built puzzles', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(inDir, 'sp.yaml'));
  const r = run('build', inDir, '--build-index', '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.match(index, /sc\.html/);
  assert.match(index, /sp\.html/);
});

test('build: --build-index preserves a populated index when a re-run builds nothing', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  run('build', dir, '--build-index'); // first run: writes sc.html + index.html
  // second run without --force: every per-file build fails the overwrite check,
  // so nothing is rebuilt. The good index must not be clobbered with a placeholder.
  const r = run('build', dir, '--build-index');
  assert.equal(r.status, 1);
  const index = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(index, /sc\.html/, 'index should still link the built puzzle');
  assert.doesNotMatch(index, /No puzzles built yet/);
});

// ── flag forwarding ───────────────────────────────────────────────────────────

test('build: directory mode forwards flags to each tool', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  const r = run('build', inDir, '--theme', 'skeleton', '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(outDir, 'sc.html')));
  const bad = run('build', inDir, '--theme', 'nonexistent', '-o', tmpDir());
  assert.equal(bad.status, 1);
});
