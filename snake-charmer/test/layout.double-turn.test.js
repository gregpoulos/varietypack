'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeLayout, assertRingFields } = require('../src/layout');
const { W_CELL, H_CELL, SVG_PAD_H } = require('../src/layoutDoubleTurn');

// N=72, loops=2 → 72 cells per loop
const ENTRIES_72 = Array.from({ length: 12 }, () => ({ length: 12 }));

// N=84, loops=2 → 84 cells per loop
const ENTRIES_84 = Array.from({ length: 12 }, () => ({ length: 14 }));

// N=96, loops=2 → 96 cells per loop
const ENTRIES_96 = Array.from({ length: 12 }, () => ({ length: 16 }));

test('computeLayout: double-turn returns {ring}', () => {
  const result = computeLayout(ENTRIES_72, 2, 'double-turn');
  assert.ok(result && typeof result === 'object');
  assert.ok(result.ring && typeof result.ring === 'object');
  assert.equal(result.cells, undefined);
});

test('computeLayout: double-turn ring.N equals N', () => {
  const { ring } = computeLayout(ENTRIES_72, 2, 'double-turn');
  assert.equal(ring.N, 72);
});

test('computeLayout: double-turn N=72 ring geometry', () => {
  const { ring } = computeLayout(ENTRIES_72, 2, 'double-turn');
  // nArmCurve = max(1, round(72/24)) = 3
  // R = 72 - 14*3 = 30; R%6=0 → delta=3; nMidStraight=(30-12)/6=3; nArmStraight=6
  assert.equal(ring.nArmCurve, 3);
  assert.equal(ring.nBodyInner, 6);
  assert.equal(ring.nBodyOuter, 12);
  assert.equal(ring.nArmStraight, 6);
  assert.equal(ring.nMidStraight, 3);
  // Check invariant
  assert.equal(4 * ring.nArmStraight + 2 * ring.nMidStraight + 14 * ring.nArmCurve, 72);
  // Spot-check geometry
  const rArmCenter = 3 * W_CELL / Math.PI;
  assert.ok(Math.abs(ring.rArmCenter - rArmCenter) < 0.01, `rArmCenter ${ring.rArmCenter}`);
  const D = 3 * rArmCenter;
  assert.ok(Math.abs(ring.D - D) < 0.01, `D ${ring.D}`);
  const L = 6 * W_CELL;
  assert.equal(ring.L, L);
  const Lm = 3 * W_CELL;
  assert.equal(ring.Lm, Lm);
});

test('computeLayout: double-turn N=84 ring geometry (delta=4)', () => {
  const { ring } = computeLayout(ENTRIES_84, 2, 'double-turn');
  // nArmCurve = max(1, round(84/24)) = round(3.5) = 4
  // R = 84 - 56 = 28; R%6=4 → delta=4; nMidStraight=(28-16)/6=2; nArmStraight=6
  assert.equal(ring.nArmCurve, 4);
  assert.equal(ring.nArmStraight, 6);
  assert.equal(ring.nMidStraight, 2);
  assert.equal(4 * ring.nArmStraight + 2 * ring.nMidStraight + 14 * ring.nArmCurve, 84);
});

test('computeLayout: double-turn N=96 ring geometry (delta=4)', () => {
  const { ring } = computeLayout(ENTRIES_96, 2, 'double-turn');
  // nArmCurve = max(1, round(96/24)) = 4
  // R = 96 - 56 = 40; R%6=4 → delta=4; nMidStraight=(40-16)/6=4; nArmStraight=8
  assert.equal(ring.nArmCurve, 4);
  assert.equal(ring.nArmStraight, 8);
  assert.equal(ring.nMidStraight, 4);
  assert.equal(4 * ring.nArmStraight + 2 * ring.nMidStraight + 14 * ring.nArmCurve, 96);
});

test('computeLayout: double-turn invariant holds for multiple N values', () => {
  for (const N of [48, 72, 84, 96, 100, 120]) {
    const entries = Array.from({ length: N }, () => ({ length: 2 }));
    const { ring } = computeLayout(entries, 2, 'double-turn');
    assert.equal(
      4 * ring.nArmStraight + 2 * ring.nMidStraight + 14 * ring.nArmCurve,
      N,
      `invariant failed for N=${N}`
    );
  }
});

test('computeLayout: double-turn ring has no stadium- or turn-specific fields', () => {
  const { ring } = computeLayout(ENTRIES_72, 2, 'double-turn');
  assert.equal(ring.nCurve, undefined);
  assert.equal(ring.nStraight, undefined);
  assert.equal(ring.cx, undefined);   // turn uses cx; double-turn uses cx_L / cx_R
});

