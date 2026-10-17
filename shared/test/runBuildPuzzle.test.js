'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const yaml     = require('js-yaml');
const { runBuildPuzzle } = require('../cli/runBuildPuzzle');

// runBuildPuzzle is the CLI's file wrapper around buildFromObject (load → build → print
// warnings/notes → minify → mkdir → write → return title). These tests exercise it with
// minimal stub hooks instead of through a real tool's builder, so the behavior is
// covered once rather than once per tool. buildFromObject.test.js covers the build.

const alwaysOk = () => ({ errors: [], warnings: [] });

// Stub prepareFn: passes the puzzle through, defaulting a title.
const stubPrepare = (rawPuzzle) => ({ ...rawPuzzle, title: rawPuzzle.title || 'Untitled' });

// Stub buildHtmlFn: doesn't need real markup, just something to write to disk.
const stubBuildHtml = (prepared) => `<html><!-- ${prepared.title} --></html>`;

const hooks = (over = {}) => ({ validateFn: alwaysOk, prepareFn: stubPrepare, buildHtmlFn: stubBuildHtml, ...over });

function writeTmpYaml(puzzle) {
  const p = path.join(os.tmpdir(), `runBuildPuzzle-test-${Date.now()}-${Math.random().toString(36).slice(2)}.yaml`);
  fs.writeFileSync(p, yaml.dump(puzzle), 'utf8');
  return p;
}

// Runs runBuildPuzzle with a stderr of its own and returns what reached it, plus the
// error when it throws. Injected rather than patched over process.stderr, so a message
// written to process.stderr instead goes missing here.
function buildCapturingStderr(inPath, outPath, puzzleHooks) {
  let out = '';
  const stderr = { write: chunk => { out += chunk; } };
  try {
    runBuildPuzzle(inPath, outPath, {}, puzzleHooks, { stderr });
  } catch (err) {
    return { out, err };
  }
  return { out };
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

test('runBuildPuzzle: prints warnings to the injected stderr before writing', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-warn-${Date.now()}.html`);
  try {
    const { out } = buildCapturingStderr(inPath, outPath, hooks({
      validateFn: () => ({ errors: [], warnings: ['w1'] }),
    }));
    assert.equal(out, `Warnings for "${inPath}":\n  • w1\n`);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: prints warnings to the injected stderr even when validation fails', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-warnfail-${Date.now()}.html`);
  try {
    const { out, err } = buildCapturingStderr(inPath, outPath, hooks({
      validateFn: () => ({ errors: ['bad'], warnings: ['w1'] }),
    }));
    assert.match(out, /Warnings for .*:\n {2}• w1\n/);
    assert.match(err.message, /Validation failed/);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: prints buildHtmlFn notes to the injected stderr', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-notes-${Date.now()}.html`);
  try {
    const { out } = buildCapturingStderr(inPath, outPath, hooks({
      buildHtmlFn: (prepared, raw, opts, notes) => { notes.push('Note: x'); return '<html></html>'; },
    }));
    assert.ok(out.endsWith('Note: x\n'), out);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});

test('runBuildPuzzle: prints the notes made before buildHtmlFn threw to the injected stderr', () => {
  const inPath = writeTmpYaml({ kind: 'stub', title: 'T' });
  const outPath = path.join(os.tmpdir(), `runBuildPuzzle-test-notesfail-${Date.now()}.html`);
  try {
    const { out, err } = buildCapturingStderr(inPath, outPath, hooks({
      buildHtmlFn: (prepared, raw, opts, notes) => { notes.push('Note: x'); throw new Error('boom'); },
    }));
    assert.equal(out, 'Note: x\n');
    assert.equal(err.message, 'boom');
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
});
