'use strict';

const { SHAPE_NAMES, ringFor } = require('./layout');
const { buildEntryMaps } = require('./entryMaps.mjs');
const { HEADER_KEYS, validateCommonHeader } = require('../../shared/build/validation');
const { validateEntry, checkMuddledGuard, checkCellStyles, warnUnknownKeys } = require('../../shared/build/validateEntry');

// Ring cells where more than one entry starts, from the entries' cell lengths. Two
// entries starting on one cell would put two numbers on one square.
function findCoincidentStarts(lengths, loops) {
  const ringSize = lengths.reduce((s, n) => s + n, 0) / loops;
  const startCount = new Array(ringSize).fill(0);
  let concatPos = 0;
  for (const length of lengths) {
    startCount[concatPos % ringSize]++;
    concatPos += length;
  }
  return startCount.map((c, i) => c > 1 ? i : -1).filter(i => i >= 0);
}

function validate(puzzle, options = {}) {
  const errors   = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'snake-charmer', errors)) return { errors, warnings };
  warnUnknownKeys(puzzle, [...HEADER_KEYS, 'entries', 'loops', 'shape'], '', warnings);

  const loops = puzzle.loops ?? 2;
  if (loops !== 2) {
    errors.push(
      `"loops" must be 2; multi-loop (>2) Snake Charmer puzzles are not yet supported, got: ${JSON.stringify(puzzle.loops)}`
    );
  }

  if (puzzle.shape !== undefined && !SHAPE_NAMES.includes(puzzle.shape)) {
    errors.push(`"shape" must be one of: ${SHAPE_NAMES.join(', ')}, got: ${JSON.stringify(puzzle.shape)}`);
  }
  // The --shape flag arrives unchecked, as the flags validateBuildOptions checks do.
  if (options.shape !== undefined && !SHAPE_NAMES.includes(options.shape)) {
    errors.push(`--shape must be one of: ${SHAPE_NAMES.join(', ')}, got ${JSON.stringify(options.shape)}`);
  }

  if (!Array.isArray(puzzle.entries)) {
    errors.push('"entries" must be an array');
    return { errors, warnings };
  }

  if (puzzle.entries.length < 3) {
    errors.push('"entries" must have at least 3 items');
  }

  // Integrity guards
  const isMuddled = puzzle.boardHash !== undefined;
  if (checkMuddledGuard(puzzle.entries, isMuddled, errors, warnings)) return { errors, warnings };

  // Per-entry validation — source entries require answer:, muddled entries require
  // length:
  const results = puzzle.entries.map((entry, i) =>
    validateEntry(entry, `entries[${i}]`, isMuddled, errors, warnings));

  const totalCells = results.reduce((sum, r) => sum + (r ? r.length : 0), 0);
  const entriesOk  = !results.includes(null);

  const validLoops = loops === 2;
  if (validLoops && totalCells % loops !== 0) {
    errors.push(`Total cell count must be divisible by loops (${loops}), got ${totalCells}`);
  }

  const ringSize = validLoops && totalCells % loops === 0 ? totalCells / loops : 0;
  if (ringSize > 0 && ringSize < 8) {
    errors.push(`Ring size must be at least 8, got ${ringSize} (${totalCells} cells / ${loops} loops)`);
  }
  if (ringSize > 0 && ringSize % 2 !== 0) {
    errors.push(`Ring size must be even for the ring layout to close, got ${ringSize} (${totalCells} cells / ${loops} loops)`);
  }

  // A named shape never falls back at build time (ringFor), so one that can't lay out
  // this ring would fail the build; the automatic choice falls back to the stadium
  // instead. The --shape flag wins over the YAML's shape, as it does in the builder; a
  // name the table doesn't know is rejected above.
  const shape = options.shape ?? puzzle.shape;
  if (ringSize >= 8 && ringSize % 2 === 0 && SHAPE_NAMES.includes(shape)) {
    try {
      ringFor(ringSize, shape);
    } catch (err) {
      const named = options.shape !== undefined ? `--shape ${JSON.stringify(shape)}` : `"shape" ${JSON.stringify(shape)}`;
      errors.push(`${named} cannot lay out a ring of ${ringSize} cells: ${err.message}`);
    }
  }

  // Ring-equality check: only possible when we have the actual answers.
  // Compared in CELL space — a rebus group in loop 0 requires the same group at the
  // same cell in every other loop, since all loops occupy the same ring cells.
  // It needs every entry parsed: a bad entry would shift the cells after it, and the
  // total can still make a valid ring. It doesn't wait for no errors anywhere, so an
  // unrelated error can't hide a real mismatch.
  if (!isMuddled && entriesOk && ringSize >= 8) {
    const cells = results.flatMap(r => r?.cells ?? []);
    const key   = arr => arr.join(' ');
    const loop0 = key(cells.slice(0, ringSize));
    for (let k = 1; k < loops; k++) {
      const loopK = key(cells.slice(k * ringSize, (k + 1) * ringSize));
      if (loopK !== loop0) {
        errors.push(
          `Answers do not form a valid ${loops}-loop Snake Charmer: loop ${k} cells differ from loop 0 ` +
          '(a multi-letter cell must be bracketed identically in every loop)'
        );
        break;
      }
    }
  }

  // Like the ring-equality check, this waits only for what it needs (every entry parsed,
  // a ring size).
  if (entriesOk && ringSize > 0) {
    const lengths = results.map(r => r.length);   // every result is non-null once entriesOk
    const { ringPosByEntry } = buildEntryMaps(lengths.map(length => ({ length })), loops);
    const coverage = puzzle.entries.map((entry, i) => ({ label: `entries[${i}]`, entry, cells: ringPosByEntry[i] }));
    checkCellStyles(coverage, errors);

    const coincident = findCoincidentStarts(lengths, loops);
    if (coincident.length > 0) {
      warnings.push(
        `${coincident.length} ring cell(s) have entries from multiple loops starting on the same square: cells ${coincident.join(', ')}`
      );
    }
  }

  return { errors, warnings };
}

module.exports = { validate, findCoincidentStarts };
