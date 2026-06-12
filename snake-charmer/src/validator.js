'use strict';

const normalize = require('../../shared/normalize');
const { validateCommonHeader } = require('../../shared/build/builderUtils');
const { validateEntry, hasLengthWithoutHash } = require('../../shared/build/validateEntry');

function validate(puzzle) {
  const errors   = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'snake-charmer', errors, warnings)) return { errors, warnings };

  const loops = puzzle.loops ?? 2;
  if (loops !== 2) {
    errors.push(
      `"loops" must be 2; multi-loop (>2) Snake Charmer puzzles are not yet supported, got: ${JSON.stringify(puzzle.loops)}`
    );
  }

  const VALID_SHAPES = ['circle', 'stadium', 'turn', 'double-turn'];
  if (puzzle.shape !== undefined && !VALID_SHAPES.includes(puzzle.shape)) {
    errors.push(`"shape" must be one of: ${VALID_SHAPES.join(', ')}, got: ${JSON.stringify(puzzle.shape)}`);
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
  if (hasLengthWithoutHash(puzzle.entries, isMuddled, errors)) return { errors, warnings };
  if (isMuddled) {
    warnings.push('note: entries are muddled; answer validation skipped');
  }

  // Per-entry validation — source entries require answer:, muddled entries require length:
  const entryLengths = puzzle.entries.map((entry, i) => {
    const len = validateEntry(entry, `entries[${i}]`, isMuddled, errors, warnings);
    return len !== null ? len : 0;
  });

  const totalCells = entryLengths.reduce((sum, l) => sum + l, 0);

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

  // Ring-equality check: only possible when we have the actual letter strings
  if (!isMuddled && ringSize >= 8) {
    const concat = puzzle.entries.map(e =>
      e && typeof e.answer === 'string' ? normalize(e.answer) : ''
    ).join('');
    const loop0 = concat.slice(0, ringSize);
    for (let k = 1; k < loops; k++) {
      const loopK = concat.slice(k * ringSize, (k + 1) * ringSize);
      if (loopK !== loop0) {
        errors.push(
          `Answers do not form a valid ${loops}-loop Snake Charmer: loop ${k} letters differ from loop 0`
        );
        break;
      }
    }
  }

  return { errors, warnings };
}

module.exports = { validate };
