'use strict';

const path = require('path');
const { validate } = require('./validator');
const { preparePuzzle } = require('./prepare');
const { ringFor } = require('./layout');
const { commonPuzzleData, buildToolHtml } = require('../../shared/build/page');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, ring, shape, opts) {
  const puzzleData = {
    ...commonPuzzleData(prepared),
    loops: prepared.loops,
    shape,
    entries: prepared.entries,
    ring,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    tool: 'snake-charmer',
    puzzleData,
  }, opts);
}

const HOOKS = {
  validateFn:  validate,
  prepareFn:   preparePuzzle,
  buildHtmlFn(prepared, rawPuzzle, opts, notes) {
    // The --shape flag, else the YAML's shape:, else ringFor's automatic choice.
    const N = prepared.entries.reduce((s, e) => s + e.length, 0) / prepared.loops;
    const { shape, ring, fellBack } = ringFor(N, opts.shape ?? rawPuzzle.shape);
    if (fellBack) notes.push('Note: double-turn shape not supported for this puzzle size; using stadium');

    return buildHtml(prepared, ring, shape, opts);
  },
};

module.exports = { buildHtml, HOOKS };
