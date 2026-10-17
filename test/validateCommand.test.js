'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { main } = require('../cli');

const SC_FIXTURE = path.resolve(__dirname, '..', 'snake-charmer/test/fixtures/circle-36.yaml');
const SP_FIXTURE = path.resolve(__dirname, '..', 'spiral/test/fixtures/test-100.yaml');

const BROKEN_YAML = [
  'kind: snake-charmer',
  'title: Broken',
  'entries:',
  '  - clue: Short',
  '    answer: A',
].join('\n');

// In-process invocation of the dispatcher's pure main(). validate never
// spawns a subprocess internally, so this fully replaces the previous
// spawnSync-based coverage.
function run(...args) {
  let out = '';
  let err = '';
  const status = main(args, {
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
  });
  return { status, stdout: out, stderr: err };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-validate-test-'));
}

// ── help ──────────────────────────────────────────────────────────────────────
// No-args / -h / --help semantics live once in shared/test/globalHelp.test.js;
// this only pins that validateCommand is wired to that helper.

test('validate: --help exits 0 and shows usage', () => {
  const r = run('validate', '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Check puzzle files for errors/);
});

// ── single file ───────────────────────────────────────────────────────────────

test('validate: valid puzzle exits 0 and prints OK', () => {
  const r = run('validate', SC_FIXTURE);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /circle-36\.yaml: OK/);
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
  assert.match(r.stdout, /Warnings for "warn\.yaml":\n {2}• entries\[2\]\.styles: unrecognized style "highlight"\n/);
  assert.match(r.stdout, /warn\.yaml: OK/);
});

// The same sections build prints, so a warning can't be mistaken for an error.
test('validate: errors and warnings are reported in separate, labeled sections', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'both.yaml');
  fs.writeFileSync(f, [
    'kind: snake-charmer',
    'title: Both',
    'theme: nope',
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
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Warnings for "both\.yaml":\n {2}• entries\[2\]\.styles: unrecognized style "highlight"\n/);
  assert.match(r.stdout, /Validation failed for "both\.yaml":\n {2}• "theme" must be one of/);
  assert.doesNotMatch(r.stdout, /OK/);
});

for (const kind of ['widget', 'toString']) {
  test(`validate: unknown kind "${kind}" exits 1`, () => {
    const dir = tmpDir();
    const f = path.join(dir, 'widget.yaml');
    fs.writeFileSync(f, `kind: ${kind}\ntitle: "Bad"\n`);
    const r = run('validate', f);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /Validation failed for "widget\.yaml":\n {2}• unknown kind/i);
  });
}

// ── directory mode ────────────────────────────────────────────────────────────

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
  assert.match(r.stdout, /Validation failed for "b-broken\.yaml":/);
});

test('validate: directory with no YAML files exits 1', () => {
  const dir = tmpDir();
  const r = run('validate', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No YAML files/i);
});

// ── stray arguments ───────────────────────────────────────────────────────────

for (const extra of ['extra.yaml', '--bogus']) {
  test(`validate: "${extra}" after the path is an error, not silently ignored`, () => {
    const r = run('validate', SC_FIXTURE, extra);
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(extra.replace('.', '\\.')));
  });
}
