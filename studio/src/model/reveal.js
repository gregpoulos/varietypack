'use strict';

// How far to scroll a column so its active row stays in view, and nothing else moves.
// Rects are { top, bottom } in the same coordinates (viewport pixels); a positive result
// scrolls down. A row already in view causes no scroll at all, so selecting a clue never
// snaps it to the top or bottom of the frame.

// Rows sit at fractional offsets and WebKit truncates scrollTop to a whole pixel, so the
// distance rounds up or the row stops a fraction short of the edge.
function revealDelta(col, row) {
  if (row.top < col.top) return -Math.ceil(col.top - row.top);
  if (row.bottom > col.bottom) return Math.ceil(row.bottom - col.bottom);
  return 0;
}

// Only the active row (the entry at the caret) ever causes a scroll, and only when it is
// out of view. The crossing row is context: revealing it would move the column for a row
// the author isn't editing.
function planReveal(col, active) {
  return active ? revealDelta(col, active) : 0;
}

module.exports = { revealDelta, planReveal };
