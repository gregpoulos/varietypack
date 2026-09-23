'use strict';

function isOpen(grid, r, c) {
  return r >= 0 && r < grid.length && c >= 0 && c < grid[0].length && grid[r][c] === '.';
}

// Standard American-crossword numbering: a cell is numbered when it starts a
// run of open cells with length >= 2 in either direction — a length-1 run
// never gets its own clue, since it carries no independent information
// beyond whatever crosses it. Returns the across/down slots the grid implies:
// { num, r, c, len } each, 0-indexed position, len in CELLS.
function deriveSlots(grid) {
  const acrossSlots = [];
  const downSlots = [];
  let num = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!isOpen(grid, r, c)) continue;
      const startsAcross = !isOpen(grid, r, c - 1) && isOpen(grid, r, c + 1);
      const startsDown = !isOpen(grid, r - 1, c) && isOpen(grid, r + 1, c);
      if (!startsAcross && !startsDown) continue;
      num++;
      if (startsAcross) {
        let len = 0;
        while (isOpen(grid, r, c + len)) len++;
        acrossSlots.push({ num, r, c, len });
      }
      if (startsDown) {
        let len = 0;
        while (isOpen(grid, r + len, c)) len++;
        downSlots.push({ num, r, c, len });
      }
    }
  }
  return { acrossSlots, downSlots };
}

// True when the block pattern has 180-degree rotational symmetry.
function isSymmetric(grid) {
  const R = grid.length, C = grid[0].length;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const a = grid[r][c] === '#';
      const b = grid[R - 1 - r][C - 1 - c] === '#';
      if (a !== b) return false;
    }
  }
  return true;
}

// True when every open cell is reachable from every other open cell via
// 4-directional adjacency (a single connected region). Vacuously true when
// there are no open cells.
function isConnected(grid) {
  const R = grid.length, C = grid[0].length;
  let start = null;
  let openCount = 0;
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (isOpen(grid, r, c)) {
        openCount++;
        if (!start) start = [r, c];
      }
    }
  }
  if (openCount === 0) return true;
  const seen = new Set([start[0] * C + start[1]]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (isOpen(grid, nr, nc) && !seen.has(nr * C + nc)) {
        seen.add(nr * C + nc);
        stack.push([nr, nc]);
      }
    }
  }
  return seen.size === openCount;
}

// Open cells no slot covers: both runs through the cell have length 1, so no
// clue can ever supply its content. Returned in row-major order as { r, c }.
function uncluedCells(grid) {
  const out = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!isOpen(grid, r, c)) continue;
      const inAcross = isOpen(grid, r, c - 1) || isOpen(grid, r, c + 1);
      const inDown   = isOpen(grid, r - 1, c) || isOpen(grid, r + 1, c);
      if (!inAcross && !inDown) out.push({ r, c });
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { deriveSlots, isSymmetric, isConnected, uncluedCells };
