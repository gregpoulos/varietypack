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

const BROKEN_YAML = [
  'kind: snake-charmer',
  'title: Broken',
  'entries:',
  '  - clue: Short',
  '    answer: A',
].join('\n');

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-validate-test-'));
}

// --- help / no-args ---

test('validate: no args exits 1 and shows usage', () => {
  const r = run('validate');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Usage:/i);
});

test('validate: --help exits 0 and shows usage', () => {
  const r = run('validate', '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/i);
});

// --- single file ---

test('validate: valid puzzle exits 0 and prints OK', () => {
  const r = run('validate', SC_FIXTURE);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /circle-36\.yaml: OK/);
});

// covers the spiral tool path in addition to snake-charmer
test('validate: valid spiral puzzle exits 0 and prints OK', () => {
  const r = run('validate', SP_FIXTURE);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /test-100\.yaml: OK/);
});

test('validate: puzzle with errors exits 1 and prints error count', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'broken.yaml');
  // entries has only 1 item (min 3 required); validator will report multiple errors
  fs.writeFileSync(f, BROKEN_YAML);
  const r = run('validate', f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /broken\.yaml:.*error/i);
});

test('validate: malformed YAML exits 1', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'bad.yaml');
  fs.writeFileSync(f, 'title: [unterminated\n');
  const r = run('validate', f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /bad\.yaml:.*error/i);
});

test('validate: warnings-only puzzle exits 0 and prints warning', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'warn.yaml');
  // valid ring-8 snake-charmer (3 entries, 16 total cells, 2 loops of "aaaaaaaa")
  // with an unrecognized style key — produces a warning but no errors
  fs.writeFileSync(f, [
    'kind: snake-charmer',
    'title: Warning Test',
    'entries:',
    '  - clue: Eight letters',
    '    answer: AAAAAAAA',
    '  - clue: Four letters',
    '    answer: AAAA',
    '  - clue: More letters',
    '    answer: AAAA',
    '    styles:',
    '      highlight: [1]',
  ].join('\n'));
  const r = run('validate', f);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /warning/i);
});

test('validate: unknown kind exits 1', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'widget.yaml');
  fs.writeFileSync(f, 'kind: widget\ntitle: "Bad"\n');
  const r = run('validate', f);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /widget\.yaml:.*error/i);
  assert.match(r.stdout, /unknown kind/i);
});

// --- directory mode ---

test('validate: directory with all valid puzzles exits 0', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(dir, 'sp.yaml'));
  const r = run('validate', dir);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /sc\.yaml: OK/);
  assert.match(r.stdout, /sp\.yaml: OK/);
});

test('validate: directory with errors exits 1 but continues processing all files', () => {
  const dir = tmpDir();
  // a-valid sorts before b-broken alphabetically
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'a-valid.yaml'));
  fs.writeFileSync(path.join(dir, 'b-broken.yaml'), BROKEN_YAML);
  const r = run('validate', dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /a-valid\.yaml: OK/);
  assert.match(r.stdout, /b-broken\.yaml:.*error/i);
});

test('validate: directory with no YAML files exits 1', () => {
  const dir = tmpDir();
  const r = run('validate', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No YAML files/i);
});
