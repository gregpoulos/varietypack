'use strict';

const path = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./prepare');
const { computeCells, geometryFor } = require('./layout.mjs');
const { commonPuzzleData, buildToolHtml } = require('../../shared/build/page');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, cells, layoutOpts, opts) {
  const puzzleData = {
    ...commonPuzzleData(prepared),
    inward:  prepared.inward,
    outward: prepared.outward,
    cells,
    geometry: layoutOpts,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    tool: 'spiral',
    puzzleData,
  }, opts);
}

const HOOKS = {
  validateFn:  validate,
  prepareFn:   preparePuzzle,
  buildHtmlFn: (prepared, rawPuzzle, opts) => {
    const totalCells = prepared.inward.reduce((s, e) => s + e.length, 0);
    const layoutOpts = geometryFor(totalCells);
    const cells      = computeCells(totalCells, layoutOpts);
    return buildHtml(prepared, cells, layoutOpts, opts);
  },
};

module.exports = { HOOKS };
