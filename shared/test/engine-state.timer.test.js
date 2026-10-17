'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupTimer } = require('../engine-state.mjs');

// Helper: create a timer with controllable time and visibility, no side effects.
function makeTimer(opts = {}) {
  let visHandler;
  return {
    timer: setupTimer({
      now: opts.now ?? (() => 0),
      onPause: opts.onPause ?? (() => {}),
      listenVisibility: (fn) => { visHandler = fn; },
    }),
    hide:  () => visHandler(true),
    show:  () => visHandler(false),
  };
}

test('getElapsedMs returns 0 before first input', () => {
  const { timer } = makeTimer({ now: () => 1000 });
  assert.strictEqual(timer.getElapsedMs(), 0);
});

test('onFirstInput starts the clock', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.onFirstInput();
  t = 2000;
  assert.strictEqual(timer.getElapsedMs(), 1000);
});

test('onFirstInput is idempotent — second call does not reset the start time', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.onFirstInput();
  t = 1100;
  timer.onFirstInput(); // must not move the start point forward
  t = 2000;
  assert.strictEqual(timer.getElapsedMs(), 1000); // 2000 − 1000, not 2000 − 1100
});

test('restoreMs loads activeMs without starting the clock', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.restoreMs(5000);
  t = 9000;
  assert.strictEqual(timer.getElapsedMs(), 5000); // clock not running — no elapsed added
});

test('restoreMs + onFirstInput accumulates from restored base', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.restoreMs(5000);
  timer.onFirstInput();
  t = 2000;
  assert.strictEqual(timer.getElapsedMs(), 6000); // 5000 + (2000 − 1000)
});

test('visibilitychange hidden folds clock and calls onPause', () => {
  let t = 1000;
  let pauseCalls = 0;
  const { timer, hide } = makeTimer({ now: () => t, onPause: () => pauseCalls++ });
  timer.onFirstInput();
  t = 3000;
  hide();
  assert.strictEqual(timer.getElapsedMs(), 2000);
  assert.strictEqual(pauseCalls, 1);
});

test('visibilitychange hidden then visible resumes accumulation', () => {
  let t = 1000;
  const { timer, hide, show } = makeTimer({ now: () => t });
  timer.onFirstInput();
  t = 3000;
  hide();              // fold: activeMs = 2000, runningSince = null
  t = 10000;           // time passes while hidden — should NOT count
  show();              // resume: runningSince = 10000
  t = 11000;
  assert.strictEqual(timer.getElapsedMs(), 3000); // 2000 + (11000 − 10000)
});

test('visibilitychange hidden before first input does not start clock and does not call onPause', () => {
  let t = 1000;
  let pauseCalls = 0;
  const { timer, hide, show } = makeTimer({ now: () => t, onPause: () => pauseCalls++ });
  hide();               // hidden before any input
  show();
  timer.onFirstInput();
  t = 2000;
  assert.strictEqual(timer.getElapsedMs(), 1000);
  assert.strictEqual(pauseCalls, 0); // onPause not called — clock never started
});

test('hidden before first input does not resume clock on visible', () => {
  let t = 1000;
  const { timer, hide, show } = makeTimer({ now: () => t });
  hide();
  show();  // should not start clock (no first input yet)
  t = 5000;
  assert.strictEqual(timer.getElapsedMs(), 0);
});

test('reset zeroes elapsed time and stops accumulation', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.onFirstInput();
  t = 3000;
  timer.reset();
  t = 5000; // more time passes after reset
  assert.strictEqual(timer.getElapsedMs(), 0);
});

test('reset clears started so onPause is not called on subsequent hide', () => {
  let t = 1000;
  let pauseCalls = 0;
  const { timer, hide } = makeTimer({ now: () => t, onPause: () => pauseCalls++ });
  timer.onFirstInput();
  t = 2000;
  timer.reset();
  hide();
  assert.strictEqual(pauseCalls, 0);
});

test('after reset, onFirstInput can restart the clock', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.onFirstInput();
  t = 2000;
  timer.reset();
  timer.onFirstInput(); // restart
  t = 3000;
  assert.strictEqual(timer.getElapsedMs(), 1000); // only (3000 - 2000) counted
});

test('restoreMs with non-number argument defaults to 0', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.restoreMs(undefined);
  assert.strictEqual(timer.getElapsedMs(), 0);
  timer.restoreMs(null);
  assert.strictEqual(timer.getElapsedMs(), 0);
  timer.restoreMs(-1);
  assert.strictEqual(timer.getElapsedMs(), 0);
});

test('stop banks the running stretch and freezes the clock', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.onFirstInput();
  t = 1500;
  timer.stop();
  t = 9000;
  assert.strictEqual(timer.getElapsedMs(), 500);
});

test('a stopped clock stays stopped through hide, show and input, and saves nothing more', () => {
  let t = 1000, pauses = 0;
  const { timer, hide, show } = makeTimer({ now: () => t, onPause: () => pauses++ });
  timer.onFirstInput();
  t = 1500;
  timer.stop();
  t = 2000; hide();
  t = 3000; show();
  timer.onFirstInput();
  t = 9000;
  assert.strictEqual(timer.getElapsedMs(), 500);
  assert.strictEqual(pauses, 0);
});

test('after stop, reset lets the next input start the clock again', () => {
  let t = 1000;
  const { timer } = makeTimer({ now: () => t });
  timer.onFirstInput();
  timer.stop();
  timer.reset();
  t = 2000;
  timer.onFirstInput();
  t = 2300;
  assert.strictEqual(timer.getElapsedMs(), 300);
});

// The default clock: setting the computer's clock back mid-solve must not take time off.
test('the default clock ignores a wall-clock change', () => {
  const realDate = Date.now, realPerf = performance.now;
  let wall = 1_000_000, mono = 50;
  Date.now = () => wall;
  performance.now = () => mono;
  try {
    const timer = setupTimer({ listenVisibility: () => {} });
    timer.onFirstInput();
    wall -= 3_600_000;   // clock set back an hour
    mono += 2000;        // two real seconds pass
    assert.strictEqual(timer.getElapsedMs(), 2000);
  } finally {
    Date.now = realDate;
    performance.now = realPerf;
  }
});
