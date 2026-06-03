'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout } = require('../src/layout');
const { W_CELL, H_CELL, SVG_PAD_H, SVG_PAD_V } = require('../src/layoutStadium');

// Total: 96 cells, loops=2, ringSize=48
const SAMPLE_ENTRIES = [
  { length: 4 },  // 0: MALL
  { length: 5 },  // 1: IMAGO
  { length: 7 },  // 2: DELBERT
  { length: 8 },  // 3: HAMILTON
  { length: 4 },  // 4: ICKY
  { length: 5 },  // 5: LIETO
  { length: 4 },  // 6: TOFU
  { length: 8 },  // 7: GUESSWHO
  { length: 6 },  // 8: DISMAL
  { length: 4 },  // 9: LIMA
  { length: 5 },  // 10: GODEL
  { length: 6 },  // 11: BERTHA
  { length: 8 },  // 12: MILTONIC
  { length: 5 },  // 13: KYLIE
  { length: 4 },  // 14: TOTO
  { length: 4 },  // 15: FUGU
  { length: 3 },  // 16: ESS
  { length: 6 },  // 17: WHODIS
];

test('computeLayout: returns {ring} object', () => {
  const result = computeLayout(SAMPLE_ENTRIES, 2);
  assert.ok(result && typeof result === 'object');
  assert.ok(result.ring && typeof result.ring === 'object');
  assert.equal(result.cells, undefined);
});

test('computeLayout: ring.N equals ringSize', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES, 2);
  assert.equal(ring.N, 48);
});

test('computeLayout: ring geometry is correct for sample puzzle (N=48)', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES, 2);
  const N = 48;
  const nCurve = Math.floor(N / 4);           // 12
  const nStraight = N / 2 - nCurve;           // 12
  const rCenter = nCurve * W_CELL / Math.PI;  // ≈137.51
  const rOuter = rCenter + H_CELL / 2;        // ≈155.51
  const rInner = rCenter - H_CELL / 2;        // ≈119.51
  const L = nStraight * W_CELL;               // 432
  const svgWidth = 2 * (rOuter + SVG_PAD_H) + L;   // ≈823.02
  const svgHeight = 2 * (rOuter + SVG_PAD_V);        // ≈319.02

  assert.equal(ring.nCurve, nCurve,   `nCurve should be ${nCurve}`);
  assert.equal(ring.nStraight, nStraight, `nStraight should be ${nStraight}`);
  assert.ok(Math.abs(ring.rCenter - rCenter) < 0.01,
    `rCenter ${ring.rCenter} ≠ ${rCenter}`);
  assert.ok(Math.abs(ring.rOuter - rOuter) < 0.01,
    `rOuter ${ring.rOuter} ≠ ${rOuter}`);
  assert.ok(Math.abs(ring.rInner - rInner) < 0.01,
    `rInner ${ring.rInner} ≠ ${rInner}`);
  assert.ok(Math.abs(ring.L - L) < 0.01,
    `L ${ring.L} ≠ ${L}`);
  assert.ok(Math.abs(ring.svgWidth - svgWidth) < 0.01,
    `svgWidth ${ring.svgWidth} ≠ ${svgWidth}`);
  assert.ok(Math.abs(ring.svgHeight - svgHeight) < 0.01,
    `svgHeight ${ring.svgHeight} ≠ ${svgHeight}`);
  assert.ok(Math.abs(ring.cx - svgWidth / 2) < 0.01, 'cx should be svgWidth/2');
  assert.ok(Math.abs(ring.cy - svgHeight / 2) < 0.01, 'cy should be svgHeight/2');
  assert.equal(ring.svgSize, undefined, 'svgSize should be gone');
});

test('computeLayout: circle shape sets nStraight=0 and nCurve=N/2', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES, 2, 'circle');
  assert.equal(ring.nStraight, 0);
  assert.equal(ring.nCurve, ring.N / 2);
});

test('computeLayout: circle shape has square content area (padding-stripped dimensions equal)', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES, 2, 'circle');
  const contentW = ring.svgWidth  - 2 * SVG_PAD_H;
  const contentH = ring.svgHeight - 2 * SVG_PAD_V;
  assert.ok(
    Math.abs(contentW - contentH) < 0.01,
    `circle content area not square: ${contentW} × ${contentH}`
  );
});

test('computeLayout: explicit shape=stadium matches default behaviour', () => {
  const defaultResult = computeLayout(SAMPLE_ENTRIES, 2);
  const explicitResult = computeLayout(SAMPLE_ENTRIES, 2, 'stadium');
  assert.deepEqual(explicitResult.ring, defaultResult.ring);
});

test('computeLayout: stadium throws for odd N', () => {
  // 10 total cells, loops=2 → N=5 (odd)
  assert.throws(
    () => computeLayout([{ length: 5 }, { length: 5 }], 2, 'stadium'),
    /even/
  );
});

test('computeLayout: defaults to loops=2 when second argument omitted', () => {
  const { ring } = computeLayout(SAMPLE_ENTRIES);
  assert.equal(ring.N, 48);
});

test('computeLayout: works for loops=3', () => {
  const entries = [{ length: 6 }, { length: 6 }, { length: 6 }];
  const { ring } = computeLayout(entries, 3);
  assert.equal(ring.N, 6);
});
