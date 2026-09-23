'use strict';

const path = require('path');
const { validate } = require('./validator');
const { preparePuzzle } = require('./hasher');
const { computeLayout } = require('./layout');
const { commonPuzzleData, buildToolHtml } = require('../../shared/build/builderUtils');
const { runBuildPuzzle } = require('../../shared/build/runBuildPuzzle');

const TEMPLATE_DIR = path.join(__dirname, 'template');

function buildHtml(prepared, ring, shape, theme, font) {
  const puzzleData = {
    ...commonPuzzleData(prepared),
    loops: prepared.loops,
    shape,
    entries: prepared.entries,
    ring,
  };

  return buildToolHtml(TEMPLATE_DIR, {
    title: prepared.title,
    theme,
    font,
    jsFiles: [
      // ring.js is the shared core the shape renderers build on, so it goes first.
      path.join(TEMPLATE_DIR, 'shapes', 'ring.js'),
      path.join(TEMPLATE_DIR, 'shapes', 'stadium.js'),
      path.join(TEMPLATE_DIR, 'shapes', 'turn.js'),
      path.join(TEMPLATE_DIR, 'shapes', 'double-turn.js'),
      path.join(TEMPLATE_DIR, 'engine.js'),
    ],
    puzzleData,
  });
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
    buildHtmlFn(prepared, rawPuzzle, opts) {
      // Priority: explicit --shape flag > shape field in YAML > auto-select.
      // Auto-select tries double-turn first and falls back to stadium.
      // An explicit shape (from CLI or YAML) disables the fallback so geometry errors surface directly.
      const explicitShape = opts?.shape ?? rawPuzzle.shape;

      let ring, shape;
      if (explicitShape !== undefined) {
        ({ ring } = computeLayout(prepared.entries, prepared.loops, explicitShape));
        shape = explicitShape;
      } else {
        try {
          ({ ring } = computeLayout(prepared.entries, prepared.loops, 'double-turn'));
          shape = 'double-turn';
        } catch {
          ({ ring } = computeLayout(prepared.entries, prepared.loops, 'stadium'));
          shape = 'stadium';
          process.stderr.write(`Note: double-turn shape not supported for this puzzle size; using stadium\n`);
        }
      }

      const conflicts = findCoincidentStarts(prepared.entries, prepared.loops);
      if (conflicts.length > 0) {
        process.stderr.write(
          `Warning: ${conflicts.length} ring cell(s) have entries from multiple loops starting on the same square: cells ${conflicts.join(', ')}\n`
        );
      }

      return buildHtml(prepared, ring, shape, opts?.theme, opts?.font);
    },
  });
}

module.exports = { buildHtml, buildPuzzle, findCoincidentStarts };
