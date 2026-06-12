'use strict';

const fs = require('fs');
const path = require('path');
const { validate } = require('./validator');
const { preparePuzzle } = require('./hasher');
const { computeLayout } = require('./layout');
const injectTemplate = require('../../shared/build/injectTemplate');
const { composeThemeCss, getSharedBundle, commonPuzzleData } = require('../../shared/build/builderUtils');
const { runBuildPuzzle } = require('../../shared/build/runBuildPuzzle');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, ring, shape, theme, font) {
  const template = fs.readFileSync(path.join(TEMPLATE_DIR, 'index.html'), 'utf8');
  const css = composeThemeCss(TEMPLATE_DIR, theme, font);
  const engineJs = fs.readFileSync(path.join(TEMPLATE_DIR, 'engine.js'), 'utf8');
  const stadiumShapeJs = fs.readFileSync(path.join(TEMPLATE_DIR, 'shapes', 'stadium.js'), 'utf8');
  const turnShapeJs    = fs.readFileSync(path.join(TEMPLATE_DIR, 'shapes', 'turn.js'), 'utf8');
  const doubleTurnShapeJs = fs.readFileSync(path.join(TEMPLATE_DIR, 'shapes', 'double-turn.js'), 'utf8');
  const js = getSharedBundle() + '\n' + stadiumShapeJs + '\n' + turnShapeJs + '\n' + doubleTurnShapeJs + '\n' + engineJs;

  const puzzleData = {
    ...commonPuzzleData(prepared),
    loops: prepared.loops,
    shape,
    entries: prepared.entries,
    ring,
  };

  return injectTemplate(template, { title: prepared.title, css, js, puzzleData });
}

function findCoincidentStarts(entries, loops) {
  const ringSize = entries.reduce((s, e) => s + e.length, 0) / loops;
  const startCount = new Array(ringSize).fill(0);
  let concatPos = 0;
  for (const entry of entries) {
    startCount[concatPos % ringSize]++;
    concatPos += entry.length;
  }
  return startCount.map((c, i) => c > 1 ? i : -1).filter(i => i >= 0);
}

function buildPuzzle(inputPath, outputPath, options) {
  return runBuildPuzzle(inputPath, outputPath, options, {
    validateFn:  validate,
    prepareFn:   preparePuzzle,
    buildHtmlFn: (prepared, opts, ctx) => buildHtml(prepared, ctx.ring, ctx.shape, opts?.theme, opts?.font),
    preBuild(rawPuzzle, prepared, opts) {
      // Priority: explicit --shape flag > shape field in YAML > auto-select.
      // Auto-select tries double-turn first and falls back to stadium.
      // An explicit shape (from CLI or YAML) disables the fallback so geometry errors surface directly.
      const shapesToTry = opts?.shape !== undefined
        ? [opts.shape]
        : rawPuzzle.shape !== undefined
          ? [rawPuzzle.shape]
          : ['double-turn', 'stadium'];

      let ring, shape;
      for (let i = 0; i < shapesToTry.length; i++) {
        try {
          ({ ring } = computeLayout(prepared.entries, prepared.loops, shapesToTry[i]));
          shape = shapesToTry[i];
          if (i > 0) {
            process.stderr.write(`Note: double-turn shape not supported for this puzzle size; using stadium\n`);
          }
          break;
        } catch (err) {
          if (i === shapesToTry.length - 1) throw err;
        }
      }

      const conflicts = findCoincidentStarts(prepared.entries, prepared.loops);
      if (conflicts.length > 0) {
        process.stderr.write(
          `Warning: ${conflicts.length} ring cell(s) have entries from multiple loops starting on the same square: cells ${conflicts.join(', ')}\n`
        );
      }

      return { ring, shape };
    },
  });
}

module.exports = { buildHtml, buildPuzzle, findCoincidentStarts };
