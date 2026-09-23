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
    grid:           prepared.grid,
    across:         prepared.across,
    down:           prepared.down,
    maxCellLetters: prepared.maxCellLetters,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    theme,
    font,
    jsFiles: [
      path.join(__dirname, 'grid.js'),
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
