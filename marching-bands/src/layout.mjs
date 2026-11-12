// Grid geometry shared by the validator, the prepare step and the browser engine — the
// engine imports it, which is what keeps its band traversal and the validator's from
// drifting apart. An ES module, like the rest of the page code (docs/ARCHITECTURE.md →
// Shared library).

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

// The step { dr, dc } a cursor takes from cell `id` along the active row or band, for the
// chevron on that cell's leading edge; null where there is no next cell within it (the
// last cell of a row or band, whose successor is in another row or band, and the lone
// center cell's band). `cells` is the row's or band's cells in traversal order. A row
// runs right; a band's step is the direction to its next cell, so a corner cell already
// points down its new side.
function leadingStep(mode, cells, id, N) {
  const pos = cells.indexOf(id);
  if (pos < 0 || pos === cells.length - 1) return null;
  if (mode === 'row') return { dr: 0, dc: 1 };
  const rc = n => [Math.floor((n - 1) / N), (n - 1) % N];
  const [r1, c1] = rc(id), [r2, c2] = rc(cells[pos + 1]);
  return { dr: Math.sign(r2 - r1), dc: Math.sign(c2 - c1) };
}

// The open chevron "<" path for cell `id` on its leading edge, as SVG path data (empty
// for a null step): both arms on the edge, spanning it, and the tip a little past it at
// its middle, pointing along the step. `size` is the cell's side. Cells sit at
// (col * size, row * size), the board's origin.
function chevronPath(id, step, N, size) {
  if (!step) return '';
  const { dr, dc } = step;
  const x = ((id - 1) % N) * size, y = Math.floor((id - 1) / N) * size;
  const mx = x + size / 2 + dc * size / 2, my = y + size / 2 + dr * size / 2;
  // The edge runs perpendicular to the step; the tip leaves by 15% of a cell.
  const px = Math.abs(dr) * size / 2, py = Math.abs(dc) * size / 2;
  const tip = size * 0.15;
  return `M${mx - px},${my - py} L${mx + dc * tip},${my + dr * tip} L${mx + px},${my + py}`;
}

export {
  bandIndexOf, bandCells, rowCells, centerFlatIndex, centerN, onBandBottomEdge, arrowTarget,
  leadingStep, chevronPath,
};
