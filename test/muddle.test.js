'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path  = require('node:path');
const fs    = require('node:fs');
const os    = require('node:os');

const CLI        = path.resolve(__dirname, '..', 'cli.js');
const SC_FIXTURE = path.resolve(__dirname, '..', 'snake-charmer/test/fixtures/circle-8.yaml');
const SP_FIXTURE = path.resolve(__dirname, '..', 'spiral/test/fixtures/test-100.yaml');

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-muddle-cmd-test-'));
}

// ── help / no-args ─────────────────────────────────────────────────────────────

test('muddle: no args exits 1 and shows usage', () => {
  const r = run('muddle');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Usage:/i);
});

test('muddle: --help exits 0 and shows usage', () => {
  const r = run('muddle', '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/i);
});

// ── success path ──────────────────────────────────────────────────────────────

test('muddle: valid puzzle produces .muddled.yaml and exits 0', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const r = run('muddle', input);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'circle-8.muddled.yaml')));
});

test('muddle: -o redirects output to specified path', () => {
  const dir     = tmpDir();
  const input   = path.join(dir, 'circle-8.yaml');
  const outPath = path.join(dir, 'custom-output.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const r = run('muddle', input, '-o', outPath);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(outPath), 'custom output path not created');
  assert.ok(!fs.existsSync(path.join(dir, 'circle-8.muddled.yaml')), 'default output should not exist');
});

test('muddle: -f overwrites existing output', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  run('muddle', input);          // first run
  const r = run('muddle', input, '-f');  // force-overwrite
  assert.equal(r.status, 0, r.stderr);
});

test('muddle: --force also overwrites', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  run('muddle', input);
  const r = run('muddle', input, '--force');
  assert.equal(r.status, 0, r.stderr);
});

// ── spiral tool path ──────────────────────────────────────────────────────────

test('muddle: valid spiral puzzle exits 0', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'test-100.yaml');
  fs.copyFileSync(SP_FIXTURE, input);
  const r = run('muddle', input);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'test-100.muddled.yaml')));
});

// ── diagnostics streams ─────────────────────────────────────────────────────────

test('muddle: validator warnings go to stderr, not stdout', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  const first = path.join(dir, 'first.muddled.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  run('muddle', input, '-o', first);  // produce a muddled file
  // Re-muddling an already-muddled file emits the answer-validation-skipped warning.
  // Match on a phrase unique to the warning — "muddled" also appears in the stdout
  // filenames (first.muddled.yaml → second.muddled.yaml), so it can't discriminate.
  const r = run('muddle', first, '-o', path.join(dir, 'second.muddled.yaml'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /validation skipped/i, 'warning belongs on stderr');
  assert.ok(!/validation skipped/i.test(r.stdout), 'warning must not pollute stdout');
});

// ── error cases ───────────────────────────────────────────────────────────────

test('muddle: refuses to overwrite without -f and exits 1', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  run('muddle', input);          // first run
  const r = run('muddle', input);  // second run, no -f
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/i);
});

test('muddle: missing input file exits 1', () => {
  const r = run('muddle', '/no/such/file.yaml');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /error/i);
});

test('muddle: malformed YAML exits 1', () => {
  const dir = tmpDir();
  const f   = path.join(dir, 'bad.yaml');
  fs.writeFileSync(f, 'key: {unterminated\n');
  const r = run('muddle', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /error/i);
});

test('muddle: unknown kind exits 1', () => {
  const dir = tmpDir();
  const f   = path.join(dir, 'widget.yaml');
  fs.writeFileSync(f, 'kind: widget\ntitle: "Bad"\n');
  const r = run('muddle', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown kind/i);
});

test('muddle: invalid puzzle exits 1 with "Fix errors" message', () => {
  const dir = tmpDir();
  const f   = path.join(dir, 'broken.yaml');
  fs.writeFileSync(f, [
    'kind: snake-charmer',
    'title: Broken',
    'entries:',
    '  - clue: Short',
    '    answer: A',
  ].join('\n'));
  const r = run('muddle', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Fix errors/i);
});
