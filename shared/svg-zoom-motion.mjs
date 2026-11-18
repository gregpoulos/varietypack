// Pure motion for the generic SVG viewBox zoom: a critically damped spring that carries
// a view (svg-zoom-geometry.mjs) toward a target view. It knows nothing about puzzles or
// the DOM; svg-zoom.mjs drives it once per animation frame.
//
// A Motion pins one grid point `p` (user units) for its whole life and springs three
// channels: the log of the zoom, and the pane position (sx, sy) in px where `p` shows.
// The view is derived from them each step. Pinning a point is what keeps a double-tap's
// tapped point still while the zoom changes: when the target zooms around it, its pane
// position never moves. A pan is the same motion at constant zoom. A new target
// mid-motion keeps `p` and the velocities, so a redirected glide never restarts from
// rest.
//   Motion { p: { x, y }, lz, sx, sy, vlz, vsx, vsy }

import { fitScale, viewBoxOf } from './svg-zoom-geometry.mjs';

// Angular frequency of the spring, in rad/s: a typical move looks settled in about 300ms,
// the top of the usual range for mobile motion.
const SPRING_OMEGA = 22;
// The longest step taken at once, in s, so a frame delayed by a background tab or a long
// task doesn't leap.
const MAX_DT = 1 / 30;
// A channel is settled when both its distance to the target and its travel over one frame
// are under these: a quarter px, and a zoom change too small to see.
const SETTLE_PX = 0.25;
const SETTLE_LZ = 0.001;
const FRAME = 1 / 60;

// One step of a critically damped spring from (x, v) toward `target`, `dt` seconds on, in
// closed form, so two half steps land exactly where one whole step does. It never passes
// the target when it starts from rest.
function springStep(x, v, target, dt, omega = SPRING_OMEGA) {
  const x0 = x - target;
  const b = v + omega * x0;
  const decay = Math.exp(-omega * dt);
  return {
    x: target + (x0 + b * dt) * decay,
    v: (v - omega * b * dt) * decay,
  };
}

// Where grid point `p` shows in `view`, in px from the pane's top-left corner.
function screenOf(p, view, frame) {
  const k = fitScale(frame) * view.zoom;
  const box = viewBoxOf(view, frame);
  return { x: (p.x - box.x) * k, y: (p.y - box.y) * k };
}

// The view at `zoom` that shows grid point `p` at pane point `s`.
function viewFrom(zoom, p, s, frame) {
  const k = fitScale(frame) * zoom;
  return {
    zoom,
    cx: p.x - s.x / k + frame.pane.width / (2 * k),
    cy: p.y - s.y / k + frame.pane.height / (2 * k),
  };
}

// A motion at rest on `view`, pinned to the grid point under pane point `anchorPx`, or
// under the pane's center if none is given.
function startMotion(view, frame, anchorPx) {
  const a = anchorPx || { x: frame.pane.width / 2, y: frame.pane.height / 2 };
  const k = fitScale(frame) * view.zoom;
  const box = viewBoxOf(view, frame);
  return {
    p: { x: box.x + a.x / k, y: box.y + a.y / k },
    lz: Math.log(view.zoom), sx: a.x, sy: a.y, vlz: 0, vsx: 0, vsy: 0,
  };
}

// Steps `motion` toward `target` by `dt` seconds (at most MAX_DT). Returns the new
// motion, the view it shows and whether it has settled; a settled step shows `target`
// exactly, so a motion that ends on the whole grid ends on exactly zoom 1.
function stepMotion(motion, target, frame, dt) {
  const t = Math.min(Math.max(dt, 0), MAX_DT);
  const goalLz = Math.log(target.zoom);
  const goal = screenOf(motion.p, target, frame);
  const lz = springStep(motion.lz, motion.vlz, goalLz, t);
  const sx = springStep(motion.sx, motion.vsx, goal.x, t);
  const sy = springStep(motion.sy, motion.vsy, goal.y, t);
  const still = (c, to, eps) => Math.abs(c.x - to) < eps && Math.abs(c.v) * FRAME < eps;
  if (still(lz, goalLz, SETTLE_LZ) && still(sx, goal.x, SETTLE_PX) && still(sy, goal.y, SETTLE_PX)) {
    return {
      motion: { p: motion.p, lz: goalLz, sx: goal.x, sy: goal.y, vlz: 0, vsx: 0, vsy: 0 },
      view: { ...target },
      settled: true,
    };
  }
  const next = { p: motion.p, lz: lz.x, sx: sx.x, sy: sy.x, vlz: lz.v, vsx: sx.v, vsy: sy.v };
  return { motion: next, view: viewFrom(Math.exp(lz.x), motion.p, { x: sx.x, y: sy.x }, frame), settled: false };
}

export { SPRING_OMEGA, MAX_DT, springStep, startMotion, stepMotion };
