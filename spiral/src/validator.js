'use strict';

const normalize = require('../../shared/normalize');
const { validateEntryStyles, validateCommonHeader } = require('../../shared/build/builderUtils');

function validate(puzzle) {
  const errors   = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'spiral', errors, warnings)) return { errors, warnings };

  const inwardIsArray  = Array.isArray(puzzle.inward);
  const outwardIsArray = Array.isArray(puzzle.outward);
  if (!inwardIsArray)  errors.push('"inward" must be an array');
  if (!outwardIsArray) errors.push('"outward" must be an array');
  if (!inwardIsArray || !outwardIsArray) return { errors, warnings };

  if (puzzle.inward.length  < 2) errors.push('"inward" must have at least 2 entries');
  if (puzzle.outward.length < 2) errors.push('"outward" must have at least 2 entries');

  // Integrity guards
  const isMuddled  = puzzle.boardHash !== undefined;
  const allEntries = [...puzzle.inward, ...puzzle.outward];
  const hasLengthEntries = allEntries.some(e => e && typeof e === 'object' && e.answer === undefined && typeof e.length === 'number');
  if (hasLengthEntries && !isMuddled) {
    errors.push("Muddled entries (length: without answer:) require a top-level boardHash. Use 'varietypack muddle' to produce this format.");
    return { errors, warnings };
  }
  if (isMuddled) {
    warnings.push('note: entries are muddled; answer validation skipped');
  }

  // Each result is { length, norm }: `length` always counts toward the cell total;
  // `norm` is the normalized answer string, or null when unavailable (muddled entry
  // or invalid entry) — so the reversal check below can require `norm !== null`.
  function validateEntries(entries, label) {
    return entries.map((entry, i) => {
      if (!entry || typeof entry !== 'object') {
        errors.push(`${label}[${i}] must be an object`);
        return { length: 0, norm: null };
      }
      if (!entry.clue || typeof entry.clue !== 'string' || !entry.clue.trim()) {
        errors.push(`${label}[${i}].clue must be a non-empty string`);
      }

      if (isMuddled) {
        if (entry.answer !== undefined) {
          errors.push(`${label}[${i}]: muddled entry must use length:, not answer:`);
          return { length: 0, norm: null };
        }
        if (!Number.isInteger(entry.length) || entry.length < 1) {
          errors.push(`${label}[${i}]: muddled entry must have an integer length >= 1`);
          return { length: 0, norm: null };
        }
        validateEntryStyles(entry, `${label}[${i}]`, entry.length, errors, warnings);
        return { length: entry.length, norm: null };
      }

      if (!entry.answer || typeof entry.answer !== 'string' || !entry.answer.trim()) {
        errors.push(`${label}[${i}].answer must be a non-empty string`);
        return { length: 0, norm: null };
      }
      const norm = normalize(entry.answer);
      if (!norm.length) {
        errors.push(`${label}[${i}].answer must contain at least one letter`);
        return { length: 0, norm: null };
      }
      validateEntryStyles(entry, `${label}[${i}]`, norm.length, errors, warnings);
      return { length: norm.length, norm };
    });
  }

  const inwardResults  = validateEntries(puzzle.inward,  'inward');
  const outwardResults = validateEntries(puzzle.outward, 'outward');

  const inwardTotal  = inwardResults.reduce( (s, r) => s + r.length, 0);
  const outwardTotal = outwardResults.reduce((s, r) => s + r.length, 0);

  if (inwardTotal !== outwardTotal) {
    errors.push(`Inward and outward cell counts must be equal (inward: ${inwardTotal}, outward: ${outwardTotal})`);
  }
  if (inwardTotal < 40) {
    errors.push(`Total cell count must be at least 40, got ${inwardTotal}`);
  }

  // Reversal check: only possible with actual letter strings (every entry produced a norm)
  if (!isMuddled) {
    const allAnswersValid = inwardResults.every(r => r.norm !== null) && outwardResults.every(r => r.norm !== null);
    if (allAnswersValid && inwardTotal === outwardTotal) {
      const inwardConcat    = inwardResults.map(r => r.norm).join('');
      const outwardReversed = outwardResults.map(r => r.norm).join('').split('').reverse().join('');
      if (inwardConcat !== outwardReversed) {
        errors.push('Normalized and concatenated inward answers must be the reverse of outward answers');
      }
    }
  }

  return { errors, warnings };
}

module.exports = { validate };
