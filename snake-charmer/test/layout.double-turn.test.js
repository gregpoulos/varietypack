'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ringFor, assertRingFields } = require('../src/layout');

const doubleTurnRing = N => ringFor(N, 'double-turn');

test('double-turn: ring.N equals N', () => {
  assert.equal(doubleTurnRing(72).ring.N, 72);
});

test('double-turn: invariant holds for multiple N values', () => {
  for (const N of [48, 72, 84, 96, 100, 120]) {
    const { ring } = doubleTurnRing(N);
    assert.equal(
      4 * ring.nArmStraight + 2 * ring.nMidStraight + 14 * ring.nArmCurve,
      N,
      `invariant failed for N=${N}`
    );
  }
});

test('double-turn: throws for unsupported N', () => {
  const cases = [
    [3,  /even/],
    [12, /requires N >=/],
    [22, /too small/],   // nMidStraight 0: middle arm empty
    [24, /too small/],
    [26, /too small/],
    [28, /too small/],   // rArmInner negative
    [36, /too small/],
    [40, /too small/],
    [44, /too small/],
  ];
  for (const [N, message] of cases) {
    assert.throws(() => doubleTurnRing(N), message, `N=${N}`);
  }
});

test('double-turn: accepts N=42 (smallest supported)', () => {
  assert.equal(doubleTurnRing(42).ring.N, 42);
});

test('assertRingFields: does not throw for a complete double-turn ring', () => {
  const { ring } = doubleTurnRing(72);
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
