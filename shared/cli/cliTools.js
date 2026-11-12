'use strict';
// What the CLI commands need to know about tools beyond the build-path registry
// (shared/build/tools.js): where a tool lives on disk, its own flags, and loading a
// puzzle file whose kind is one of them.

const path = require('path');
const fs = require('fs');
const { loadPuzzle } = require('./puzzleFiles');
const { kindError, isKnownKind } = require('../build/tools');

const ROOT = path.resolve(__dirname, '../..');

// A tool's directory, whose src/ `watch` rebuilds on.
function toolDir(kind) {
  return path.join(ROOT, kind);
}

// kind → that tool's own util.parseArgs options, for the tools that have any.
const TOOL_OPTIONS = {
  'snake-charmer': require('../../snake-charmer/src/cliOptions').CLI_OPTIONS,
};

// A tool's own util.parseArgs options, beside the global ones; {} for a tool with none.
function extraOptionsFor(kind) {
  return Object.hasOwn(TOOL_OPTIONS, kind) ? TOOL_OPTIONS[kind] : {};
}

// Load a puzzle YAML and check its `kind` is a known tool. Returns { error } when
// loading or the kind check failed, otherwise { puzzle, kind }. The message never names
// the file: the caller does.
function loadKnownPuzzle(inputPath) {
  let puzzle;
  try {
    puzzle = loadPuzzle(inputPath);
  } catch (err) {
    return { error: err.message };
  }
  const error = kindError(puzzle);
  return error ? { error } : { puzzle, kind: puzzle.kind };
}

// A tool's validate function, read from its validator module alone: `validate` needs
// neither the builder nor the page code behind it. Every tool keeps its validator at
// <tool>/src/validator.
function validatorFor(kind) {
  if (!isKnownKind(kind)) throw new Error(`unknown kind "${kind}"`);
  return require(path.join(toolDir(kind), 'src', 'validator')).validate;
}

// Shared by validateCommand: loadKnownPuzzle, then run that tool's validator. Owns the
// identical load/kind-check/validate step and its error messages.
//
// Returns { error } when loading or the kind check failed (no validator ran),
// otherwise { puzzle, kind, errors, warnings } from the tool's validator.
function loadAndValidate(inputPath) {
  const r = loadKnownPuzzle(inputPath);
  if (r.error) return r;
  const { errors, warnings } = validatorFor(r.kind)(r.puzzle);
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

module.exports = { toolDir, extraOptionsFor, loadKnownPuzzle, loadAndValidate, listYamlFiles };
