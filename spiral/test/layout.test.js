'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeCells, cellsOfEntries } = require('../src/layout.mjs');

test('computeCells: returns exactly totalCells cells', () => {
  assert.equal(computeCells(40).length, 40);
  assert.equal(computeCells(78).length, 78);
  assert.equal(computeCells(100).length, 100);
});

test('computeCells: cell_number is 1-indexed sequentially', () => {
  const cells = computeCells(5);
  assert.deepEqual(cells.map(c => c.cell_number), [1, 2, 3, 4, 5]);
});

test('computeCells: first cell starts at 12 o\'clock', () => {
  const cells = computeCells(40);
  assert.ok(Math.abs(cells[0].theta_start - (-Math.PI / 2)) < 1e-10);
});

test('computeCells: cell boundaries are contiguous', () => {
  const cells = computeCells(78);
  for (let i = 0; i < cells.length - 1; i++) {
    assert.ok(
      Math.abs(cells[i].theta_end - cells[i + 1].theta_start) < 1e-10,
      `cells[${i}].theta_end !== cells[${i + 1}].theta_start`
    );
  }
});

test('computeCells: all cells have approximately equal arc length', () => {
  const cells = computeCells(78);
  const arcs = cells.map(c => {
    const r_mid = (c.r_inner_start + c.r_outer_start) / 2;
    return r_mid * (c.theta_end - c.theta_start);
  });
  const mean = arcs.reduce((s, a) => s + a, 0) / arcs.length;
  for (const arc of arcs) {
    assert.ok(Math.abs(arc - mean) / mean < 0.02,
      `Arc ${arc.toFixed(2)} deviates >2% from mean ${mean.toFixed(2)}`);
  }
});

// Uses arbitrary constants (not the production values in builder.js) — this
// tests the invariant that cells stay within whatever bounds you request.
test('computeCells: cell radii stay within [R_HOLE, R_MAX]', () => {
  const opts = { R_HOLE: 38, R_MAX: 242, N_TURNS: 4 };
  const cells = computeCells(78, opts);
  for (const c of cells) {
    assert.ok(c.r_inner_start >= opts.R_HOLE - 0.01);
    assert.ok(c.r_outer_start <= opts.R_MAX + 0.01);
    assert.ok(c.r_inner_end   >= opts.R_HOLE - 0.01);
    assert.ok(c.r_outer_end   <= opts.R_MAX + 0.01);
  }
});

test('computeCells: cell 1 is outermost, last cell is innermost', () => {
  const cells = computeCells(40);
  const first = cells[0];
  const last  = cells[cells.length - 1];
  assert.ok(first.r_outer_start > last.r_outer_end,
    'cell 1 outer radius should exceed last cell outer radius');
});

test('computeCells: throws on non-integer totalCells', () => {
  assert.throws(() => computeCells(3.5), /positive integer/);
});

test('computeCells: throws on zero totalCells', () => {
  assert.throws(() => computeCells(0), /positive integer/);
});

// ── drawing geometry (shared by the builder, the engine and the studio) ──────

const geometry = require('../src/layout.mjs');
const { geometryFor, nTurnsFor, polar, cellPath, letterCenter, circleCenter, numberPosition,
        sizesFor, curlPath, boundaryPoints } = geometry;

const TAU = 2 * Math.PI;
const cells78 = computeCells(78, geometryFor(78));
const radiusOf = ([x, y]) => Math.hypot(x, y);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// A point is in the cell when its radius lies between the cell's inner and outer radii
// and its angle between theta_start and theta_end.
function insideCell(point, cell) {
  const r = radiusOf(point);
  const inner = Math.min(cell.r_inner_start, cell.r_inner_end);
  const outer = Math.max(cell.r_outer_start, cell.r_outer_end);
  const turned = (((Math.atan2(point[1], point[0]) - cell.theta_start) % TAU) + TAU) % TAU;
  return r >= inner && r <= outer && turned <= (cell.theta_end - cell.theta_start) + 1e-9;
}

