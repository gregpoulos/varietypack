'use strict';

const path = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./prepare');
const { commonPuzzleData, buildToolHtml } = require('../../shared/build/page');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, opts) {
  const puzzleData = {
    ...commonPuzzleData(prepared),
    size:  prepared.size,
    rows:  prepared.rows,
    bands: prepared.bands,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    tool: 'marching-bands',
    puzzleData,
  }, opts);
}

const HOOKS = {
  validateFn:  validate,
  prepareFn:   preparePuzzle,
  buildHtmlFn: (prepared, rawPuzzle, opts) => buildHtml(prepared, opts),
};

module.exports = { HOOKS };
