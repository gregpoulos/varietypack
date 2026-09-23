'use strict';

const fs   = require('fs');
const path = require('path');
const { loadPuzzle, validatePuzzle } = require('./builderUtils');
const { minifyHtml } = require('./minify');

/**
 * Shared buildPuzzle scaffolding for all puzzle tools.
 *
 * Handles: YAML load → validate → hashed computation → prepareFn →
 *          buildHtmlFn → minify → mkdir → write → return title.
 *
 * @param {string} inputPath   - Absolute path to source or muddled YAML
 * @param {string} outputPath  - Absolute path for the output HTML file
 * @param {object} options     - CLI/caller options: { muddle?, minify?, theme?, font?, ... }
 * @param {object} hooks
 * @param {Function} hooks.validateFn  - Tool's validate() — (puzzle) => { errors, warnings }
 * @param {Function} hooks.prepareFn   - Tool's preparePuzzle() — (rawPuzzle) => prepared
 * @param {Function} hooks.buildHtmlFn - (prepared, rawPuzzle, options) => HTML string.
 *                                       rawPuzzle is the pre-prepare YAML object, for a
 *                                       tool that needs a raw field unavailable on
 *                                       `prepared` (Snake Charmer's explicit `shape`).
 * @returns {{ title: string }}
 */
function runBuildPuzzle(inputPath, outputPath, options, { validateFn, prepareFn, buildHtmlFn }) {
  const rawPuzzle = loadPuzzle(inputPath);
  validatePuzzle(rawPuzzle, inputPath, validateFn);

  const hashed  = !!(options?.muddle || rawPuzzle.boardHash !== undefined);
  const prepared = prepareFn({ ...rawPuzzle, hashed });

  const html   = buildHtmlFn(prepared, rawPuzzle, options);
  const output = options?.minify ? minifyHtml(html) : html;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  return { title: prepared.title };
}

module.exports = { runBuildPuzzle };
