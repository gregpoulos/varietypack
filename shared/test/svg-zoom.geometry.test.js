'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  initialView, fitScale, visibleSize, clampView, viewBoxOf, zoomAround, panBy, reveal,
  rubberBand, unrubberBand, stretchView, unstretchView, edgesOf, followFingers,
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

test('bleed lets a zoomed view pan past the base, and leaves zoom 1 alone', () => {
  const bled = { ...frame, bleed: 2 };
  assert.deepEqual(clampView(v(1, 100, 50), bled), v(1, 100, 50));
  const left = clampView(v(2, -50, 50), bled);
  near(viewBoxOf(left, bled), { x: -2, y: 0, width: 100, height: 100 });
  const none = clampView(v(2, -50, 50), frame);
  near(viewBoxOf(none, frame), { x: 0, y: 0, width: 100, height: 100 });
});

test('rubberBand: zero at the limit, iOS sample values, bounded by dim', () => {
  assert.equal(rubberBand(0, 960), 0);
  assert.ok(Math.abs(rubberBand(5, 960) - 2.74) < 0.01);
  assert.ok(Math.abs(rubberBand(100, 960) - 52.02) < 0.01);
  assert.ok(rubberBand(1e9, 960) < 960);
  assert.equal(rubberBand(-100, 960), -rubberBand(100, 960));
});

test('unrubberBand inverts rubberBand', () => {
  for (const x of [-300, -1, 0, 3, 50, 400]) {
    assert.ok(Math.abs(unrubberBand(rubberBand(x, 300), 300) - x) < 1e-9);
  }
});

test('a dim of 0 means no stretch', () => {
  assert.equal(rubberBand(5, 0), 0);
  assert.equal(unrubberBand(0, 0), 0);
});

test('marginPx rests a zoomed view past the base, never below bleed, not at zoom 1', () => {
  const f = { ...frame, marginPx: 12, bleed: 2 };
  near(clampView(v(4, -999, -999), f), v(4, 25 - 6, 25 - 6)); // 12px at k = 2 is 6 units
  near(clampView(v(4, -999, 50), { ...frame, marginPx: 2, bleed: 2 }), v(4, 25 - 2, 50));
  near(clampView(v(1, 0, 0), f), v(1, 100, 50));
});

test('panBy and zoomAround can skip the clamp', () => {
  assert.equal(panBy(v(4, 25, 25), frame, 40, 0, { clamp: false }).cx, 5);
  const p = { x: 50, y: 50 };
  assert.equal(zoomAround(v(1, 100, 50), frame, { from: p, to: p, zoom: 0.5 }, { clamp: false }).zoom, 0.5);
});

test('stretchView: inside the limits it is the raw view', () => {
  near(stretchView(v(4, 100, 50), frame), v(4, 100, 50));
});

test('stretchView resists past an edge, and unstretchView inverts it', () => {
  const raw = v(4, 25 - 20, 50); // 20 units (40px) past the left limit
  const shown = stretchView(raw, frame);
  assert.ok(shown.cx < 25 && shown.cx > 5);
  near(unstretchView(shown, frame), raw);
});

test('stretchView stretches an axis that fits away from its center, and unstretchView inverts it', () => {
  const short = { ...frame, base: { x: 0, y: 0, width: 200, height: 40 } };
  const shown = stretchView(v(4, 100, -999), short);
  assert.ok(shown.cy < 20 && shown.cy > -999);
  near(unstretchView(shown, short), v(4, 100, -999));
  // The whole grid at zoom 1 stretches too, with resistance.
  const f = { ...frame, marginPx: 12 };
  const whole = stretchView(v(1, -50, 200), f);
  assert.ok(whole.cx < 100 && whole.cx > -50 && whole.cy > 50 && whole.cy < 200);
  near(unstretchView(whole, f), v(1, -50, 200));
});

test('stretchView resists zoom past the limits in log space', () => {
  const f = { ...frame, zoomStretch: Math.log(2) };
  const out = stretchView(v(0.25, 100, 50), f).zoom;
  assert.ok(out < 1 && out > 0.5);
  const inn = stretchView(v(40, 100, 50), f).zoom;
  assert.ok(inn > 5 && inn < 10);
  near(unstretchView(stretchView(v(0.25, 100, 50), f), f), v(0.25, 100, 50));
});

