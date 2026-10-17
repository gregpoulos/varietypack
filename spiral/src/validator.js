'use strict';

const { HEADER_KEYS, validateCommonHeader } = require('../../shared/build/validation');
const { validateEntry, checkMuddledGuard, checkCellStyles, sameCell, warnUnknownKeys } = require('../../shared/build/validateEntry');
const { cellsOfEntries } = require('./layout.mjs');

function validate(puzzle) {
  const errors   = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'spiral', errors)) return { errors, warnings };
  warnUnknownKeys(puzzle, [...HEADER_KEYS, 'inward', 'outward'], '', warnings);

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

  // Each result is { length, cells } (cells null for a muddled entry), or null for an
  // invalid entry, which counts as no cells toward the totals.
  function validateEntries(entries, label) {
    return entries.map((entry, i) => validateEntry(entry, `${label}[${i}]`, isMuddled, errors, warnings));
  }

  const inwardResults  = validateEntries(puzzle.inward,  'inward');
  const outwardResults = validateEntries(puzzle.outward, 'outward');

  const inwardTotal  = inwardResults.reduce( (s, r) => s + (r?.length ?? 0), 0);
  const outwardTotal = outwardResults.reduce((s, r) => s + (r?.length ?? 0), 0);
  // What the reversal and circle checks need, rather than no errors anywhere: every
  // entry parsed and the two directions the same length. An unrelated error (a bad
  // theme) must not hide them.
  const entriesOk = !inwardResults.includes(null) && !outwardResults.includes(null)
    && inwardTotal === outwardTotal;

  if (inwardTotal !== outwardTotal) {
    errors.push(`Inward and outward cell counts must be equal (inward: ${inwardTotal}, outward: ${outwardTotal})`);
  }
  if (inwardTotal < 40) {
    errors.push(`Total cell count must be at least 40, got ${inwardTotal}`);
  }

  // Reversal check: only possible with actual answers (every entry produced cells).
  // The outward pass reads the cells in reverse order, and reads each cell backward too,
  // so an outward rebus may be spelled either way (sameCell): inward S[HAR]ON pairs with
  // outward NO[HAR]S or NO[RAH]S. The cell holds the inward spelling either way.
  if (!isMuddled && entriesOk) {
    const inwardCells     = inwardResults.flatMap(r => r.cells);
    const outwardReversed = outwardResults.flatMap(r => r.cells).reverse();
    if (!outwardReversed.every((cell, i) => sameCell(cell, inwardCells[i], true))) {
      errors.push(
        'Inward and outward answers must describe the same cells in reverse order. ' +
        'Outward reads each cell backward, so its rebus may be spelled either way: inward ' +
        'S[HAR]ON pairs with outward NO[HAR]S or NO[RAH]S.'
      );
    }
  }

  if (entriesOk) {
    // The same cell numbering the engine uses; every result is non-null once entriesOk.
    const lengthsOf = results => results.map(r => r.length);
    const inwardCells  = cellsOfEntries(lengthsOf(inwardResults), 1, 1);
    const outwardCells = cellsOfEntries(lengthsOf(outwardResults), inwardTotal, -1);
    const coverage = [
      ...puzzle.inward.map((entry, i) => ({ label: `inward[${i}]`, entry, cells: inwardCells[i] })),
      ...puzzle.outward.map((entry, j) => ({ label: `outward[${j}]`, entry, cells: outwardCells[j] })),
    ];
    checkCellStyles(coverage, errors);
  }

  return { errors, warnings };
}

module.exports = { validate };
