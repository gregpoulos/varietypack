'use strict';

const normalize = require('../../shared/normalize');
const { validateEntryStyles, validateCommonHeader } = require('../../shared/build/builderUtils');
const { bandCells, centerFlatIndex } = require('./layout');

function validate(puzzle) {
  const errors   = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'marching-bands', errors, warnings)) return { errors, warnings };

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
      ...(Array.isArray(puzzle.rows)  ? puzzle.rows.flatMap(r  => r?.entries ?? []) : []),
      ...(Array.isArray(puzzle.bands) ? puzzle.bands.flatMap(b => b?.entries ?? []) : []),
    ];
    const hasLengthEntries = allEntries.some(e => e && typeof e === 'object' && e.answer === undefined && typeof e.length === 'number');
    if (hasLengthEntries && !isMuddled) {
      errors.push("Muddled entries (length: without answer:) require a top-level boardHash. Use 'varietypack muddle' to produce this format.");
      return { errors, warnings };
    }
  }
  if (isMuddled) {
    warnings.push('note: entries are muddled; answer validation skipped');
  }

  // Derive N from rows[0] using entryLength semantics (handles both source and muddled entries)
  let N = 0;
  for (let i = 0; i < firstRow.entries.length; i++) {
    const e = firstRow.entries[i];
    if (!e || typeof e !== 'object') {
      errors.push(`rows[0].entries[${i}] must be an object`);
      return { errors, warnings };
    }
    if (isMuddled) {
      if (e.answer !== undefined) {
        errors.push(`rows[0].entries[${i}]: muddled entry must use length:, not answer:`);
        return { errors, warnings };
      }
      if (!Number.isInteger(e.length) || e.length < 1) {
        errors.push(`rows[0].entries[${i}]: muddled entry must have an integer length >= 1`);
        return { errors, warnings };
      }
      N += e.length;
    } else {
      if (!e.answer || typeof e.answer !== 'string') {
        errors.push(`rows[0].entries[${i}].answer must be a non-empty string`);
        return { errors, warnings };
      }
      const norm = normalize(e.answer);
      if (!norm.length) {
        errors.push(`rows[0].entries[${i}].answer must contain at least one letter`);
        return { errors, warnings };
      }
      N += norm.length;
    }
  }

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

  // Per-entry validation helper — source entries require answer:, muddled entries require length:
  function validateEntries(entries, parentLabel) {
    if (!Array.isArray(entries) || entries.length < 1) {
      errors.push(`${parentLabel}.entries must be a non-empty array`);
      return { sum: 0, anySkipped: false };
    }
    let sum = 0;
    let anySkipped = false;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const label = `${parentLabel}.entries[${i}]`;
      if (!entry || typeof entry !== 'object') {
        errors.push(`${label} must be an object`); anySkipped = true; continue;
      }
      if (!entry.clue || typeof entry.clue !== 'string' || !entry.clue.trim()) {
        errors.push(`${label}.clue must be a non-empty string`);
      }

      if (isMuddled) {
        if (entry.answer !== undefined) {
          errors.push(`${label}: muddled entry must use length:, not answer:`);
          anySkipped = true; continue;
        }
        if (!Number.isInteger(entry.length) || entry.length < 1) {
          errors.push(`${label}: muddled entry must have an integer length >= 1`);
          anySkipped = true; continue;
        }
        validateEntryStyles(entry, label, entry.length, errors, warnings);
        sum += entry.length;
      } else {
        if (!entry.answer || typeof entry.answer !== 'string' || !entry.answer.trim()) {
          errors.push(`${label}.answer must be a non-empty string`);
          anySkipped = true; continue;
        }
        const norm = normalize(entry.answer);
        if (!norm.length) {
          errors.push(`${label}.answer must contain at least one letter`); anySkipped = true; continue;
        }
        validateEntryStyles(entry, label, norm.length, errors, warnings);
        sum += norm.length;
      }
    }
    return { sum, anySkipped };
  }

  for (let r = 0; r < Math.min(puzzle.rows.length, N); r++) {
    const row = puzzle.rows[r];
    const { sum, anySkipped } = validateEntries(row?.entries ?? [], `rows[${r}]`);
    const expected = (r === centerRowIndex) ? N - 1 : N;
    if (!anySkipped && sum !== expected) {
      errors.push(`rows[${r}]: entry lengths sum to ${sum}, expected ${expected}`);
    }
  }

  const expectedBands = Math.floor(N / 2);
  if (!Array.isArray(puzzle.bands)) {
    errors.push('"bands" must be an array');
    return { errors, warnings };
  }
  if (puzzle.bands.length !== expectedBands) {
    errors.push(`Expected ${expectedBands} bands for N=${N}, got ${puzzle.bands.length}`);
  }

  for (let k = 0; k < Math.min(puzzle.bands.length, expectedBands); k++) {
    const band = puzzle.bands[k];
    const { sum, anySkipped } = validateEntries(band?.entries ?? [], `bands[${k}]`);
    const expected = 4 * (N - 1 - 2 * k);
    if (!anySkipped && sum !== expected) {
      errors.push(`bands[${k}]: entry lengths sum to ${sum}, expected ${expected} (4*(N-1-2*${k}) for N=${N})`);
    }
  }

  // Cross-check: row/band letter agreement — only possible with plaintext answers
  if (!isMuddled && errors.length === 0) {
    const centerIdx = isOddN ? centerFlatIndex(N) : -1;
    const rowGrid   = {};
    for (let r = 0; r < N; r++) {
      const rowLetters = puzzle.rows[r].entries.flatMap(e => normalize(e.answer).split(''));
      let li = 0;
      for (let c = 0; c < N; c++) {
        const flat0 = r * N + c;
        if (flat0 === centerIdx) continue;
        rowGrid[flat0 + 1] = rowLetters[li++];
      }
    }
    for (let k = 0; k < puzzle.bands.length; k++) {
      const bandLetters = puzzle.bands[k].entries.flatMap(e => normalize(e.answer).split(''));
      const cells = bandCells(k, N);
      for (let i = 0; i < cells.length; i++) {
        const id         = cells[i];
        const rowLetter  = rowGrid[id];
        const bandLetter = bandLetters[i];
        if (rowLetter !== bandLetter) {
          const row = Math.floor((id - 1) / N) + 1;
          const col = ((id - 1) % N) + 1;
          errors.push(`Cell (${row}, ${col}): row has "${rowLetter}" but band ${k} has "${bandLetter}" — rows and bands disagree`);
        }
      }
    }
  }

  return { errors, warnings };
}

module.exports = { validate };
