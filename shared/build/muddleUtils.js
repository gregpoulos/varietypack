'use strict';

const { cellsOrThrow } = require('./builderUtils');

// Only YAML-mapping objects are walked. Non-plain objects (e.g. a Date from an
// unquoted YAML timestamp) have no own-enumerable keys, so recursing would flatten
// them to {} and silently corrupt the field — pass them through untouched.
function isPlainObject(obj) {
  if (obj === null || typeof obj !== 'object') return false;
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

function walkAnswers(obj) {
  if (Array.isArray(obj)) return obj.map(walkAnswers);
  if (isPlainObject(obj)) {
    if (Object.prototype.hasOwnProperty.call(obj, 'answer')) {
      const { answer, ...rest } = obj;
      // length: is a CELL count, not a letter count — see root CLAUDE.md ->
      // "Muddled YAML format" for why format: 2 accompanies it. Shares its
      // bracket-grammar parsing (and invalid-grammar throw) with
      // entryLength/processEntries via builderUtils' cellsOrThrow.
      const cells = cellsOrThrow(answer, 'walkAnswers');
      return { ...rest, length: cells.length };
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walkAnswers(v);
    }
    return out;
  }
  return obj;
}

function buildMuddledYaml(puzzle, boardHash) {
  const walked = walkAnswers(puzzle);
  return { ...walked, hashed: true, format: 2, boardHash };
}

module.exports = { walkAnswers, buildMuddledYaml };
