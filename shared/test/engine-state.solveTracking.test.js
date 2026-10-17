'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupSolveTracking, syncSolveState } = require('../engine-state.mjs');

// setupSolveTracking with the page swapped out: a fake clock and visibility, a puzzle
// root that records events, and a postMessage that records messages.
function makeTracking({ now, onComplete } = {}) {
  let vis;
  const { timer, latch } = setupSolveTracking({
    puzzleRoot:  { dispatchEvent: () => {} },
    data:        { kind: 'spiral', title: 'T', date: '2026', boardHash: 'abc' },
    getSolution: () => 'a.b',
    saveState:   () => {},
    onComplete,
    now,
    listenVisibility: fn => { vis = fn; },
    _postMessage: () => {},
  });
  return { timer, latch, hide: () => vis(true), show: () => vis(false) };
}

test('solving stops the clock: the completion time is the time that stays', () => {
  let t = 0, completedAt = null;
  const { timer, latch, hide, show } = makeTracking({ now: () => t, onComplete: ms => { completedAt = ms; } });
  timer.onFirstInput();
  t = 100;
  latch.check(true);
  t = 5000; hide();
  t = 6000; show();
  t = 9000;
  assert.strictEqual(completedAt, 100);
  assert.strictEqual(timer.getElapsedMs(), 100);
});

// ── syncSolveState ────────────────────────────────────────────────────────────

// Runs syncSolveState on a board in the given state; returns the banner's hidden flag
// and every value the latch was told.
function syncOn({ filled, solved }) {
  const doneWrong = { hidden: undefined };
  const told = [];
  syncSolveState({
    checker: { isBoardFilled: () => filled, isSolved: () => solved },
    latch: { check: s => told.push(s) },
    doneWrong,
  });
  return { bannerHidden: doneWrong.hidden, told };
}

test('syncSolveState: a board with empty cells shows no banner and is not solved', () => {
  assert.deepEqual(syncOn({ filled: false, solved: false }), { bannerHidden: true, told: [false] });
});

test('syncSolveState: a filled but wrong board shows the done-wrong banner', () => {
  assert.deepEqual(syncOn({ filled: true, solved: false }), { bannerHidden: false, told: [false] });
});

test('syncSolveState: a solved board hides the banner and tells the latch', () => {
  assert.deepEqual(syncOn({ filled: true, solved: true }), { bannerHidden: true, told: [true] });
});
