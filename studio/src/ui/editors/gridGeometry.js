'use strict';
// A grid board's coordinates in one place, so the board and any overlay agree (pure, so
// node:test can load it).
const CELL = 40;     // cell size
const GUTTER = 28;   // left margin for row numbers
const PAD = 6;       // padding at the other edges

// The top-left corner of cell (r, c), 0-based.
function cellOrigin(r, c) {
  return { x: GUTTER + c * CELL, y: PAD + r * CELL };
}

function cellCenter(r, c) {
  const { x, y } = cellOrigin(r, c);
  return { x: x + CELL / 2, y: y + CELL / 2 };
}

// The side of b that faces a, as { x1, y1, x2, y2 }; a and b share a row or a column. It
// is the side of b, not the midpoint between them, so it also works when they aren't
// adjacent: in an odd grid's center row, the cells either side of the center block are
// two columns apart, and a break between them belongs on the far side of the block.
function boundary(a, b) {
  const { x, y } = cellOrigin(b.r, b.c);
  if (a.r === b.r && a.c !== b.c) {
    const sx = a.c < b.c ? x : x + CELL;                       // b's left side, or its right
    return { x1: sx, y1: y, x2: sx, y2: y + CELL };
  }
  if (a.c === b.c && a.r !== b.r) {
    const sy = a.r < b.r ? y : y + CELL;                       // b's top side, or its bottom
    return { x1: x, y1: sy, x2: x + CELL, y2: sy };
  }
  throw new Error('boundary needs two different cells in one row or one column');
}

function svgSize(rows, cols) {
  return { width: GUTTER + cols * CELL + PAD, height: PAD + rows * CELL + PAD };
}

module.exports = { CELL, GUTTER, PAD, cellOrigin, cellCenter, boundary, svgSize };
