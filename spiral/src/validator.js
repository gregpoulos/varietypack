'use strict';

const normalize = require('../../shared/normalize');
const { validateEntryStyles, validateCommonHeader } = require('../../shared/build/builderUtils');

function validate(puzzle) {
  const errors = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'spiral', errors)) return { errors, warnings };

  const inwardIsArray = Array.isArray(puzzle.inward);
  const outwardIsArray = Array.isArray(puzzle.outward);

  if (!inwardIsArray) errors.push('"inward" must be an array');
  if (!outwardIsArray) errors.push('"outward" must be an array');
  if (!inwardIsArray || !outwardIsArray) return { errors, warnings };

  if (puzzle.inward.length < 2) errors.push('"inward" must have at least 2 entries');
  if (puzzle.outward.length < 2) errors.push('"outward" must have at least 2 entries');

  function validateEntries(entries, label) {
    return entries.map((entry, i) => {
      if (!entry || typeof entry !== 'object') {
        errors.push(`${label}[${i}] must be an object`);
        return null;
      }
      if (!entry.clue || typeof entry.clue !== 'string' || !entry.clue.trim()) {
        errors.push(`${label}[${i}].clue must be a non-empty string`);
      }
      if (!entry.answer || typeof entry.answer !== 'string' || !entry.answer.trim()) {
        errors.push(`${label}[${i}].answer must be a non-empty string`);
        return null;
      }
      const norm = normalize(entry.answer);
      if (!norm.length) {
        errors.push(`${label}[${i}].answer must contain at least one letter`);
        return null;
      }
      validateEntryStyles(entry, `${label}[${i}]`, norm.length, errors, warnings);
      return norm;
    });
  }

  const inwardNorm = validateEntries(puzzle.inward, 'inward');
  const outwardNorm = validateEntries(puzzle.outward, 'outward');

  const inwardTotal = inwardNorm.reduce((s, a) => s + (a ? a.length : 0), 0);
  const outwardTotal = outwardNorm.reduce((s, a) => s + (a ? a.length : 0), 0);

  if (inwardTotal !== outwardTotal) {
    errors.push(
      `Inward and outward cell counts must be equal (inward: ${inwardTotal}, outward: ${outwardTotal})`
    );
  }

  if (inwardTotal < 40) {
    errors.push(`Total cell count must be at least 40, got ${inwardTotal}`);
  }

  const allAnswersValid = inwardNorm.every(a => a !== null) && outwardNorm.every(a => a !== null);
  if (allAnswersValid && inwardTotal === outwardTotal) {
    const inwardConcat = inwardNorm.join('');
    const outwardReversed = outwardNorm.join('').split('').reverse().join('');
    if (inwardConcat !== outwardReversed) {
      errors.push(
        'Normalized and concatenated inward answers must be the reverse of outward answers'
      );
    }
  }

  return { errors, warnings };
}

module.exports = { validate };
