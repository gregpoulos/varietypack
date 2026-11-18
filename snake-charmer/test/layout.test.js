'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { autoShape, ringFor, assertRingFields, SHAPES } = require('../src/layout');
const { SVG_PAD_H, SVG_PAD_V } = require('../src/layoutStadium');

// The rule the builder uses when neither --shape nor the YAML names a shape: the S-shape
// when a double-turn ring exists for N, otherwise the stadium.

test('autoShape: double-turn when a double-turn ring exists for N', () => {
  assert.equal(autoShape(48), 'double-turn');
});

test('autoShape: stadium below the double-turn minimum', () => {
  assert.equal(autoShape(40), 'stadium');
});

test('autoShape: stadium when no double-turn ring exists for that N', () => {
  assert.equal(autoShape(44), 'stadium');
});

test('ringFor: with no shape, the double-turn ring when one exists for N', () => {
  assert.deepEqual(ringFor(48), { shape: 'double-turn', ring: SHAPES['double-turn'].computeRing(48), fellBack: false });
});

test('ringFor: with no shape, falls back to the stadium and says so', () => {
  assert.deepEqual(ringFor(8), { shape: 'stadium', ring: SHAPES.stadium.computeRing(8), fellBack: true });
});

test('ringFor: a named shape is used as is and never falls back', () => {
  assert.deepEqual(ringFor(8, 'circle'), { shape: 'circle', ring: SHAPES.circle.computeRing(8), fellBack: false });
  assert.throws(() => ringFor(44, 'double-turn'));   // no double-turn ring exists for 44
});

test('ringFor: an unknown shape throws', () => {
  assert.throws(() => ringFor(8, 'oval'), /unknown shape "oval"/);
});

// ringFor repeats autoShape's rule so the build computes the double-turn ring once.
test('ringFor agrees with autoShape on the automatic choice', () => {
  for (const N of [8, 40, 44, 48]) assert.equal(ringFor(N).shape, autoShape(N), `N=${N}`);
});

// ── per-shape rings ──────────────────────────────────────────────────────────

test('ringFor: ring.N equals N for every shape', () => {
  const rows = [
    { shape: 'stadium', Ns: [48] },
    { shape: 'double-turn', Ns: [42, 72] },   // 42 is the smallest supported
    { shape: 'turn', Ns: [20, 28, 32, 48] },
  ];
  for (const { shape, Ns } of rows) {
    for (const N of Ns) assert.equal(ringFor(N, shape).ring.N, N, `${shape} N=${N}`);
  }
});

test('stadium: throws for odd N', () => {
  assert.throws(() => ringFor(5, 'stadium'), /even/);
});

test('circle: nStraight=0 and nCurve=N/2', () => {
  const { ring } = ringFor(48, 'circle');
  assert.equal(ring.nStraight, 0);
  assert.equal(ring.nCurve, ring.N / 2);
});

test('circle: square content area (padding-stripped dimensions equal)', () => {
  const { ring } = ringFor(48, 'circle');
  const contentW = ring.svgWidth  - 2 * SVG_PAD_H;
  const contentH = ring.svgHeight - 2 * SVG_PAD_V;
  assert.ok(
    Math.abs(contentW - contentH) < 0.01,
    `circle content area not square: ${contentW} × ${contentH}`
  );
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
    assert.throws(() => ringFor(N, 'double-turn'), message, `N=${N}`);
  }
});

test('turn: throws for unsupported N', () => {
  const cases = [
    [6,  /divisible by 4/],
    [8,  /too small/],   // rArmInner negative: arm curve cells degenerate
    [12, /too small/],
    [16, /too small/],
  ];
  for (const [N, message] of cases) {
    assert.throws(() => ringFor(N, 'turn'), message, `N=${N}`);
  }
});

test('assertRingFields: passes a complete ring and names the missing fields otherwise', () => {
  const { ring } = ringFor(72, 'double-turn');
  assert.doesNotThrow(() => assertRingFields(ring, 'double-turn'));
  assert.throws(
    () => assertRingFields({ N: 72, svgWidth: 400 }, 'double-turn'),
    /missing required fields.*svgHeight/s
  );
});
