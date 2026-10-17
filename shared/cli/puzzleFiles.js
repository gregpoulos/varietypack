'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function loadPuzzle(yamlPath) {
  let raw;
  try {
    raw = fs.readFileSync(yamlPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file "${yamlPath}": ${err.message}`, { cause: err });
  }
  let puzzle;
  try {
    puzzle = yaml.load(raw);
  } catch (err) {
    throw new Error(`YAML parse error in "${yamlPath}": ${err.message}`, { cause: err });
  }
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    throw new Error(`"${yamlPath}" does not contain a valid YAML object`);
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

module.exports = { loadPuzzle, htmlName, defaultOutputPath };
