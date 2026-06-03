'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const normalize = require('../normalize');

function loadPuzzle(yamlPath) {
  let raw;
  try {
    raw = fs.readFileSync(yamlPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file "${yamlPath}": ${err.message}`);
  }
  let puzzle;
  try {
    puzzle = yaml.load(raw);
  } catch (err) {
    throw new Error(`YAML parse error in "${yamlPath}": ${err.message}`);
  }
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    throw new Error(`"${yamlPath}" does not contain a valid YAML object`);
  }
  return puzzle;
}

function validatePuzzle(puzzle, sourcePath, validate) {
  const { errors, warnings } = validate(puzzle);
  if (warnings.length > 0) {
    const label = sourcePath ? `"${sourcePath}"` : 'puzzle';
    process.stderr.write(
      `Warnings for ${label}:\n` +
      warnings.map(w => `  • ${w}`).join('\n') + '\n'
    );
  }
  if (errors.length > 0) {
    const label = sourcePath ? `"${sourcePath}"` : 'puzzle';
    throw new Error(
      `Validation failed for ${label}:\n` +
      errors.map(e => `  • ${e}`).join('\n')
    );
  }
}

const SHARED_DIR = path.join(__dirname, '..');

// Assembles the full inlined stylesheet for a tool build, in cascade order:
//   shared base → shared header → tool base
//   → (broadsheet only: tokens → header → shared components)
//   → tool theme → shared print resets → tool print.
// The shared broadsheet layer (tokens/header/components) precedes the tool's
// own broadsheet.css so a tool can still override any shared component rule.
// Print rules come last so their @media print overrides are not defeated by
// equal-specificity theme rules.
function composeThemeCss(templateDir, theme) {
  const shared = (rel) => fs.readFileSync(path.join(SHARED_DIR, rel), 'utf8');
  const tool   = (rel) => fs.readFileSync(path.join(templateDir, rel), 'utf8');

  const broadsheetShared = theme === 'broadsheet'
    ? shared('themes/broadsheet-tokens.css') + '\n'
      + shared('themes/broadsheet-header.css') + '\n'
      + shared('themes/broadsheet-components.css') + '\n'
    : '';

  return shared('base.css') + '\n' + shared('base-header.css') + '\n'
    + tool('base.css') + '\n'
    + broadsheetShared
    + tool(`themes/${theme}.css`) + '\n'
    + shared('themes/print-base.css') + '\n'
    + tool('print.css');
}

function getSharedBundle() {
  const normalizeJs     = fs.readFileSync(path.join(SHARED_DIR, 'normalize.js'),      'utf8');
  const sha256hexJs     = fs.readFileSync(path.join(SHARED_DIR, 'sha256hex.js'),      'utf8');
  const isCellCorrectJs = fs.readFileSync(path.join(SHARED_DIR, 'isCellCorrect.js'),  'utf8');
  const engineChromeJs  = fs.readFileSync(path.join(SHARED_DIR, 'engine-chrome.js'),  'utf8');
  return normalizeJs + '\n' + sha256hexJs + '\n' + isCellCorrectJs + '\n' + engineChromeJs;
}

function defaultOutputPath(inputPath) {
  const dir  = path.dirname(inputPath);
  const base = path.basename(inputPath).replace(/\.ya?ml$/, '.html');
  return path.join(dir, base);
}

const KNOWN_STYLES = new Set(['circle']);

// Validates entry.styles in place, pushing to errors/warnings.
// entryLabel: e.g. "inward[0]" or "entries[3]" — used as error message prefix.
// normLength: normalized answer length (for position bounds checking).
function validateEntryStyles(entry, entryLabel, normLength, errors, warnings) {
  if (entry.styles === undefined) return;
  if (!entry.styles || typeof entry.styles !== 'object' || Array.isArray(entry.styles)) {
    errors.push(`${entryLabel}.styles must be an object`);
    return;
  }
  for (const [styleName, positions] of Object.entries(entry.styles)) {
    if (!KNOWN_STYLES.has(styleName)) {
      warnings.push(`${entryLabel}.styles: unrecognized style "${styleName}"`);
    }
    if (!Array.isArray(positions)) {
      errors.push(`${entryLabel}.styles["${styleName}"] must be an array`);
    } else {
      positions.forEach((pos, j) => {
        if (!Number.isInteger(pos) || pos < 0 || pos >= normLength) {
          errors.push(
            `${entryLabel}.styles["${styleName}"][${j}]: position ${pos} is out of range (answer has ${normLength} cells)`
          );
        }
      });
    }
  }
}

// Validates the header fields common to every puzzle kind: the object itself,
// `kind`, `title`, optional `hashed`, and optional `instructions`. Pushes
// user-readable messages to `errors`. Returns false when the puzzle is not a
// usable object (the caller should bail), true otherwise. Tool-specific fields
// (e.g. snake-charmer's `loops`/`shape`) are validated separately by each tool.
function validateCommonHeader(puzzle, kind, errors) {
  if (!puzzle || typeof puzzle !== 'object') {
    errors.push('Puzzle must be a YAML object');
    return false;
  }
  if (puzzle.kind !== kind) {
    errors.push(`"kind" must be "${kind}", got: ${JSON.stringify(puzzle.kind)}`);
  }
  if (!puzzle.title || typeof puzzle.title !== 'string' || !puzzle.title.trim()) {
    errors.push('"title" must be a non-empty string');
  }
  if (puzzle.hashed !== undefined && typeof puzzle.hashed !== 'boolean') {
    errors.push(`"hashed" must be a boolean, got: ${JSON.stringify(puzzle.hashed)}`);
  }
  if (puzzle.instructions !== undefined &&
      (typeof puzzle.instructions !== 'string' || !puzzle.instructions.trim())) {
    errors.push('"instructions" must be a non-empty string');
  }
  return true;
}

// Normalizes a list of YAML entries into the shape every hasher needs:
// { clue, length, _norm } plus styles passed through verbatim when present.
// `_norm` (the normalized answer) is retained for callers that need the letters
// (e.g. building a letters array or hashing); strip it before it reaches PUZZLE_DATA.
// styles is included on presence (`!== undefined`), never by truthiness.
function processEntries(entries) {
  return entries.map(entry => {
    const norm = normalize(entry.answer);
    const out = { clue: entry.clue, length: norm.length, _norm: norm };
    if (entry.styles !== undefined) out.styles = entry.styles;
    return out;
  });
}

module.exports = { loadPuzzle, validatePuzzle, composeThemeCss, getSharedBundle, defaultOutputPath, validateEntryStyles, processEntries, validateCommonHeader };
