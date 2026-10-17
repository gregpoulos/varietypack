'use strict';

const { HEADER_KEYS, validateCommonHeader } = require('../../shared/build/validation');
const { validateEntry, checkMuddledGuard, checkCellStyles, sameCell, warnUnknownKeys } = require('../../shared/build/validateEntry');
const { bandCells, rowCells, onBandBottomEdge } = require('./layout.mjs');

function validate(puzzle) {
  const errors   = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'marching-bands', errors)) return { errors, warnings };
  warnUnknownKeys(puzzle, [...HEADER_KEYS, 'rows', 'bands', 'size'], '', warnings);

  if (!Array.isArray(puzzle.rows) || puzzle.rows.length < 3) {
    errors.push('"rows" must be an array with at least 3 elements');
    return { errors, warnings };
  }

  const firstRow = puzzle.rows[0];
  if (!firstRow || !Array.isArray(firstRow.entries) || firstRow.entries.length < 1) {
    errors.push('rows[0].entries must be a non-empty array');
    return { errors, warnings };
  }

  // Integrity guard
  const isMuddled = puzzle.boardHash !== undefined;
  {
    const allEntries = [
      ...puzzle.rows.flatMap(r => r?.entries ?? []),
      ...(Array.isArray(puzzle.bands) ? puzzle.bands.flatMap(b => b?.entries ?? []) : []),
    ];
    if (checkMuddledGuard(allEntries, isMuddled, errors, warnings)) return { errors, warnings };
  }

  // Derive N from rows[0] (cell counts, so source and muddled entries alike). Every entry
  // is checked before an invalid one stops validation, since N is unknown without it.
  const firstResults = firstRow.entries.map((entry, i) =>
    validateEntry(entry, `rows[0].entries[${i}]`, isMuddled, errors, warnings));
  if (firstResults.includes(null)) return { errors, warnings };
  const N = firstResults.reduce((sum, r) => sum + r.length, 0);
  const rowEntryCells = [firstResults.flatMap(r => r.cells ?? [])];   // per row: the entries' cells, flattened (empty when muddled)
  const rowEntryLengths = [firstResults.map(r => r.length)];          // per row: each entry's cell count

  if (N < 3) {
    errors.push(`Grid size N must be at least 3, got ${N}`);
    return { errors, warnings };
  }

  if (puzzle.size !== undefined) {
    if (!Number.isInteger(puzzle.size) || puzzle.size !== N) {
      errors.push(`"size" field is ${puzzle.size} but derived N from rows[0] is ${N}`);
    }
  }

  const isOddN        = N % 2 === 1;
  const centerRowIndex = isOddN ? (N - 1) / 2 : -1;

  if (puzzle.rows.length !== N) {
    errors.push(`Expected ${N} rows, got ${puzzle.rows.length}`);
  }
  // What the cross-check and circle check need, rather than no errors anywhere: every
  // entry parsed and every row and band the right size, so cells line up. An unrelated
  // error (a bad theme) must not hide a disagreement.
  let layoutOk = puzzle.rows.length === N;

  // Per-entry validation helper — source entries require answer:, muddled entries require
  // length:
  function validateEntries(entries, parentLabel) {
    if (!Array.isArray(entries) || entries.length < 1) {
      errors.push(`${parentLabel}.entries must be a non-empty array`);
      return { sum: 0, anySkipped: false, cells: [], lengths: [] };
    }
    let sum = 0;
    let anySkipped = false;
    const cells = [];
    const lengths = [];
    for (let i = 0; i < entries.length; i++) {
      const result = validateEntry(entries[i], `${parentLabel}.entries[${i}]`, isMuddled, errors, warnings);
      if (result === null) { anySkipped = true; continue; }
      sum += result.length;
      cells.push(...(result.cells ?? []));
      lengths.push(result.length);
    }
    return { sum, anySkipped, cells, lengths };
  }

  puzzle.rows.forEach((row, r) => warnUnknownKeys(row, ['entries'], `rows[${r}]`, warnings));
  for (let r = 1; r < Math.min(puzzle.rows.length, N); r++) {
    const row = puzzle.rows[r];
    const { sum, anySkipped, cells, lengths } = validateEntries(row?.entries ?? [], `rows[${r}]`);
    rowEntryCells[r] = cells;
    rowEntryLengths[r] = lengths;
    const expected = (r === centerRowIndex) ? N - 1 : N;
    if (!anySkipped && sum !== expected) {
      errors.push(`rows[${r}]: entry lengths sum to ${sum}, expected ${expected}`);
    }
    if (anySkipped || sum !== expected) layoutOk = false;
  }

  const expectedBands = Math.floor(N / 2);
  if (!Array.isArray(puzzle.bands)) {
    errors.push('"bands" must be an array');
    return { errors, warnings };
  }
  if (puzzle.bands.length !== expectedBands) {
    errors.push(`Expected ${expectedBands} bands for N=${N}, got ${puzzle.bands.length}`);
    layoutOk = false;
  }

  puzzle.bands.forEach((band, k) => warnUnknownKeys(band, ['entries'], `bands[${k}]`, warnings));
  const bandEntryCells = [];
  const bandEntryLengths = [];
  for (let k = 0; k < Math.min(puzzle.bands.length, expectedBands); k++) {
    const band = puzzle.bands[k];
    const { sum, anySkipped, cells, lengths } = validateEntries(band?.entries ?? [], `bands[${k}]`);
    bandEntryCells[k] = cells;
    bandEntryLengths[k] = lengths;
    const expected = 4 * (N - 1 - 2 * k);
    if (!anySkipped && sum !== expected) {
      errors.push(`bands[${k}]: entry lengths sum to ${sum}, expected ${expected} (4*(N-1-2*${k}) for N=${N})`);
    }
    if (anySkipped || sum !== expected) layoutOk = false;
  }

  // Cross-check: row/band cell agreement — only possible with plaintext answers
  if (!isMuddled && layoutOk) {
    const rowGrid = {};
    for (let r = 0; r < N; r++) {
      rowCells(r, N).forEach((id, i) => { rowGrid[id] = rowEntryCells[r][i]; });
    }
    for (let k = 0; k < puzzle.bands.length; k++) {
      const bandLetters = bandEntryCells[k];
      const cells = bandCells(k, N);
      for (let i = 0; i < cells.length; i++) {
        const id         = cells[i];
        const rowLetter  = rowGrid[id];
        const bandLetter = bandLetters[i];
        if (!sameCell(bandLetter, rowLetter, onBandBottomEdge(k, id, N))) {
          const row = Math.floor((id - 1) / N) + 1;
          const col = ((id - 1) % N) + 1;
          errors.push(`Cell (${row}, ${col}): row has "${rowLetter}" but band ${k} has "${bandLetter}" — rows and bands disagree`);
        }
      }
    }
  }

  if (layoutOk) {
    const coverage = [];
    puzzle.rows.forEach((row, r) => {
      const ids = rowCells(r, N);
      let offset = 0;
      row.entries.forEach((entry, i) => {
        const len = rowEntryLengths[r][i];
        coverage.push({ label: `rows[${r}].entries[${i}]`, entry, cells: ids.slice(offset, offset + len) });
        offset += len;
      });
    });
    puzzle.bands.forEach((band, k) => {
      const ids = bandCells(k, N);
      let offset = 0;
      band.entries.forEach((entry, i) => {
        const len = bandEntryLengths[k][i];
        coverage.push({ label: `bands[${k}].entries[${i}]`, entry, cells: ids.slice(offset, offset + len) });
        offset += len;
      });
    });
    checkCellStyles(coverage, errors);
  }

  return { errors, warnings };
}

module.exports = { validate };
