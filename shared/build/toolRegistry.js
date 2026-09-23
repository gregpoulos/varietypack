'use strict';

const path = require('path');
const fs = require('fs');
const { loadPuzzle } = require('./builderUtils');

const TOOLS = {
  'snake-charmer': {
    dir: path.resolve(__dirname, '../../snake-charmer'),
    getValidator: () => require('../../snake-charmer/src/validator').validate,
    getHasher:    () => require('../../snake-charmer/src/hasher').preparePuzzle,
  },
  'spiral': {
    dir: path.resolve(__dirname, '../../spiral'),
    getValidator: () => require('../../spiral/src/validator').validate,
    getHasher:    () => require('../../spiral/src/hasher').preparePuzzle,
  },
  'marching-bands': {
    dir: path.resolve(__dirname, '../../marching-bands'),
    getValidator: () => require('../../marching-bands/src/validator').validate,
    getHasher:    () => require('../../marching-bands/src/hasher').preparePuzzle,
  },
  'crushword': {
    dir: path.resolve(__dirname, '../../crushword'),
    getValidator: () => require('../../crushword/src/validator').validate,
    getHasher:    () => require('../../crushword/src/hasher').preparePuzzle,
  },
};

// Shared by validateCommand and muddleCommand: load a puzzle YAML, check its
// `kind` is a known tool, and run that tool's validator. Both commands need
// exactly this sequence before diverging (validate prints per-file results
// and continues; muddle stops at the first error) — this owns the identical
// load/kind-check/validate step and its identical error messages so neither
// command hand-rolls it.
//
// Returns { error } when loading or the kind check failed (no validator ran),
// otherwise { puzzle, kind, errors, warnings } from the tool's validator.
function loadAndValidate(inputPath) {
  let puzzle;
  try {
    puzzle = loadPuzzle(inputPath);
  } catch (err) {
    return { error: err.message };
  }

  const { kind } = puzzle;
  if (typeof kind !== 'string' || !TOOLS[kind]) {
    const error = typeof kind !== 'string'
      ? 'missing or invalid "kind" field'
      : `unknown kind "${kind}"`;
    return { error };
  }

  const validate = TOOLS[kind].getValidator();
  const { errors, warnings } = validate(puzzle);
  return { puzzle, kind, errors, warnings };
}

// Shared by buildCommand and validateCommand: list the .yaml/.yml files
// directly inside a directory, sorted and resolved to full paths.
function listYamlFiles(dirPath) {
  return fs.readdirSync(dirPath)
    .filter(f => /\.ya?ml$/i.test(f))
    .sort()
    .map(f => path.join(dirPath, f));
}

module.exports = { TOOLS, loadAndValidate, listYamlFiles };
