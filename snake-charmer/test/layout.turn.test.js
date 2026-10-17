'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ringFor } = require('../src/layout');

const turnRing = N => ringFor(N, 'turn');

test('turn: throws for unsupported N', () => {
  const cases = [
    [6,  /divisible by 4/],
    [8,  /too small/],   // rArmInner negative: arm curve cells degenerate
    [12, /too small/],
    [16, /too small/],
  ];
  for (const [N, message] of cases) {
    assert.throws(() => turnRing(N), message, `N=${N}`);
  }
});

test('turn: accepts supported N, with ring.N equal to N', () => {
  for (const N of [20, 28, 32, 48]) {
    assert.equal(turnRing(N).ring.N, N);
  }
});
