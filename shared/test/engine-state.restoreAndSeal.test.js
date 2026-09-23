'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { restoreAndSeal } = require('../../shared/engine-state');

// restoreAndSeal consolidates each engine's restore-time epilogue: restore saved
// state, seal the completion latch if the restored board is solved, then repaint
// the solved-board UI — in that exact order, before the first focusCell(). This
// pins the order with a real assertion rather than trusting the prose comment
// above the function.
test('restoreAndSeal runs restore -> seal -> repaint in that order and returns the composing cell', () => {
  const calls = [];
  const out = restoreAndSeal({
    restoreState: () => calls.push('restore'),
    checker: { isSolved: () => true, repaintIfSolved: () => calls.push('repaint') },
    latch:   { sealIfSolved: (s) => calls.push(`seal:${s}`) },
    composer:{ getComposing: () => 7 },
  });
  assert.deepEqual(calls, ['restore', 'seal:true', 'repaint']);
  assert.equal(out, 7);
});
