'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zoomAround } = require('../svg-zoom-geometry.mjs');
const { springStep, startMotion, stepMotion, MAX_DT } = require('../svg-zoom-motion.mjs');

// The geometry tests' frame: zoom 2 gives k = 1 and a 100x100 visible area; zoom 4 gives
// k = 2 and 50x50.
const frame = {
  base: { x: 0, y: 0, width: 200, height: 100 },
  pane: { width: 100, height: 100 },
  maxZoom: 5,
};
const v = (zoom, cx, cy) => ({ zoom, cx, cy });

// Deep-equals with a tolerance, so float rounding doesn't fail a check.
function near(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const key of Object.keys(expected)) {
    assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9, `${key}: ${actual[key]} vs ${expected[key]}`);
  }
}

// Steps a motion toward `target` at 60fps until it settles; returns the last step.
function run(motion, target, frames = 120) {
  let r = null;
  for (let i = 0; i < frames && !(r && r.settled); i++) {
    r = stepMotion(motion, target, frame, 1 / 60);
    motion = r.motion;
  }
  return r;
}

test('springStep from rest approaches the target without passing it', () => {
  let s = { x: 0, v: 0 };
  for (let i = 0; i < 60; i++) {
    s = springStep(s.x, s.v, 100, 1 / 60);
    assert.ok(s.x <= 100);
  }
  assert.ok(Math.abs(s.x - 100) < 0.5);
});

test('springStep is frame-rate independent', () => {
  const one = springStep(0, 50, 100, 2 / 60);
  const a = springStep(0, 50, 100, 1 / 60);
  const two = springStep(a.x, a.v, 100, 1 / 60);
  assert.ok(Math.abs(one.x - two.x) < 1e-9 && Math.abs(one.v - two.v) < 1e-9);
});

test('stepMotion pans to the target and settles on it exactly', () => {
  const to = v(4, 150, 50);
  const r = run(startMotion(v(4, 50, 50), frame), to);
  assert.ok(r.settled);
  assert.deepEqual(r.view, to);
  assert.equal(r.motion.vsx, 0);
});

test('stepMotion settles a zoom-out on the exact whole-grid view', () => {
  const to = v(1, 100, 50);
  const r = run(startMotion(v(3, 40, 30), frame, { x: 20, y: 80 }), to);
  assert.ok(r.settled);
  assert.deepEqual(r.view, to);
});

test('stepMotion keeps the anchor still when the target zooms around it', () => {
  const from = v(2, 100, 50);
  const a = { x: 30, y: 70 };
  const to = zoomAround(from, frame, { from: a, to: a, zoom: 4 });
  let m = startMotion(from, frame, a);
  for (let i = 0; i < 10; i++) {
    m = stepMotion(m, to, frame, 1 / 60).motion;
    // The grid point first under `a` is still under `a`.
    near({ sx: m.sx, sy: m.sy }, { sx: a.x, sy: a.y });
  }
});

test('stepMotion keeps its speed when retargeted', () => {
  let m = startMotion(v(4, 50, 50), frame);
  m = stepMotion(m, v(4, 150, 50), frame, 1 / 60).motion;
  const before = m.vsx;
  m = stepMotion(m, v(4, 160, 50), frame, 0).motion; // dt 0: retarget only
  assert.equal(m.vsx, before);
});

test('stepMotion clamps a long dt', () => {
  const m = startMotion(v(4, 50, 50), frame);
  const big = stepMotion(m, v(4, 150, 50), frame, 5).motion;
  const capped = stepMotion(m, v(4, 150, 50), frame, MAX_DT).motion;
  assert.equal(big.sx, capped.sx);
});
