'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeCells } = require('../src/layout');

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
