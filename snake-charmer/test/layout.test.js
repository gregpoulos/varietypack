'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { autoShape, ringFor, SHAPES } = require('../src/layout');

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
