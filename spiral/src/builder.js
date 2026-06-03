'use strict';

const fs      = require('fs');
const path    = require('path');
const { validate }      = require('./validator');
const { preparePuzzle } = require('./hasher');
const { computeCells }  = require('./layout');
const injectTemplate    = require('../../shared/build/injectTemplate');
const { loadPuzzle, validatePuzzle: sharedValidatePuzzle, composeThemeCss, getSharedBundle } = require('../../shared/build/builderUtils');
const { minifyHtml }    = require('../../shared/build/minify');

const TEMPLATE_DIR = path.join(__dirname, 'template');

const VALID_THEMES = ['broadsheet', 'skeleton'];
// R_HOLE: smaller center hole leaves more room for cells; R_MAX: larger outer radius keeps
// cells from crowding at high cell counts (122-cell puzzles were visibly tight at R_MAX:242).
const LAYOUT_BASE = { R_HOLE: 25, R_MAX: 265 };

function nTurnsFor(totalCells) {
  // Math.round, not ceil — ceil(122/20)=7 gives visibly cramped cells; round gives 6.
  return Math.max(3, Math.round(totalCells / 20));
}

function validatePuzzle(puzzle, sourcePath) {
  return sharedValidatePuzzle(puzzle, sourcePath, validate);
}

function buildHtml(prepared, cells, layoutOpts, theme) {
  theme = theme ?? 'broadsheet';
  if (!VALID_THEMES.includes(theme)) throw new Error(`Unknown theme "${theme}". Must be one of: ${VALID_THEMES.join(', ')}.`);
  const template = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf8');
  const css = composeThemeCss(TEMPLATE_DIR, theme);
  const engineJs  = fs.readFileSync(path.join(TEMPLATE_DIR, 'engine.js'),  'utf8');

  const puzzleData = {
    title:   prepared.title,
    author:  prepared.author,
    date:    prepared.date,
    hashed:  prepared.hashed,
    inward:  prepared.inward,
    outward: prepared.outward,
    cells,
    geometry: layoutOpts,
    ...(prepared.letters      !== undefined ? { letters:      prepared.letters      } : {}),
    ...(prepared.boardHash    !== undefined ? { boardHash:    prepared.boardHash    } : {}),
    ...(prepared.instructions !== undefined ? { instructions: prepared.instructions } : {}),
  };

  const js = getSharedBundle() + '\n' + engineJs;

  return injectTemplate(template, { title: prepared.title, css, js, puzzleData });
}

function buildPuzzle(inputPath, outputPath, options) {
  const rawPuzzle = loadPuzzle(inputPath);
  validatePuzzle(rawPuzzle, inputPath);
  const prepared  = preparePuzzle(rawPuzzle);

  const totalCells = prepared.inward.reduce((s, e) => s + e.length, 0);
  const layoutOpts = { ...LAYOUT_BASE, N_TURNS: nTurnsFor(totalCells) };
  const cells      = computeCells(totalCells, layoutOpts);

  const html = buildHtml(prepared, cells, layoutOpts, options?.theme);
  const output = options?.minify ? minifyHtml(html) : html;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
  return { title: prepared.title };
}

module.exports = { buildHtml, buildPuzzle };
