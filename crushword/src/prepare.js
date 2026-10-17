'use strict';

const { processEntries, prepareCommon } = require('../../shared/build/prepare');
const { deriveSlots, slotCells } = require('./grid.mjs');
const { DEFAULT_MAX_CELL_LETTERS } = require('./validator');

// Runs processEntries over one direction's entries (in slot order), pairing
// each processed entry back up with its slot's grid position.
function processDirection(entriesObj, slots) {
  const raw = slots.map(slot => entriesObj[slot.num]);
  const processed = processEntries(raw);
  return slots.map((slot, i) => ({ slot, ...processed[i] }));
}

function preparePuzzle(puzzle) {
  const grid = puzzle.grid;
  const { acrossSlots, downSlots } = deriveSlots(grid);

  const across = processDirection(puzzle.across, acrossSlots);
  const down   = processDirection(puzzle.down, downSlots);

  return {
    ...prepareCommon(puzzle, 'crushword', () => {
      // Build the board string: row-major over OPEN cells only, skipping blocks.
      // A cell's content may come from either direction's entry — the validator
      // guarantees they agree wherever both exist, and a cell whose across run
      // is length 1 has no across slot at all, so both directions are merged
      // rather than relying on one. processEntries' _cells is null only for a
      // muddled entry, which never reaches this branch.
      const rows = grid.length, cols = grid[0].length;
      const lettersByPos = {};
      for (const [dir, entries] of [['across', across], ['down', down]]) {
        for (const { slot, _cells } of entries) {
          slotCells(slot, dir).forEach(({ r, c }, i) => { lettersByPos[`${r},${c}`] = _cells[i]; });
        }
      }

      const letters = new Array(rows * cols).fill(null);
      const boardCells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] !== '.') continue;
          const cell = lettersByPos[`${r},${c}`];
          letters[r * cols + c] = cell;
          boardCells.push(cell);
        }
      }
      return { boardCells, letters };
    }),
    grid,
    // Drives the engine's cell width (wider cells for a higher rebus-letter
    // cap) — a puzzle-wide setting, so this can't hint at which cells are
    // rebus. Always present, never optional passthrough, so the engine never
    // has to know the default.
    maxCellLetters: puzzle.maxCellLetters ?? DEFAULT_MAX_CELL_LETTERS,
    across: Object.fromEntries(across.map(({ slot, _cells, ...e }) => [slot.num, e])),
    down:   Object.fromEntries(down.map(({ slot, _cells, ...e }) => [slot.num, e])),
  };
}

module.exports = { preparePuzzle };
