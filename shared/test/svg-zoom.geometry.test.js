'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  initialView, fitScale, visibleSize, clampView, viewBoxOf, zoomAround, panBy, reveal,
} = require('../svg-zoom-geometry.mjs');

// Zoom 2 gives k = 1 and a 100x100 visible area; zoom 4 gives k = 2 and 50x50.
const frame = {
  base: { x: 0, y: 0, width: 200, height: 100 },
  pane: { width: 100, height: 100 },
  maxZoom: 5,
};
const v = (zoom, cx, cy) => ({ zoom, cx, cy });
const r = (x, y, width, height) => ({ x, y, width, height });

// Deep-equals with a tolerance, so float rounding doesn't fail a geometry check.
function near(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} vs ${expected[key]}`);
  }
}

test('fitScale and initialView: zoom 1 centered on the base', () => {
  assert.equal(fitScale(frame), 0.5);
  assert.deepEqual(initialView(frame), v(1, 100, 50));
});

test('visibleSize: always the pane aspect', () => {
  near(visibleSize(v(2, 0, 0), frame), { width: 100, height: 100 });
  near(visibleSize(v(1, 0, 0), frame), { width: 200, height: 200 });
});

test('clampView limits the zoom', () => {
  assert.equal(clampView(v(0.5, 100, 50), frame).zoom, 1);
  assert.equal(clampView(v(9, 100, 50), frame).zoom, 5);
});

test('clampView centers an axis that fits and bounds one that does not', () => {
  near(clampView(v(2, 0, 0), frame), v(2, 50, 50));
  near(clampView(v(4, 180, 90), frame), v(4, 175, 75));
});

test('viewBoxOf: the visible rectangle', () => {
  near(viewBoxOf(v(2, 60, 50), frame), r(10, 0, 100, 100));
  near(viewBoxOf(v(1, 100, 50), frame), r(0, -50, 200, 200));
});

test('zoomAround keeps the anchored point under the finger', () => {
  const p = { x: 25, y: 50 };
  near(zoomAround(v(2, 100, 50), frame, { from: p, to: p, zoom: 4 }), v(4, 87.5, 50));
});

test('zoomAround follows a moving midpoint', () => {
  const out = zoomAround(v(4, 100, 50), frame, {
    from: { x: 50, y: 50 }, to: { x: 60, y: 50 }, zoom: 4,
  });
  near(out, v(4, 95, 50));
});

test('panBy moves content with the finger and clamps at the edge', () => {
  near(panBy(v(2, 100, 50), frame, 20, 0), v(2, 80, 50));
  assert.equal(panBy(v(2, 100, 50), frame, 500, 0).cx, 50);
});

test('reveal leaves a visible rect alone', () => {
  near(reveal(v(4, 50, 50), frame, [r(40, 40, 10, 10)], 5), v(4, 50, 50));
});

test('reveal pans by the smallest amount', () => {
  near(reveal(v(4, 50, 50), frame, [r(100, 40, 30, 10)], 5), v(4, 110, 50));
});

test('reveal falls back per axis to a smaller rect', () => {
  const rects = [r(0, 40, 200, 10), r(60, 40, 30, 10), r(80, 40, 10, 10)];
  near(reveal(v(4, 150, 50), frame, rects, 5), v(4, 80, 50));
});

test('reveal shrinks the margin when the rect barely fits', () => {
  near(reveal(v(4, 50, 50), frame, [r(100, 40, 46, 10)], 5), v(4, 123, 50));
});

test('reveal never moves anything at zoom 1', () => {
  near(reveal(initialView(frame), frame, [r(150, 80, 20, 10)], 5), initialView(frame));
});
