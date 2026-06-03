'use strict';

const normalize = require('../../shared/normalize');
const { validateEntryStyles, validateCommonHeader } = require('../../shared/build/builderUtils');

function validate(puzzle) {
  const errors = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'snake-charmer', errors)) return { errors, warnings };

  const loops = puzzle.loops ?? 2;
  if (!Number.isInteger(loops) || loops < 2) {
    errors.push(`"loops" must be an integer >= 2, got: ${JSON.stringify(puzzle.loops)}`);
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

  const normalizedAnswers = puzzle.entries.map(e =>
    e && typeof e.answer === 'string' ? normalize(e.answer) : ''
  );

  puzzle.entries.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`entries[${i}] must be an object`);
      return;
    }
    if (!entry.clue || typeof entry.clue !== 'string' || !entry.clue.trim()) {
      errors.push(`entries[${i}].clue must be a non-empty string`);
    }
    const hasValidAnswer = entry.answer && typeof entry.answer === 'string' && entry.answer.trim();
    if (!hasValidAnswer) {
      errors.push(`entries[${i}].answer must be a non-empty string`);
    } else if (!normalizedAnswers[i].length) {
      errors.push(`entries[${i}].answer must contain at least one letter`);
    } else {
      validateEntryStyles(entry, `entries[${i}]`, normalizedAnswers[i].length, errors, warnings);
    }
  });

  const totalCells = normalizedAnswers.reduce((sum, a) => sum + a.length, 0);

  const validLoops = Number.isInteger(loops) && loops >= 2;
  if (validLoops && totalCells % loops !== 0) {
    errors.push(
      `Total cell count must be divisible by loops (${loops}), got ${totalCells}`
    );
  }

  const ringSize = validLoops && totalCells % loops === 0 ? totalCells / loops : 0;
  if (ringSize > 0 && ringSize < 8) {
    errors.push(`Ring size must be at least 8, got ${ringSize} (${totalCells} cells / ${loops} loops)`);
  }

  if (ringSize > 0 && ringSize % 2 !== 0) {
    errors.push(
      `Ring size must be even for the ring layout to close, got ${ringSize} (${totalCells} cells / ${loops} loops)`
    );
  }

  if (ringSize >= 8) {
    const concat = normalizedAnswers.join('');
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
