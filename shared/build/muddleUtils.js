'use strict';

const normalize = require('../normalize');

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
      const norm = normalize(answer);
      return { ...rest, length: norm.length };
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
  return { ...walked, hashed: true, boardHash };
}

module.exports = { walkAnswers, buildMuddledYaml };
