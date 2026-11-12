'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Reads and parses a puzzle YAML. The messages it throws never name the file, so each
// caller labels them its own way.
function loadPuzzle(yamlPath) {
  let raw;
  try {
    raw = fs.readFileSync(yamlPath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read file: ${err.message}`, { cause: err });
  }
  let puzzle;
  try {
    puzzle = yaml.load(raw);
  } catch (err) {
    throw new Error(`YAML parse error: ${err.message}`, { cause: err });
  }
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    throw new Error('file does not contain a YAML object');
  }
  return puzzle;
}

// The page a puzzle file builds to: its name with .yaml/.yml (any case) swapped for
// .html, or .html appended to any other name, so it is never the puzzle file itself.
function htmlName(inputPath) {
  return path.basename(inputPath).replace(/\.ya?ml$/i, '') + '.html';
}

function defaultOutputPath(inputPath) {
  return path.join(path.dirname(inputPath), htmlName(inputPath));
}

// False when either file is missing: a new output can't be the input.
function isSameFile(a, b) {
  try {
    const sa = fs.statSync(a), sb = fs.statSync(b);
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

module.exports = { loadPuzzle, htmlName, defaultOutputPath, isSameFile };
