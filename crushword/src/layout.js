'use strict';

// Shared with engine.js's bundle position: grid.js is concatenated immediately
// before this file in the browser build (see builder.js), so deriveSlots is
// already a global there. Conditionally required for Node (hasher/tests),
// mirroring the preamble pattern in shared/engine-state.js.
if (typeof deriveSlots === 'undefined' && typeof require !== 'undefined')
  var { deriveSlots } = require('./grid');

function cellCoords(r, c, cellWidth, cellHeight) {
  return { x: c * cellWidth, y: r * cellHeight };
}

function gridDimensions(grid) {
  return { rows: grid.length, cols: grid[0].length };
}

function svgSize(grid, cellWidth, cellHeight) {
  const { rows, cols } = gridDimensions(grid);
  return { width: cols * cellWidth, height: rows * cellHeight };
}

// A cell's pixel size, given the puzzle's maxCellLetters. Height is always
// baseSize — cell content is one line regardless of capacity. Width grows
// with maxCellLetters so a wide bracketed rebus group has visual room to sit
// in a single cell; every cell gets the same width (capacity is a puzzle-wide
// setting, not a per-cell one, so this can't hint at which specific cells are
// rebus — see docs/CROSS_TOOL_SPEC.md -> "Enter / Rebus button" for the
// per-cell version of that rule). WIDTH_STEP is a hand-picked constant, not
// derived from font metrics — it just needs to comfortably fit
// `maxCellLetters` characters at the engine's fixed cell font-size.
const WIDTH_STEP = 10;
function cellDimensions(maxCellLetters, baseSize = 34) {
  return { width: baseSize + (maxCellLetters - 1) * WIDTH_STEP, height: baseSize };
}

// Per-cell number label, keyed '<r>,<c>' (0-indexed) -> num, for every cell
// where an across and/or down entry begins — the same numbers `across`/`down`
// are keyed by in the YAML. Wraps grid.js's deriveSlots rather than
// re-deriving the run-start rule, so a rendered number can never drift from
// the validator's numbering.
function deriveNumbering(grid) {
  const { acrossSlots, downSlots } = deriveSlots(grid);
  const numbering = {};
  for (const slot of [...acrossSlots, ...downSlots]) {
    numbering[`${slot.r},${slot.c}`] = slot.num;
  }
  return numbering;
}

if (typeof module !== 'undefined') module.exports = { cellCoords, gridDimensions, svgSize, deriveNumbering, cellDimensions };
