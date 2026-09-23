'use strict';

const { validateCommonHeader, entryCells } = require('../../shared/build/builderUtils');
const { validateEntry, checkMuddledGuard } = require('../../shared/build/validateEntry');

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
  if (checkMuddledGuard(allEntries, isMuddled, errors, warnings)) return { errors, warnings };

  // Each result is { length, cells }: `length` always counts toward the cell total;
  // `cells` is the array of normalized per-cell strings, or null when unavailable
  // (muddled entry or invalid entry) — so the reversal check below can require
  // `cells !== null`.
  function validateEntries(entries, label) {
    return entries.map((entry, i) => {
      const len = validateEntry(entry, `${label}[${i}]`, isMuddled, errors, warnings);
      if (len === null) return { length: 0, cells: null };
      const cells = (!isMuddled && entry && typeof entry.answer === 'string')
        ? entryCells(entry)
        : null;
      return { length: len, cells };
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

  // Reversal check: only possible with actual answers (every entry produced cells).
  // Reversal is over the CELL SEQUENCE, not over letters. A rebus cell is a picture
  // standing for a chunk of a word, and a picture has no reading direction — so the
  // outward pass reverses the order of the cells while each cell's contents stay
  // forward. Inward S[HAR]ON ⇒ outward NO[HAR]S, never NO[RAH]S.
  if (!isMuddled) {
    const allAnswersValid = inwardResults.every(r => r.cells !== null) && outwardResults.every(r => r.cells !== null);
    if (allAnswersValid && inwardTotal === outwardTotal) {
      const inwardCells     = inwardResults.flatMap(r => r.cells);
      const outwardCells    = outwardResults.flatMap(r => r.cells);
      const outwardReversed = [...outwardCells].reverse();
      // Joined with a space purely as a comparison separator — a normalized cell is
      // always [a-z], so a space can never appear inside one and this join is exact.
      if (inwardCells.join(' ') !== outwardReversed.join(' ')) {
        errors.push(
          'Inward and outward answers must describe the same cells in reverse order. ' +
          'Note that a multi-letter (rebus) cell is like a picture: it has no reading direction, ' +
          'so its letters stay in forward order in both directions — inward S[HAR]ON pairs with ' +
          'outward NO[HAR]S, not NO[RAH]S.'
        );
      }
    }
  }

  return { errors, warnings };
}

module.exports = { validate };
