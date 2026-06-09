'use strict';

const fs   = require('fs');
const path = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./hasher');
const injectTemplate    = require('../../shared/build/injectTemplate');
const { loadPuzzle, validatePuzzle: sharedValidatePuzzle, composeThemeCss, getSharedBundle } = require('../../shared/build/builderUtils');
const { minifyHtml }    = require('../../shared/build/minify');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function validatePuzzle(puzzle, sourcePath) {
  return sharedValidatePuzzle(puzzle, sourcePath, validate);
}

function buildHtml(prepared, theme, font) {
  const template  = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf8');
  const engineJs  = fs.readFileSync(path.join(TEMPLATE_DIR, 'engine.js'), 'utf8');

  const css = composeThemeCss(TEMPLATE_DIR, theme, font);
  const js  = getSharedBundle() + '\n' + engineJs;

  const puzzleData = {
    title:  prepared.title,
    kind:   prepared.kind,
    hashed: prepared.hashed,
    size:   prepared.size,
    rows:   prepared.rows,
    bands:  prepared.bands,
    ...(prepared.author       !== undefined ? { author:       prepared.author       } : {}),
    ...(prepared.date         !== undefined ? { date:         prepared.date         } : {}),
    ...(prepared.instructions !== undefined ? { instructions: prepared.instructions } : {}),
    ...(prepared.letters      !== undefined ? { letters:      prepared.letters      } : {}),
    ...(prepared.boardHash    !== undefined ? { boardHash:    prepared.boardHash    } : {}),
  };

  return injectTemplate(template, { title: prepared.title, css, js, puzzleData });
}

function buildPuzzle(inputPath, outputPath, options) {
  const rawPuzzle = loadPuzzle(inputPath);
  validatePuzzle(rawPuzzle, inputPath);
  const hashed  = !!(options?.muddle || rawPuzzle.boardHash !== undefined);
  const prepared = preparePuzzle({ ...rawPuzzle, hashed });
  const html = buildHtml(prepared, options?.theme, options?.font);
  const output = options?.minify ? minifyHtml(html) : html;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  return { title: prepared.title };
}

module.exports = { buildHtml, buildPuzzle };
