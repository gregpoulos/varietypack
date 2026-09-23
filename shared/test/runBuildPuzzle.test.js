'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const yaml     = require('js-yaml');
const { runBuildPuzzle } = require('../build/runBuildPuzzle');

// runBuildPuzzle is tool-agnostic scaffolding (load → validate → hashed
// computation → prepareFn → buildHtmlFn → minify → mkdir → write → return
// title). These tests exercise it directly with minimal stub hooks instead
// of through a real tool's builder, so the behavior is covered once rather
// than once per tool — see root CLAUDE.md's builder `hashed` pattern note.

const alwaysOk = () => ({ errors: [], warnings: [] });

// Stub prepareFn: passes the puzzle through, defaulting a title.
const stubPrepare = (rawPuzzle) => ({ ...rawPuzzle, title: rawPuzzle.title || 'Untitled' });

// Stub buildHtmlFn: doesn't need real markup, just something to write to disk.
const stubBuildHtml = (prepared) => `<html><!-- ${prepared.title} --></html>`;

function writeTmpYaml(puzzle) {
  const p = path.join(os.tmpdir(), `runBuildPuzzle-test-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
  fs.writeFileSync(p, yaml.dump(puzzle), 'utf8');
  return p;
}

test('runBuildPuzzle: returns { title } from the prepared puzzle', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'Consolidated Title' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-out-${Date.now()}.html`);
  try {
    const result = runBuildPuzzle(inPath, outPath, {}, {
      validateFn: alwaysOk,
      prepareFn: stubPrepare,
      buildHtmlFn: stubBuildHtml,
    });
    assert.deepEqual(result, { title: 'Consolidated Title' });
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: creates the output directory if it does not exist', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const dir = path.join(os.tmpdir(), `runBuildPuzzle-newdir-${Date.now()}`);
  const outPath = path.join(dir, 'out.html');
  try {
    runBuildPuzzle(inPath, outPath, {}, {
      validateFn: alwaysOk,
      prepareFn: stubPrepare,
      buildHtmlFn: stubBuildHtml,
    });
    assert.ok(fs.existsSync(outPath), 'output file was not created');
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runBuildPuzzle: writes the buildHtmlFn output verbatim (or minified when options.minify)', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-write-${Date.now()}.html`);
  try {
    runBuildPuzzle(inPath, outPath, {}, {
      validateFn: alwaysOk,
      prepareFn: stubPrepare,
      buildHtmlFn: stubBuildHtml,
    });
    assert.equal(fs.readFileSync(outPath, 'utf8'), '<html><!-- T --></html>');
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: computes hashed=true from options.muddle and passes it to prepareFn', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-muddle-${Date.now()}.html`);
  let seenHashed;
  try {
    runBuildPuzzle(inPath, outPath, { muddle: true }, {
      validateFn: alwaysOk,
      prepareFn: (rawPuzzle) => { seenHashed = rawPuzzle.hashed; return stubPrepare(rawPuzzle); },
      buildHtmlFn: stubBuildHtml,
    });
    assert.equal(seenHashed, true);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: computes hashed=true when the source YAML already carries boardHash (muddled input)', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T', boardHash: 'deadbeef' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-premuddled-${Date.now()}.html`);
  let seenHashed;
  try {
    runBuildPuzzle(inPath, outPath, {}, {
      validateFn: alwaysOk,
      prepareFn: (rawPuzzle) => { seenHashed = rawPuzzle.hashed; return stubPrepare(rawPuzzle); },
      buildHtmlFn: stubBuildHtml,
    });
    assert.equal(seenHashed, true);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: throws and writes nothing when validateFn reports errors', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-invalid-${Date.now()}.html`);
  try {
    assert.throws(
      () => runBuildPuzzle(inPath, outPath, {}, {
        validateFn: () => ({ errors: ['bad puzzle'], warnings: [] }),
        prepareFn: stubPrepare,
        buildHtmlFn: stubBuildHtml,
      }),
      /Validation failed/,
    );
    assert.ok(!fs.existsSync(outPath), 'output should not be written on validation failure');
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: passes the pre-prepare rawPuzzle through to buildHtmlFn as the second argument', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T', shape: 'stadium' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-rawpuzzle-${Date.now()}.html`);
  try {
    runBuildPuzzle(inPath, outPath, {}, {
      validateFn: alwaysOk,
      prepareFn: stubPrepare,
      buildHtmlFn: (prepared, rawPuzzle) => `<html>${rawPuzzle.shape}</html>`,
    });
    assert.equal(fs.readFileSync(outPath, 'utf8'), '<html>stadium</html>');
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});
