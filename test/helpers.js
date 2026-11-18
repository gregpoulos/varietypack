'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadKnownPuzzle } = require('../shared/cli/cliTools');
const { buildKnownPuzzle } = require('../shared/cli/writePuzzlePage');

// The PUZZLE_DATA a built page ships, parsed back out of its HTML. injectTemplate writes
// it as `window.PUZZLE_DATA = {…};`, alone in its script element and with every `</`
// escaped, so the first `};` before `</script>` is its end.
function puzzleDataOf(html) {
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  return JSON.parse(match[1]);
}

// Build a puzzle YAML file to an HTML file, as `varietypack build` does, and return
// { title }. Throws on a load error or a build error. `io` is writePuzzlePage's
// ({ stderr }), for a test that reads the warnings.
function buildPuzzleFile(inputPath, outputPath, options = {}, io) {
  const loaded = loadKnownPuzzle(inputPath);
  if (loaded.error) throw new Error(loaded.error);
  return buildKnownPuzzle(loaded, inputPath, outputPath, options, io);
}

// In-process invocation of the dispatcher's main(): { status, stdout, stderr }.
function runCli(...args) {
  const { main } = require('../cli');   // loaded here so the e2e helpers, which import this file, don't load the CLI
  let out = '';
  let err = '';
  const status = main(args, {
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
  });
  return { status, stdout: out, stderr: err };
}

// A fresh temp directory, removed when the process exits. A test that spawns a child
// that writes here must kill the child before the test returns, or the removal can race
// a write.
const madeDirs = [];
function tmpDir(prefix = 'vp-test-') {
  if (madeDirs.length === 0) {
    process.once('exit', () => {
      for (const d of madeDirs) fs.rmSync(d, { recursive: true, force: true });
    });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  madeDirs.push(dir);
  return dir;
}

module.exports = { puzzleDataOf, buildPuzzleFile, runCli, tmpDir };
