'use strict';

const fs   = require('fs');
const path = require('path');
const { formatWarnings } = require('../build/validation');
const { buildFromObject } = require('../build/buildFromObject');
const { loadPuzzle } = require('./puzzleFiles');
const { minifyHtml } = require('./minify');

/**
 * File wrapper around buildFromObject, shared by all puzzle tools' CLIs.
 * load → buildFromObject → print warnings/notes → minify → mkdir → write.
 *
 * @param {string} inputPath   - Absolute path to source or muddled YAML
 * @param {string} outputPath  - Absolute path for the output HTML file
 * @param {object} options     - CLI/caller options: { muddle?, minify?, theme?, font?, ... }
 * @param {object} hooks       - See buildFromObject.
 * @param {{stderr?: {write: Function}}} [io] - Where warnings and notes go (default:
 *   process.stderr)
 * @returns {{ title: string }}
 */
function runBuildPuzzle(inputPath, outputPath, options = {}, hooks, { stderr = process.stderr } = {}) {
  const rawPuzzle = loadPuzzle(inputPath);
  const label = `"${inputPath}"`;
  let result;
  try {
    result = buildFromObject(rawPuzzle, options, hooks, { label });
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

module.exports = { runBuildPuzzle };
