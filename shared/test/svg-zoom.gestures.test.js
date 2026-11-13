'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGestureTracker } = require('../svg-zoom-gestures.mjs');

// One finger touches down and lifts at once, returning the up's actions.
function tapAt(g, x, y, t) {
  g.down(1, x, y, t);
  return g.up(1, x, y, t + 50);
}

test('down and up without moving is a tap', () => {
  const g = createGestureTracker();
  assert.deepEqual(g.down(1, 10, 10, 0), []);
  assert.deepEqual(g.up(1, 10, 10, 50), [{ type: 'tap', x: 10, y: 10 }]);
});

test('movement within the slop is still a tap', () => {
  const g = createGestureTracker();
  g.down(1, 10, 10, 0);
  assert.deepEqual(g.move(1, 14, 10, 20), []);
  assert.deepEqual(g.up(1, 14, 10, 50), [{ type: 'tap', x: 14, y: 10 }]);
});

test('a wobble of 8px is still a tap', () => {
  const g = createGestureTracker();
  g.down(1, 10, 10, 0);
  assert.deepEqual(g.move(1, 18, 10, 20), []);
  assert.deepEqual(g.up(1, 18, 10, 50), [{ type: 'tap', x: 18, y: 10 }]);
});

test('crossing the slop pans from the start', () => {
  const g = createGestureTracker();
  g.down(1, 0, 0, 0);
  assert.deepEqual(g.move(1, 12, 0, 10), [{ type: 'pan', dx: 12, dy: 0 }]);
  assert.deepEqual(g.move(1, 15, 2, 20), [{ type: 'pan', dx: 3, dy: 2 }]);
  assert.deepEqual(g.up(1, 15, 2, 30), [{ type: 'gestureEnd' }]);
});

test('two fingers pinch', () => {
  const g = createGestureTracker();
  g.down(1, 0, 0, 0);
  assert.deepEqual(g.down(2, 100, 0, 5), []);
  assert.deepEqual(g.move(2, 200, 0, 10), [
    { type: 'pinch', from: { x: 50, y: 0 }, to: { x: 100, y: 0 }, scale: 2 },
  ]);
  assert.deepEqual(g.up(2, 200, 0, 20), []);
  assert.deepEqual(g.up(1, 0, 0, 30), [{ type: 'gestureEnd' }]);
});

test('two fingers that never move are a gesture, not a tap', () => {
  const g = createGestureTracker();
  g.down(1, 0, 0, 0);
  g.down(2, 100, 0, 5);
  assert.deepEqual(g.up(2, 100, 0, 20), []);
  assert.deepEqual(g.up(1, 0, 0, 30), [{ type: 'gestureEnd' }]);
});

test('a finger left after a pinch pans without a slop', () => {
  const g = createGestureTracker();
  g.down(1, 0, 0, 0);
  g.down(2, 100, 0, 5);
  g.move(2, 200, 0, 10);
  g.up(2, 200, 0, 20);
  assert.deepEqual(g.move(1, 5, 0, 30), [{ type: 'pan', dx: 5, dy: 0 }]);
});

test('a quick second tap nearby is a double-tap', () => {
  const g = createGestureTracker();
  tapAt(g, 10, 10, 0);
  assert.deepEqual(g.down(1, 20, 10, 200), []);
  assert.deepEqual(g.up(1, 20, 10, 250), [{ type: 'doubleTap', x: 20, y: 10 }]);
});

test('a slow second tap is a plain tap', () => {
  const g = createGestureTracker();
  tapAt(g, 10, 10, 0);
  assert.deepEqual(g.down(1, 10, 10, 400), []);
  assert.deepEqual(g.up(1, 10, 10, 450), [{ type: 'tap', x: 10, y: 10 }]);
});

test('a distant second tap is a plain tap', () => {
  const g = createGestureTracker();
  tapAt(g, 10, 10, 0);
  assert.deepEqual(g.down(1, 50, 10, 200), []);
  assert.deepEqual(g.up(1, 50, 10, 250), [{ type: 'tap', x: 50, y: 10 }]);
});

test('a third quick tap starts over', () => {
  const g = createGestureTracker();
  tapAt(g, 10, 10, 0);
  g.down(1, 10, 10, 200);
  g.up(1, 10, 10, 250);
  assert.deepEqual(g.down(1, 10, 10, 350), []);
  assert.deepEqual(g.up(1, 10, 10, 400), [{ type: 'tap', x: 10, y: 10 }]);
});

test('a second tap that drags pans', () => {
  const g = createGestureTracker();
  tapAt(g, 10, 10, 0);
  assert.deepEqual(g.down(1, 10, 10, 200), []);
  assert.deepEqual(g.move(1, 30, 10, 220), [{ type: 'pan', dx: 20, dy: 0 }]);
  assert.deepEqual(g.up(1, 30, 10, 250), [{ type: 'gestureEnd' }]);
});

test('cancel clears the gesture', () => {
  const g = createGestureTracker();
  g.down(1, 0, 0, 0);
  g.down(2, 100, 0, 5);
  g.move(2, 200, 0, 10);
  assert.deepEqual(g.cancel(1), []);
  assert.deepEqual(g.cancel(2), [{ type: 'gestureEnd' }]);
  g.down(1, 10, 10, 1000);
  assert.deepEqual(g.up(1, 10, 10, 1050), [{ type: 'tap', x: 10, y: 10 }]);
});

test('cancel of a pointer that never moved leaves no tap', () => {
  const g = createGestureTracker();
  g.down(1, 10, 10, 0);
  assert.deepEqual(g.cancel(1), []);
  // The canceled touch must not arm a double-tap either.
  assert.deepEqual(g.down(1, 10, 10, 100), []);
});

test('forget makes the next tap a plain tap, however quick and near', () => {
  const g = createGestureTracker();
  tapAt(g, 10, 10, 0);
  g.forget();
  assert.deepEqual(g.down(1, 10, 10, 100), []);
  assert.deepEqual(g.up(1, 10, 10, 150), [{ type: 'tap', x: 10, y: 10 }]);
});

test('a third pointer is ignored', () => {
  const g = createGestureTracker();
  g.down(1, 0, 0, 0);
  g.down(2, 100, 0, 5);
  assert.deepEqual(g.down(3, 50, 50, 10), []);
  assert.deepEqual(g.move(3, 60, 60, 20), []);
  assert.deepEqual(g.up(3, 60, 60, 30), []);
});
