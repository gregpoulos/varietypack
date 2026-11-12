'use strict';

const fs   = require('fs');
const path = require('path');
const { formatWarnings } = require('../build/validation');
const { buildFromObject } = require('../build/buildFromObject');
const { hooksFor } = require('../build/tools');
const { minifyHtml } = require('./minify');

/**
 * File wrapper around buildFromObject, shared by all puzzle tools.
 * buildFromObject → print warnings/notes → minify → mkdir → write.
 *
 * @param {object} puzzle      - The parsed source or muddled YAML
 * @param {string} inputPath   - The file `puzzle` came from, to name it in messages
 * @param {string} outputPath  - Absolute path for the output HTML file
 * @param {object} options     - CLI/caller options: { muddle?, minify?, theme?, font?, ... }
 * @param {object} hooks       - See buildFromObject.
 * @param {{stderr?: {write: Function}}} [io] - Where warnings and notes go (default:
 *   process.stderr)
 * @returns {{ title: string }}
 */
function writePuzzlePage(puzzle, inputPath, outputPath, options = {}, hooks, { stderr = process.stderr } = {}) {
  const label = `"${inputPath}"`;
  let result;
  try {
    result = buildFromObject(puzzle, options, hooks, { label });
  } catch (err) {
    if (err.warnings && err.warnings.length) stderr.write(formatWarnings(err.warnings, label));
    for (const n of err.notes || []) stderr.write(`${n}\n`);
    throw err;
  }
  if (result.warnings.length) stderr.write(formatWarnings(result.warnings, label));
  for (const n of result.notes) stderr.write(`${n}\n`);
  const output = options.minify ? minifyHtml(result.html) : result.html;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  return { title: result.title };
}

/**
 * writePuzzlePage for a puzzle already loaded by loadKnownPuzzle, with its tool's own
 * hooks. The one place a loaded puzzle meets its tool, for `varietypack build` (through
 * buildOneFile) and for the tests' buildPuzzleFile.
 *
 * @param {{puzzle: object, kind: string}} loaded - loadKnownPuzzle's result
 * @returns {{ title: string }}
 */
function buildKnownPuzzle({ puzzle, kind }, inputPath, outputPath, options, io) {
  return writePuzzlePage(puzzle, inputPath, outputPath, options, hooksFor(kind), io);
}

module.exports = { writePuzzlePage, buildKnownPuzzle };