test('cellPath: starts with M, ends with Z, and begins at the cell\'s inner start corner', () => {
  for (const cell of cells78) {
    const d = cellPath(cell);
    assert.ok(d.startsWith('M') && d.endsWith('Z'));
    const [x, y] = d.slice(1).split(' ')[0].split(',').map(Number);
    const [ex, ey] = polar(cell.r_inner_start, cell.theta_start);
    assert.ok(near(x, ex, 1e-3) && near(y, ey, 1e-3), `cell ${cell.cell_number}`);
  }
});

test('letterCenter, circleCenter and numberPosition each lie inside their cell', () => {
  for (const cell of cells78) {
    for (const place of [letterCenter, circleCenter, numberPosition]) {
      assert.ok(insideCell(place(cell), cell), `${place.name} of cell ${cell.cell_number}`);
    }
  }
});

test('boundaryPoints: the end edge of a cell is the start edge of the next', () => {
  for (let i = 0; i + 1 < cells78.length; i++) {
    const b = boundaryPoints(cells78[i]);
    const next = cells78[i + 1];
    const [ix, iy] = polar(next.r_inner_start, next.theta_start);
    const [ox, oy] = polar(next.r_outer_start, next.theta_start);
    assert.ok(near(b.inner[0], ix, 1e-6) && near(b.inner[1], iy, 1e-6), `inner ${i}`);
    assert.ok(near(b.outer[0], ox, 1e-6) && near(b.outer[1], oy, 1e-6), `outer ${i}`);
    assert.ok(near(radiusOf(b.mid), (radiusOf(b.inner) + radiusOf(b.outer)) / 2, 1e-6), `mid ${i}`);
  }
});

test('sizesFor: the circle fits the band, and a letter is larger than a cell number', () => {
  const s = sizesFor(geometryFor(78));
  assert.ok(s.band > 0 && s.numSize > 0);
  assert.ok(2 * s.circleRadius <= s.band + 1e-9);
  assert.ok(s.letterSize > s.numSize);
});

test('curlPath: leaves the last cell\'s inner edge and winds in toward the center', () => {
  const last = cells78[cells78.length - 1];
  const points = curlPath(last).trim().split(/\s+/).map(p => p.slice(1).split(',').map(Number));
  assert.ok(near(radiusOf(points[0]), last.r_inner_end, 1e-2));
  assert.ok(points.every(p => radiusOf(p) <= last.r_inner_end + 1e-2));
  assert.ok(radiusOf(points[points.length - 1]) < last.r_inner_end * 0.05);
});

test('nTurnsFor: at least 3, and never decreases as the cell count grows', () => {
  let prev = 0;
  for (let n = 1; n <= 300; n++) {
    const t = nTurnsFor(n);
    assert.ok(t >= 3, `n=${n}`);
    assert.ok(t >= prev, `n=${n}`);
    prev = t;
  }
});

test('computeCells: with no geometry given, lays out the spiral the puzzle page draws', () => {
  assert.deepEqual(computeCells(78), computeCells(78, geometryFor(78)));
});

test('cellsOfEntries: inward entries count up from cell 1, outward entries down from the last cell', () => {
  assert.deepEqual(cellsOfEntries([3, 2], 1, 1), [[1, 2, 3], [4, 5]]);
  assert.deepEqual(cellsOfEntries([2, 3], 5, -1), [[5, 4], [3, 2, 1]]);
});

test('cellsOfEntries: the two reading directions cover each cell exactly once, each', () => {
  const total = 12;
  const inward  = cellsOfEntries([5, 4, 3], 1, 1).flat();
  const outward = cellsOfEntries([2, 6, 4], total, -1).flat();
  const all = Array.from({ length: total }, (_, i) => i + 1);
  assert.deepEqual([...inward].sort((a, b) => a - b), all);
  assert.deepEqual([...outward].sort((a, b) => a - b), all);
});
