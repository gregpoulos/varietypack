'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const { loadPuzzle, defaultOutputPath } = require('../cli/puzzleFiles');

// ── loadPuzzle ────────────────────────────────────────────────────────────────

test('loadPuzzle: parses a valid YAML file', () => {
  const tmp = path.join(os.tmpdir(), `builderutils-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmp, 'kind: test\ntitle: Hello\n');
  try {
    const result = loadPuzzle(tmp);
    assert.equal(result.kind, 'test');
    assert.equal(result.title, 'Hello');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// Nothing on the build path converts Dates: it relies on the YAML 1.2 parser never making
// one.
test('loadPuzzle: an unquoted date stays a string', () => {
  const tmp = path.join(os.tmpdir(), `builderutils-test-date-${Date.now()}.yaml`);
  fs.writeFileSync(tmp, 'kind: test\ntitle: Hello\ndate: 2026-05-01\n');
  try {
    assert.equal(loadPuzzle(tmp).date, '2026-05-01');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('loadPuzzle: throws on missing file', () => {
  assert.throws(() => loadPuzzle('/no/such/file.yaml'), /Cannot read file/);
});

test('loadPuzzle: throws on invalid YAML syntax', () => {
  const tmp = path.join(os.tmpdir(), `builderutils-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmp, 'key: {bad yaml\n');
  try {
    assert.throws(() => loadPuzzle(tmp), /YAML parse error/);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('loadPuzzle: throws when YAML content is not an object', () => {
  const tmp = path.join(os.tmpdir(), `builderutils-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmp, '- just a list\n- not an object\n');
  try {
    assert.throws(() => loadPuzzle(tmp), /does not contain a valid YAML object/);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// ── defaultOutputPath ─────────────────────────────────────────────────────────

test('defaultOutputPath: strips .yaml and appends .html', () => {
  assert.equal(defaultOutputPath('/some/dir/puzzle.yaml'), '/some/dir/puzzle.html');
});

test('defaultOutputPath: strips .yml and appends .html, with and without a directory', () => {
  assert.equal(defaultOutputPath('/some/dir/puzzle.yml'), '/some/dir/puzzle.html');
  assert.equal(defaultOutputPath('mypuzzle.yml'), 'mypuzzle.html');
});

test('defaultOutputPath: replaces an extension in any case, and is never the input itself', () => {
  assert.equal(defaultOutputPath('/some/dir/PUZZLE.YAML'), '/some/dir/PUZZLE.html');
  assert.equal(defaultOutputPath('/some/dir/puzzle.Yml'), '/some/dir/puzzle.html');
  assert.equal(defaultOutputPath('/some/dir/notes.txt'), '/some/dir/notes.txt.html');
});
