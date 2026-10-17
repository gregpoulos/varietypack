// Canonical board-string construction, shared by every tool's prepare step and engine.
// Cells join with a delimiter so that cell boundaries survive hashing: without it,
// a solver's ["ha","ro"] would hash identically to the correct ["har","o"].
// The delimiter is neither a letter nor a digit, so it can never collide with
// normalized cell content (which is [a-z0-9] only).
var CELL_DELIM = '.';

// Joins normalized cell strings in traversal order. Callers pass only cells that
// EXIST — a grid position with no cell (e.g. Marching Bands' center square)
// contributes nothing, not an empty segment.
function joinCells(cells) {
  return cells.join(CELL_DELIM);
}

export { CELL_DELIM, joinCells };
