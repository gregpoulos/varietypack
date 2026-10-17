'use strict';

const path = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./prepare');
const { commonPuzzleData, buildToolHtml } = require('../../shared/build/page');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, opts) {
  const puzzleData = {
    ...commonPuzzleData(prepared),
    grid:           prepared.grid,
    across:         prepared.across,
    down:           prepared.down,
    maxCellLetters: prepared.maxCellLetters,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    tool: 'crushword',
    puzzleData,
  }, opts);
}

const HOOKS = {
  validateFn:  validate,
  prepareFn:   preparePuzzle,
  buildHtmlFn: (prepared, rawPuzzle, opts) => buildHtml(prepared, opts),
};

module.exports = { HOOKS };
