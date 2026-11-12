'use strict';

const assert = require('node:assert/strict');
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

module.exports = { puzzleDataOf, buildPuzzleFile };
