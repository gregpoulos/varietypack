'use strict';

const fs   = require('fs');
const path = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./hasher');
const injectTemplate    = require('../../shared/build/injectTemplate');
const { composeThemeCss, getSharedBundle, commonPuzzleData } = require('../../shared/build/builderUtils');
const { runBuildPuzzle } = require('../../shared/build/runBuildPuzzle');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, theme, font) {
  const template  = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf8');
  const engineJs  = fs.readFileSync(path.join(TEMPLATE_DIR, 'engine.js'), 'utf8');

  const css = composeThemeCss(TEMPLATE_DIR, theme, font);
  const js  = getSharedBundle() + '\n' + engineJs;

  const puzzleData = {
    ...commonPuzzleData(prepared),
    size:  prepared.size,
    rows:  prepared.rows,
    bands: prepared.bands,
  };

  return injectTemplate(template, { title: prepared.title, css, js, puzzleData });
}

function buildPuzzle(inputPath, outputPath, options) {
  return runBuildPuzzle(inputPath, outputPath, options, {
    validateFn:  validate,
    prepareFn:   preparePuzzle,
    buildHtmlFn: (prepared, opts) => buildHtml(prepared, opts?.theme, opts?.font),
  });
}

module.exports = { buildHtml, buildPuzzle };
