'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ringFor } = require('../src/layout');
const { SVG_PAD_H, SVG_PAD_V } = require('../src/layoutStadium');

test('stadium: ring.N equals N', () => {
  assert.equal(ringFor(48, 'stadium').ring.N, 48);
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

test('stadium: throws for odd N', () => {
  assert.throws(() => ringFor(5, 'stadium'), /even/);
});
