'use strict';

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

function bandCells(k, N) {
  // Returns array of 1-indexed flat cell IDs in clockwise order for band k (0-indexed).
  // Count = 4*(N-1-2k) for ring bands; for the center cell (odd N, k=(N-1)/2) returns [centerN(N)].
  // Cell n = (row-1)*N + col (1-indexed row and col).
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

module.exports = { bandIndexOf, bandCells, centerFlatIndex, centerN };
