// Grid geometry shared by the validator, the prepare step and the browser engine — the
// engine imports it, which is what keeps its band traversal and the validator's from
// drifting apart. An ES module, like the rest of the page code (root CLAUDE.md →
// Shared library pattern).

function bandIndexOf(row, col, N) {
  return Math.min(row - 1, col - 1, N - row, N - col);
}

function centerFlatIndex(N) {
  // 0-indexed flat index of the center cell (only meaningful for odd N)
  const mid = (N - 1) / 2;
  return mid * N + mid;
}

function centerN(N) {
  // 1-indexed flat ID of the center cell (only meaningful for odd N)
  return centerFlatIndex(N) + 1;
}

function rowCells(r, N) {
  // Returns array of 1-indexed flat cell IDs left to right for row r (0-indexed),
  // skipping the center cell of an odd grid.
  const ids = [];
  for (let c = 1; c <= N; c++) {
    const id = r * N + c;
    if (N % 2 === 0 || id !== centerN(N)) ids.push(id);
  }
  return ids;
}

function bandCells(k, N) {
  // Returns array of 1-indexed flat cell IDs in clockwise order for band k (0-indexed).
  // Count = 4*(N-1-2k) for ring bands; for the center cell (odd N, k=(N-1)/2) returns
  // [centerN(N)]. Cell n = (row-1)*N + col (1-indexed row and col).
  const cells = [];
  // Top edge: row k+1, cols k+1 → N-k
  for (let col = k + 1; col <= N - k; col++)
    cells.push(k * N + col);
  // Right edge: col N-k, rows k+2 → N-k
  for (let row = k + 2; row <= N - k; row++)
    cells.push((row - 1) * N + (N - k));
  // Bottom edge: row N-k, cols N-k-1 → k+1 (right to left)
  for (let col = N - k - 1; col >= k + 1; col--)
    cells.push((N - k - 1) * N + col);
  // Left edge: col k+1, rows N-k-1 → k+2 (bottom to top)
  for (let row = N - k - 1; row >= k + 2; row--)
    cells.push((row - 1) * N + (k + 1));
  return cells;
}

// Whether band k reads cell `id` against its row: along the band's bottom edge, corners
// included, it runs right to left. There a rebus may be spelled backward (sameCell in
// shared/build/validateEntry.js).
function onBandBottomEdge(k, id, N) {
  return Math.floor((id - 1) / N) === N - 1 - k;
}

// The cell one step (dr, dc) from cell `id` on the grid, jumping over the center block of
// an odd grid; null off the edge. Arrow keys move this way in both modes, in the solver
// and the studio editor alike.
function arrowTarget(id, dr, dc, N) {
  const row = Math.ceil(id / N) + dr;
  const col = ((id - 1) % N) + 1 + dc;
  if (row < 1 || row > N || col < 1 || col > N) return null;
  const next = (row - 1) * N + col;
  // The center is never on an edge, so the cell past it is always on the grid.
  return N % 2 === 1 && next === centerN(N) ? next + dr * N + dc : next;
}

export { bandIndexOf, bandCells, rowCells, centerFlatIndex, centerN, onBandBottomEdge, arrowTarget };
