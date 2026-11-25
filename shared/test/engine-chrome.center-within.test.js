'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { centerWithin } = require('../engine-chrome.mjs');

// A container showing y = 100..300 (200 tall, scrolled to 50) and an element at `top`,
// `height` tall; the scrollTo calls are recorded.
function centerCase(top, height, win) {
  const calls = [];
  const container = {
    getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
    clientHeight: 200,
    scrollTop: 50,
    scrollTo(o) { calls.push(o); },
  };
  const el = { getBoundingClientRect: () => ({ top, bottom: top + height, height }) };
  centerWithin(container, el, win);
  return calls;
}

const calmWin = { matchMedia: () => ({ matches: false }) };

test('centerWithin: an element below the middle scrolls down to center it', () => {
  assert.deepEqual(centerCase(280, 20, calmWin), [{ top: 50 + (280 - 100) - (200 - 20) / 2, behavior: 'smooth' }]);
});

test('centerWithin: an element already centered writes nothing', () => {
  assert.deepEqual(centerCase(190, 20, calmWin), []);
});

test('centerWithin: under reduced motion it jumps', () => {
  const win = { matchMedia: q => ({ matches: q === '(prefers-reduced-motion: reduce)' }) };
  assert.equal(centerCase(280, 20, win)[0].behavior, 'auto');
});
