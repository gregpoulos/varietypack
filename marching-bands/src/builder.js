'use strict';

const path = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./hasher');
const { commonPuzzleData, buildToolHtml } = require('../../shared/build/builderUtils');
const { runBuildPuzzle } = require('../../shared/build/runBuildPuzzle');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, theme, font) {
  const puzzleData = {
    ...commonPuzzleData(prepared),
    size:  prepared.size,
    rows:  prepared.rows,
    bands: prepared.bands,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    theme,
    font,
    jsFiles: [
      // Grid geometry the engine shares with the validator and hasher.
      path.join(__dirname, 'layout.js'),
      path.join(TEMPLATE_DIR, 'engine.js'),
    ],
    puzzleData,
  });
}

function buildPuzzle(inputPath, outputPath, options) {
  return runBuildPuzzle(inputPath, outputPath, options, {
    validateFn:  validate,
    prepareFn:   preparePuzzle,
    buildHtmlFn: (prepared, rawPuzzle, opts) => buildHtml(prepared, opts?.theme, opts?.font),
  });
}

module.exports = { buildHtml, buildPuzzle };
