'use strict';

const path = require('path');
const fs = require('fs');
const { loadPuzzle } = require('./puzzleFiles');

const TOOLS = {
  'snake-charmer': {
    dir: path.resolve(__dirname, '../../snake-charmer'),
    getValidator: () => require('../../snake-charmer/src/validator').validate,
    getPreparer:  () => require('../../snake-charmer/src/prepare').preparePuzzle,
    getCli:       () => require('../../snake-charmer/cli').CLI_CONFIG,
  },
  'spiral': {
    dir: path.resolve(__dirname, '../../spiral'),
    getValidator: () => require('../../spiral/src/validator').validate,
    getPreparer:  () => require('../../spiral/src/prepare').preparePuzzle,
    getCli:       () => require('../../spiral/cli').CLI_CONFIG,
  },
  'marching-bands': {
    dir: path.resolve(__dirname, '../../marching-bands'),
    getValidator: () => require('../../marching-bands/src/validator').validate,
    getPreparer:  () => require('../../marching-bands/src/prepare').preparePuzzle,
    getCli:       () => require('../../marching-bands/cli').CLI_CONFIG,
  },
  'crushword': {
    dir: path.resolve(__dirname, '../../crushword'),
    getValidator: () => require('../../crushword/src/validator').validate,
    getPreparer:  () => require('../../crushword/src/prepare').preparePuzzle,
    getCli:       () => require('../../crushword/cli').CLI_CONFIG,
  },
};

// Own-property check, not `TOOLS[kind]`: every plain object inherits
// `toString`, `constructor`, … from Object.prototype, so a truthiness lookup
// would accept `kind: toString` and crash further down.
function isKnownKind(kind) {
  return typeof kind === 'string' && Object.hasOwn(TOOLS, kind);
}

// Load a puzzle YAML and check its `kind` is a known tool. Returns { error } when
// loading or the kind check failed, otherwise { puzzle, kind }.
function loadKnownPuzzle(inputPath) {
  let puzzle;
  try {
    puzzle = loadPuzzle(inputPath);
  } catch (err) {
    return { error: err.message };
  }

  const { kind } = puzzle;
  if (!isKnownKind(kind)) {
    const error = typeof kind !== 'string'
      ? 'missing or invalid "kind" field'
      : `unknown kind "${kind}"`;
    return { error };
  }
  return { puzzle, kind };
}

// Shared by validateCommand: loadKnownPuzzle, then run that tool's validator. Owns the
// identical load/kind-check/validate step and its error messages.
//
// Returns { error } when loading or the kind check failed (no validator ran),
// otherwise { puzzle, kind, errors, warnings } from the tool's validator.
function loadAndValidate(inputPath) {
  const r = loadKnownPuzzle(inputPath);
  if (r.error) return r;
  const { errors, warnings } = TOOLS[r.kind].getValidator()(r.puzzle);
  return { ...r, errors, warnings };
}

// Shared by buildCommand and validateCommand: list the .yaml/.yml files
// directly inside a directory, sorted and resolved to full paths.
function listYamlFiles(dirPath) {
  return fs.readdirSync(dirPath)
    .filter(f => /\.ya?ml$/i.test(f))
    .sort()
    .map(f => path.join(dirPath, f));
}

module.exports = { TOOLS, isKnownKind, loadKnownPuzzle, loadAndValidate, listYamlFiles };