test('edgesOf: none at zoom 1, none on a side resting at the margin', () => {
  const f = { ...frame, marginPx: 12 };
  assert.deepEqual(edgesOf(v(1, 100, 50), f), { top: false, right: false, bottom: false, left: false });
  const atLeft = clampView(v(4, -999, 50), f);
  assert.deepEqual(edgesOf(atLeft, f), { top: true, right: true, bottom: true, left: false });
});

// A square grid on a portrait pane: at zoom 1 both axes fit; past it the width doesn't,
// and the height stops fitting at zoom 1.5.
const portrait = {
  base: { x: 0, y: 0, width: 100, height: 100 },
  pane: { width: 400, height: 600 },
  maxZoom: 5, bleed: 2, marginPx: 12, zoomStretch: Math.log(2),
};
const pxOf = (view, f) => fitScale(f) * view.zoom;

test('stretchView: a pinch whose midpoint drifts never snaps where an axis stops fitting', () => {
  let raw = initialView(portrait);
  let prev = stretchView(raw, portrait);
  for (let i = 0; i < 60; i++) {
    raw = zoomAround(raw, portrait,
      { from: { x: 200, y: 300 + i }, to: { x: 200, y: 301 + i }, zoom: raw.zoom * 1.01 }, { clamp: false });
    const shown = stretchView(raw, portrait);
    const jump = Math.abs(shown.cy - prev.cy) * pxOf(shown, portrait);
    assert.ok(jump < 5, `step ${i}, zoom ${shown.zoom.toFixed(3)}: ${jump.toFixed(1)}px`);
    prev = shown;
  }
});

test('stretchView: a drag on the whole grid shows, and a pinch that begins after it never jumps', () => {
  let raw = panBy(initialView(portrait), portrait, -200, 0, { clamp: false });
  const dragged = stretchView(raw, portrait);
  assert.ok(Math.abs(dragged.cx - 50) * pxOf(dragged, portrait) > 10);
  raw = zoomAround(raw, portrait,
    { from: { x: 200, y: 300 }, to: { x: 200, y: 300 }, zoom: 1.01 }, { clamp: false });
  const shown = stretchView(raw, portrait);
  assert.ok(Math.abs(shown.cx - dragged.cx) * pxOf(shown, portrait) < 3);
});

// Where grid point `p` shows in `view`, in px from the pane's top-left corner.
const screenOf = (p, view, f) => {
  const k = pxOf(view, f);
  const box = viewBoxOf(view, f);
  return { x: (p.x - box.x) * k, y: (p.y - box.y) * k };
};
const gridPointAt = (s, view, f) => {
  const k = pxOf(view, f);
  const box = viewBoxOf(view, f);
  return { x: box.x + s.x / k, y: box.y + s.y / k };
};

test('followFingers: inside the limits it pans and pinches as panBy and zoomAround do', () => {
  const raw = v(2, 50, 50);
  near(followFingers(raw, portrait, { from: { x: 0, y: 0 }, to: { x: 30, y: -10 }, scale: 1 }),
    panBy(raw, portrait, 30, -10, { clamp: false }));
  const from = { x: 120, y: 200 }, to = { x: 130, y: 190 };
  near(followFingers(raw, portrait, { from, to, scale: 1.2 }),
    zoomAround(raw, portrait, { from, to, zoom: 2.4 }, { clamp: false }));
});

test('followFingers: over-pinched, the grid under the fingers moves with them', () => {
  // Past maxZoom the zoom shown is less than the raw zoom; the midpoint's travel must
  // still carry the grid point under it the whole way, not lag at the raw zoom's scale.
  const raw = v(20, 50, 50);
  const shown = stretchView(raw, portrait);
  const from = { x: 200, y: 300 }, to = { x: 230, y: 320 };
  const p = gridPointAt(from, shown, portrait);
  const next = stretchView(followFingers(raw, portrait, { from, to, scale: 1 }), portrait);
  near(screenOf(p, next, portrait), to);
  // And a pinch about a still midpoint keeps the grid point under it.
  const spread = stretchView(followFingers(raw, portrait, { from, to: from, scale: 1.5 }), portrait);
  near(screenOf(p, spread, portrait), from);
});

test('unrubberBand stays finite and keeps its sign at or past dim', () => {
  for (const shown of [300, 450, -300]) {
    const x = unrubberBand(shown, 300);
    assert.ok(Number.isFinite(x) && Math.sign(x) === Math.sign(shown), `${shown}: ${x}`);
    assert.ok(Math.abs(x) >= Math.abs(unrubberBand(Math.sign(shown) * 299, 300)));
  }
});
