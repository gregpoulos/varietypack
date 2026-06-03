'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout } = require('../src/layout');
const { W_CELL, H_CELL, SVG_PAD_H, SVG_PAD_V } = require('../src/layoutTurn');

// Total 96 cells, loops=2 → N=48 (48 % 4 === 0)
const SAMPLE_ENTRIES = [
  { length: 4 }, { length: 5 }, { length: 7 }, { length: 8 },
  { length: 4 }, { length: 5 }, { length: 4 }, { length: 8 },
  { length: 6 }, { length: 4 }, { length: 5 }, { length: 6 },
  { length: 8 }, { length: 5 }, { length: 4 }, { length: 4 },
  { length: 3 }, { length: 6 },
];

test('computeLayout: turn shape returns {ring}', () => {
  const result = computeLayout(SAMPLE_ENTRIES, 2, 'turn');
  assert.ok(result && typeof result === 'object');
  assert.ok(result.ring && typeof result.ring === 'object');
  assert.equal(result.cells, undefined);
});

test('computeLayout: turn shape ring.N equals N', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES, 2, 'turn');
  assert.equal(ring.N, 48);
});

test('computeLayout: turn shape ring geometry is correct for N=48', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES, 2, 'turn');
  const N = 48;
  const nArmCurve    = Math.max(1, Math.round(N / 12));
  const nBodyInner   = 2 * nArmCurve;
  const nBodyOuter   = 4 * nArmCurve;
  const nArmStraight = (N - 8 * nArmCurve) / 4;
  const rArmCenter   = nArmCurve * W_CELL / Math.PI;
  const rArmOuter    = rArmCenter + H_CELL / 2;
  const rArmInner    = rArmCenter - H_CELL / 2;
  const R_in         = nBodyInner * W_CELL / Math.PI;
  const R_out        = nBodyOuter * W_CELL / Math.PI;
  const D            = R_in + rArmCenter;
  const L            = nArmStraight * W_CELL;
  const cx           = R_out + H_CELL / 2 + SVG_PAD_H;
  const svgHeight    = 2 * (D + rArmOuter) + 2 * SVG_PAD_V;
  const cy           = svgHeight / 2;
  const svgWidth     = cx + L + rArmOuter + SVG_PAD_H;

  assert.equal(ring.nArmStraight, nArmStraight);
  assert.equal(ring.nArmCurve, nArmCurve);
  assert.equal(ring.nBodyInner, nBodyInner);
  assert.equal(ring.nBodyOuter, nBodyOuter);
  assert.ok(Math.abs(ring.rArmCenter - rArmCenter) < 0.01, `rArmCenter ${ring.rArmCenter} ≠ ${rArmCenter}`);
  assert.ok(Math.abs(ring.rArmOuter - rArmOuter) < 0.01, `rArmOuter ${ring.rArmOuter}`);
  assert.ok(Math.abs(ring.rArmInner - rArmInner) < 0.01, `rArmInner ${ring.rArmInner}`);
  assert.ok(Math.abs(ring.D - D) < 0.01, `D ${ring.D} ≠ ${D}`);
  assert.ok(Math.abs(ring.R_in - R_in) < 0.01, `R_in ${ring.R_in} ≠ ${R_in}`);
  assert.ok(Math.abs(ring.R_out - R_out) < 0.01, `R_out ${ring.R_out} ≠ ${R_out}`);
  assert.equal(ring.L, L);
  assert.ok(Math.abs(ring.cx - cx) < 0.01, `cx ${ring.cx} ≠ ${cx}`);
  assert.ok(Math.abs(ring.cy - cy) < 0.01, `cy ${ring.cy} ≠ ${cy}`);
  assert.ok(Math.abs(ring.svgWidth - svgWidth) < 0.01, `svgWidth ${ring.svgWidth} ≠ ${svgWidth}`);
  assert.ok(Math.abs(ring.svgHeight - svgHeight) < 0.01, `svgHeight ${ring.svgHeight} ≠ ${svgHeight}`);
});

test('computeLayout: turn shape throws when N is not divisible by 4', () => {
  assert.throws(
    () => computeLayout([{ length: 6 }], 1, 'turn'),  // N=6, not divisible by 4
    /divisible by 4/
  );
});

test('computeLayout: turn shape throws for N=8 (rArmInner negative)', () => {
  // N=8: nArmCurve=1, rArmCenter≈11.5, rArmInner≈-6.5 — arm curve cells degenerate
  assert.throws(
    () => computeLayout(Array.from({ length: 4 }, () => ({ length: 4 })), 2, 'turn'),
    /too small/
  );
});

test('computeLayout: turn shape throws for N=12 (rArmInner still negative)', () => {
  // N=12: nArmCurve=1, rArmCenter≈11.5, rArmInner≈-6.5 — same degenerate geometry
  assert.throws(
    () => computeLayout(Array.from({ length: 6 }, () => ({ length: 4 })), 2, 'turn'),
    /too small/
  );
});

test('computeLayout: turn shape throws for N=16 (rArmInner still negative)', () => {
  // N=16: nArmCurve=1, rArmCenter≈11.5, rArmInner≈-6.5 — same degenerate geometry
  assert.throws(
    () => computeLayout(Array.from({ length: 8 }, () => ({ length: 4 })), 2, 'turn'),
    /too small/
  );
});

test('computeLayout: turn shape accepts N=20 (minimum with rArmInner>0)', () => {
  // N=20: nArmCurve=2, rArmCenter≈22.9, rArmInner≈4.9 — valid geometry
  assert.doesNotThrow(
    () => computeLayout(Array.from({ length: 10 }, () => ({ length: 4 })), 2, 'turn')
  );
});

test('computeLayout: turn shape accepts N=28 (divisible by 4, not 12)', () => {
  // 14 entries × 4 cells, loops=2 → N=28
  const entries28 = Array.from({ length: 14 }, () => ({ length: 4 }));
  const { ring } = computeLayout(entries28, 2, 'turn');
  assert.equal(ring.N, 28);
  // nArmCurve = round(28/12) = round(2.33) = 2
  assert.equal(ring.nArmCurve, 2);
  assert.equal(ring.nBodyInner, 4);
  assert.equal(ring.nBodyOuter, 8);
  assert.equal(ring.nArmStraight, 3);  // (28 - 16) / 4
});

test('computeLayout: turn shape accepts N=32 (divisible by 4, not 12)', () => {
  // 16 entries × 4 cells, loops=2 → N=32
  const entries32 = Array.from({ length: 16 }, () => ({ length: 4 }));
  const { ring } = computeLayout(entries32, 2, 'turn');
  assert.equal(ring.N, 32);
  // nArmCurve = round(32/12) = round(2.67) = 3
  assert.equal(ring.nArmCurve, 3);
  assert.equal(ring.nBodyInner, 6);
  assert.equal(ring.nBodyOuter, 12);
  assert.equal(ring.nArmStraight, 2);  // (32 - 24) / 4
});

test('computeLayout: turn shape ring has no stadium-specific fields', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES, 2, 'turn');
  assert.equal(ring.nCurve,   undefined);
  assert.equal(ring.nStraight, undefined);
  assert.equal(ring.rCenter,  undefined);
});

