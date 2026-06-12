'use strict';

const normalize = require('../../shared/normalize');
const { validateCommonHeader } = require('../../shared/build/builderUtils');
const { validateEntry, hasLengthWithoutHash } = require('../../shared/build/validateEntry');

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
  if (hasLengthWithoutHash(allEntries, isMuddled, errors)) return { errors, warnings };
  if (isMuddled) {
    warnings.push('note: entries are muddled; answer validation skipped');
  }

  // Each result is { length, norm }: `length` always counts toward the cell total;
  // `norm` is the normalized answer string, or null when unavailable (muddled entry
  // or invalid entry) — so the reversal check below can require `norm !== null`.
  function validateEntries(entries, label) {
    return entries.map((entry, i) => {
      const len = validateEntry(entry, `${label}[${i}]`, isMuddled, errors, warnings);
      if (len === null) return { length: 0, norm: null };
      const norm = (!isMuddled && entry && typeof entry.answer === 'string')
        ? normalize(entry.answer)
        : null;
      return { length: len, norm };
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
