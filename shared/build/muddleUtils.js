'use strict';

const { cellsOrThrow } = require('./cells');

function walkAnswers(obj) {
  if (Array.isArray(obj)) return obj.map(walkAnswers);
  if (obj !== null && typeof obj === 'object') {
    if (Object.prototype.hasOwnProperty.call(obj, 'answer')) {
      const { answer, ...rest } = obj;
      // length: is a CELL count, not a letter count — see docs/ARCHITECTURE.md ->
      // "Muddled YAML" for why format: 2 accompanies it. Shares its
      // answer parsing (and invalid-answer throw) with
      // entryCellCount/processEntries via cells.js' cellsOrThrow.
      const cells = cellsOrThrow(answer);
      return { ...rest, length: cells.length };
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = walkAnswers(v);
    }
    return out;
  }
  return obj;
}

function buildMuddledYaml(puzzle, boardHash) {
  const walked = walkAnswers(puzzle);
  return { ...walked, hashed: true, format: 2, boardHash };
}

// The options every muddled-YAML dump uses (js-yaml's default 80-column folding would
// reflow long clues).
const MUDDLED_DUMP_OPTIONS = { lineWidth: -1 };

/**
 * Pure muddle sequence: validate → hash → build the muddled object. The one home for
 * that order, shared by the muddle command and the studio.
 *
 * A puzzle that already carries a boardHash is refused with ALREADY_MUDDLED as its one
 * error: it has no answers left to hash.
 *
 * @returns {{ errors: string[], warnings: string[], muddled: object|null }}
 *   muddled is null whenever errors is non-empty.
 */
const ALREADY_MUDDLED = 'puzzle is already muddled; muddle the source puzzle instead';
function muddlePuzzle(puzzle, { validateFn, prepareFn }) {
  if (puzzle.boardHash !== undefined) {
    return { errors: [ALREADY_MUDDLED], warnings: [], muddled: null };
  }
  const { errors, warnings } = validateFn(puzzle);
  if (errors.length) return { errors, warnings, muddled: null };
  const { boardHash } = prepareFn({ ...puzzle, hashed: true });
  return { errors, warnings, muddled: buildMuddledYaml(puzzle, boardHash) };
}

module.exports = { walkAnswers, buildMuddledYaml, muddlePuzzle, ALREADY_MUDDLED, MUDDLED_DUMP_OPTIONS };
