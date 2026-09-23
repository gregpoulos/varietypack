'use strict';

const path    = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./hasher');
const { computeCells }  = require('./layout');
const { commonPuzzleData, buildToolHtml } = require('../../shared/build/builderUtils');
const { runBuildPuzzle } = require('../../shared/build/runBuildPuzzle');

const TEMPLATE_DIR = path.join(__dirname, 'template');
// R_HOLE: smaller center hole leaves more room for cells; R_MAX: larger outer radius keeps
// cells from crowding at high cell counts (122-cell puzzles were visibly tight at R_MAX:242).
const LAYOUT_BASE = { R_HOLE: 25, R_MAX: 265 };

function nTurnsFor(totalCells) {
  // Math.round, not ceil — ceil(122/20)=7 gives visibly cramped cells; round gives 6.
  return Math.max(3, Math.round(totalCells / 20));
}

function buildHtml(prepared, cells, layoutOpts, theme, font) {
  const puzzleData = {
    ...commonPuzzleData(prepared),
    inward:  prepared.inward,
    outward: prepared.outward,
    cells,
    geometry: layoutOpts,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    theme,
    font,
    jsFiles: [path.join(TEMPLATE_DIR, 'engine.js')],
    puzzleData,
  });
}

function buildPuzzle(inputPath, outputPath, options) {
  return runBuildPuzzle(inputPath, outputPath, options, {
    validateFn:  validate,
    prepareFn:   preparePuzzle,
    buildHtmlFn: (prepared, rawPuzzle, opts) => {
      const totalCells = prepared.inward.reduce((s, e) => s + e.length, 0);
      const layoutOpts = { ...LAYOUT_BASE, N_TURNS: nTurnsFor(totalCells) };
      const cells      = computeCells(totalCells, layoutOpts);
      return buildHtml(prepared, cells, layoutOpts, opts?.theme, opts?.font);
    },
  });
}

module.exports = { buildHtml, buildPuzzle };
