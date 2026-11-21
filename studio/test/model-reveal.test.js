'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { revealDelta, planReveal } = require('../src/model/reveal');

const col = { top: 100, bottom: 500 };
const row = (top, h = 40) => ({ top, bottom: top + h });

test('a row inside the frame needs no scroll', () => assert.equal(revealDelta(col, row(200)), 0));
test('a row below the frame scrolls just far enough to show its bottom', () => assert.equal(revealDelta(col, row(480)), 20));
test('a row above the frame scrolls just far enough to show its top', () => assert.equal(revealDelta(col, row(70)), -30));

test('an active row already in view does not scroll', () => assert.equal(planReveal(col, row(300)), 0));
test('an active row out of view scrolls just far enough, not to an edge', () => {
  assert.equal(planReveal(col, row(520)), 60);
  assert.equal(planReveal(col, row(60)), -40);
});
test('with no active row there is nothing to do', () => assert.equal(planReveal(col, null), 0));