test('computeLayout: double-turn ring has expected positional fields', () => {
  const { ring } = computeLayout(ENTRIES_72, 2, 'double-turn');
  for (const f of ['cx_L', 'cx_R', 'cy', 'cy_L', 'cy_R', 'cy_top', 'cy_bot', 'svgWidth', 'svgHeight']) {
    assert.ok(typeof ring[f] === 'number', `ring.${f} should be a number`);
  }
});

test('computeLayout: double-turn throws for odd N', () => {
  assert.throws(
    () => computeLayout([{ length: 3 }], 1, 'double-turn'),  // N=3
    /even/
  );
});

test('computeLayout: double-turn throws when N too small (N=12)', () => {
  // nArmCurve=max(1,round(12/24))=1; R=12-14=-2 < 0 → "requires N >="
  assert.throws(
    () => computeLayout(Array.from({ length: 12 }, () => ({ length: 2 })), 2, 'double-turn'),
    /requires N >=/
  );
});

test('computeLayout: double-turn throws for N=24 (nMidStraight would be -1)', () => {
  // N=24: nArmCurve=1, R=10, rem6=4, delta=4 → nMidStraight=(10-16)/6=-1
  assert.throws(
    () => computeLayout(Array.from({ length: 24 }, () => ({ length: 2 })), 2, 'double-turn'),
    /too small/
  );
});

test('computeLayout: double-turn throws for N=22 (nMidStraight=0, middle arm empty)', () => {
  // N=22: nArmCurve=1, R=8, rem6=2, delta=2 → nMidStraight=(8-8)/6=0 — visually broken
  assert.throws(
    () => computeLayout(Array.from({ length: 22 }, () => ({ length: 2 })), 2, 'double-turn'),
    /too small/
  );
});

test('computeLayout: double-turn throws for N=26 (nMidStraight=0, middle arm empty)', () => {
  // N=26: nArmCurve=1, R=12, rem6=0, delta=3 → nMidStraight=(12-12)/6=0 — visually broken
  assert.throws(
    () => computeLayout(Array.from({ length: 26 }, () => ({ length: 2 })), 2, 'double-turn'),
    /too small/
  );
});

test('computeLayout: double-turn throws for N=28 (rArmInner negative, nArmCurve=1)', () => {
  // N=28: nArmCurve=1, rArmCenter≈11.5, rArmInner≈-6.5 — arm curve cells degenerate
  assert.throws(
    () => computeLayout(Array.from({ length: 28 }, () => ({ length: 2 })), 2, 'double-turn'),
    /too small/
  );
});

test('computeLayout: double-turn throws for N=36 (rArmInner ok but nMidStraight=0)', () => {
  // N=36: nArmCurve=2, rArmInner≈4.9 — rArmInner ok, but R=8, rem6=2, delta=2 → nMidStraight=0
  assert.throws(
    () => computeLayout(Array.from({ length: 36 }, () => ({ length: 2 })), 2, 'double-turn'),
    /too small/
  );
});

test('computeLayout: double-turn throws for N=40 (rArmInner ok but nMidStraight=0)', () => {
  // N=40: nArmCurve=2, R=12, rem6=0, delta=3 → nMidStraight=(12-12)/6=0
  assert.throws(
    () => computeLayout(Array.from({ length: 40 }, () => ({ length: 2 })), 2, 'double-turn'),
    /too small/
  );
});

test('computeLayout: double-turn accepts N=42 (minimum with rArmInner>0 and nMidStraight>=1)', () => {
  // N=42: nArmCurve=2, rArmInner≈4.9, R=14, rem6=2, delta=2 → nMidStraight=1
  assert.doesNotThrow(
    () => computeLayout(Array.from({ length: 42 }, () => ({ length: 2 })), 2, 'double-turn')
  );
});

test('computeLayout: double-turn throws for N=44 (nMidStraight=0, first invalid N above minimum)', () => {
  // N=44: nArmCurve=2, R=16, rem6=4, delta=4 → nMidStraight=(16-16)/6=0
  assert.throws(
    () => computeLayout(Array.from({ length: 44 }, () => ({ length: 2 })), 2, 'double-turn'),
    /too small/
  );
});

test('assertRingFields: does not throw for a complete double-turn ring', () => {
  const { ring } = computeLayout(ENTRIES_72, 2, 'double-turn');
  assert.doesNotThrow(() => assertRingFields(ring, 'double-turn'));
});

test('assertRingFields: throws with clear message when fields are missing', () => {
  assert.throws(
    () => assertRingFields({ N: 72, svgWidth: 400 }, 'double-turn'),
    /missing required fields/
  );
});

test('assertRingFields: error message lists the missing field names', () => {
  assert.throws(
    () => assertRingFields({ N: 72, svgWidth: 400 }, 'double-turn'),
    /svgHeight/
  );
});
