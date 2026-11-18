// Generic pinch, pan and double-tap zoom for an SVG, done by rewriting its viewBox. It
// is puzzle-agnostic: it knows nothing about cells, clues or the engines, so it could
// be lifted out as a library. Its geometry is in svg-zoom-geometry.mjs, its gesture
// recognizer in svg-zoom-gestures.mjs and its spring in svg-zoom-motion.mjs, all pure and
// tested under node:test; this file is the thin DOM layer that feeds them pointer events,
// runs the animation frames and applies the result.
//
// The view moves two ways. Under a finger it follows the gesture, stretching past the
// limits on the rubber band. Otherwise it glides: a double-tap, a reveal and the spring
// back from a stretch each set a target, and the spring carries the shown view there.
// Under prefers-reduced-motion every glide is a jump.

import { createGestureTracker } from './svg-zoom-gestures.mjs';
import {
  clampView, edgesOf, followFingers, initialView, reveal as revealView, stretchView,
  unstretchView, viewBoxOf, zoomAround,
} from './svg-zoom-geometry.mjs';
import { startMotion, stepMotion } from './svg-zoom-motion.mjs';

// After a pan or pinch ends, a click on the pane within this many ms is a stray (WebKit
// fires one when a pinch ends) and is eaten.
const STRAY_CLICK_MS = 400;
// The double-tap window, in ms from the first tap's up to the second tap's down, and how
// far apart in px the two may be. The distance
// stays under a small grid's cell pitch (about 20px on the smallest phone), or two quick
// taps on neighboring cells would read as a double-tap and the second would be lost.
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 15;
// A touch that moves no more than this many px is still a tap. In the range other touch
// code uses (Android's 8dp, FastClick's 10px, Gmail's 12px): tighter, and a slightly
// sloppy tap while zoomed becomes a pan and loses its click.
const TAP_SLOP_PX = 10;
// User units a zoomed view may pan past the grid, enough for the outer half of the
// thickest cell stroke (.cell.active-cell.composing, 2.5) on an edge cell.
const EDGE_BLEED = 2;

// Attaches zoom to `svg`, listening for pointers on `pane` (which the SVG fills, bar its
// padding, so the SVG's own box never depends on its viewBox). Call it once the SVG has
// been drawn and sits in the document: its viewBox at that moment is the whole grid.
//   maxZoom:       the zoom limit, a multiple of the zoom that fits the grid
//   doubleTapZoom: where a double-tap on the unzoomed grid goes, as a multiple of fit
//   marginPx:      how far in screen px a zoomed view may rest past the grid's edge
//   zoomStretch:   the rubber band's reach for a pinch past the zoom limits, in log-zoom
//                  units (0: a pinch stops dead at the limits)
//   onEdges:       called with { top, right, bottom, left }, the sides of the shown view
//                  beyond which more grid lies, each time that set changes
//   onView:        called each time a view other than the whole grid at rest is shown,
//                  with its viewBox and `scale`, px per user unit:
//                  { x, y, width, height, scale }
//   win:           the window
// Returns { reveal(rects, margin), refresh(), zoomed(), destroy() }:
//   reveal  glides the least distance that shows the first of `rects` (SVG units) that
//           fits the view, with `margin` units around it, from where the view is
//           heading; see svg-zoom-geometry.mjs. Ignored while a finger is down.
//   refresh re-measures the SVG and re-clamps the view; a no-op while it measures 0x0
//   zoomed  whether the grid is zoomed in, or heading there
//   destroy restores the original viewBox and removes everything attached
function attachSvgZoom(svg, {
  pane, maxZoom = 5, doubleTapZoom = 2.5, marginPx = 0, zoomStretch = 0,
  onEdges = () => {}, onView = () => {}, win = window,
}) {
  const original = svg.getAttribute('viewBox');
  const baseVal = svg.viewBox.baseVal;
  const inert = { reveal() {}, refresh() {}, zoomed: () => false, destroy() {} };
  if (!original || !baseVal || baseVal.width <= 0 || baseVal.height <= 0) return inert;

  const frame = {
    base: { x: baseVal.x, y: baseVal.y, width: baseVal.width, height: baseVal.height },
    pane: { width: 0, height: 0 },
    maxZoom,
    bleed: EDGE_BLEED,
    marginPx,
    zoomStretch,
  };
  let current = initialView(frame);  // the view shown
  let target = current;               // where it's heading; the same at rest
  let motion = null;                  // the spring carrying current to target, if moving
  let raw = null;                     // a gesture's unclamped view, while a finger is down
  let frameId = null;                 // the pending animation frame
  let lastTime = null;                // when the last frame stepped, in ms; null before the first
  let measured = false;
  let printing = false;   // between beforeprint and afterprint: the whole grid shows
  let lastEdges = '';
  const ownOverflow = svg.style.overflow;
  const noEdges = { top: false, right: false, bottom: false, left: false };

  const sameView = (a, b) => a.zoom === b.zoom && a.cx === b.cx && a.cy === b.cy;
  const whole = initialView(frame);

  // Writes the shown view to the SVG: the engine's own attribute string and overflow on
  // the whole grid at rest and in print, so an unzoomed page renders exactly as it always
  // did. Any other view (zoomed, or the whole grid stretched by a drag or pinch) clips,
  // since a grid drawn with overflow: visible would paint outside its viewBox over the
  // bars. Any other view is reported each time; the edges only when they change.
  function apply() {
    if (!measured) return;
    if (printing || sameView(current, whole)) {
      svg.setAttribute('viewBox', original);
      svg.style.overflow = ownOverflow;
    } else {
      const b = viewBoxOf(current, frame);
      svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
      svg.style.overflow = 'hidden';
      onView({ ...b, scale: frame.pane.width / b.width });
    }
    const edges = printing ? noEdges : edgesOf(current, frame);
    const key = JSON.stringify(edges);
    if (key !== lastEdges) {
      lastEdges = key;
      onEdges(edges);
    }
  }

  // Motion. animateTo sets where the view heads and starts the spring, or under reduced
  // motion (read at each call, as it can change while the page is open) jumps there.
  // A given anchor, a pane point in px, stays still while the zoom changes.
  const motionQuery = win.matchMedia ? win.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => Boolean(motionQuery && motionQuery.matches);
  // Reduced motion switched on mid-glide ends the glide at once where it was heading.
  function onMotionPref() {
    if (reducedMotion() && motion) snap();
  }
  function cancelFrame() {
    if (frameId !== null) win.cancelAnimationFrame(frameId);
    frameId = null;
  }
  // A glide's first frame steps one frame's time: its timestamp is the frame's start,
  // which can precede the moment the glide was asked for.
  function tick(time) {
    frameId = null;
    const dt = lastTime === null ? 1 / 60 : (time - lastTime) / 1000;
    const r = stepMotion(motion, target, frame, dt);
    lastTime = time;
    current = r.view;
    motion = r.settled ? null : r.motion;
    apply();
    if (motion) frameId = win.requestAnimationFrame(tick);
  }
  function animateTo(next, anchorPx) {
    target = next;
    if (!measured || reducedMotion()) return snap();
    if (!motion && sameView(current, target)) return;
    if (anchorPx || !motion) motion = startMotion(current, frame, anchorPx);
    if (frameId === null) {
      lastTime = null;
      frameId = win.requestAnimationFrame(tick);
    }
  }
  // Stops the view where it shows: a touch catches a glide.
  function freeze() {
    cancelFrame();
    motion = null;
    target = current;
  }
  // Ends a glide at once where it was heading: print, and reduced motion.
  function snap() {
    cancelFrame();
    motion = null;
    current = target;
    apply();
  }

  // Reads the SVG's on-screen size; false while it has none (hidden).
  function measure() {
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    frame.pane = { width: r.width, height: r.height };
    measured = true;
    return true;
  }
  // A new pane size re-clamps both views. A glide in flight carries on toward the
  // re-clamped target, restarted from rest, since its state is in the old pane's px.
  // The print layout's sizes are ignored: clamping to them would lose the view that
  // afterprint brings back.
  function refresh() {
    if (printing || !measure()) return;
    target = clampView(target, frame);
    if (motion) {
      motion = startMotion(current, frame);
      return;
    }
    current = clampView(current, frame);
    apply();
  }
  function zoomed() {
    return target.zoom > 1;
  }
  function reveal(rects, margin) {
    if (!measured || touching.size > 0) return;
    animateTo(revealView(target, frame, rects, margin));
  }

  // Taps stay clicks; nothing here cancels a pointer event. A click that isn't a real
  // tap is eaten before it reaches a cell. Eating is stopImmediatePropagation plus
  // preventDefault.
  const tracker = createGestureTracker({
    tapSlop: TAP_SLOP_PX, doubleTapMs: DOUBLE_TAP_MS, doubleTapSlop: DOUBLE_TAP_PX,
  });
  let strayUntil = 0;     // eat clicks until this time: a gesture just ended
  let eatNextUntil = 0;   // eat the next click if it comes before this time: a double-tap
  const touching = new Set();   // ids of the pointers that went down on the pane
  let origin = null;      // the SVG's top-left corner in viewport px, read once per sequence
  let swept = false;      // this sequence moved the view or had a second pointer

  function onClick(e) {
    if (!pane.contains(e.target)) return;
    const eat = () => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    if (e.timeStamp <= strayUntil) return eat();
    if (e.timeStamp <= eatNextUntil) {
      eatNextUntil = 0;
      return eat();
    }
  }

  // Pointer coordinates in px from the SVG's top-left corner. The corner is read when a
  // sequence starts and not per event: the SVG's box doesn't depend on its viewBox, and
  // measuring after each viewBox write would force a layout on every move.
  function local(e) {
    return { x: e.clientX - origin.left, y: e.clientY - origin.top };
  }

  // Shows a gesture's raw view through the rubber band.
  function showRaw() {
    current = stretchView(raw, frame);
    target = current;
    apply();
  }

  // Applies the recognizer's actions: view changes, and what each ending means for the
  // clicks that follow.
  function run(actions, t) {
    for (const a of actions) {
      if (a.type === 'pan') {
        const before = current;
        raw = followFingers(raw, frame, { from: { x: 0, y: 0 }, to: { x: a.dx, y: a.dy }, scale: 1 });
        showRaw();
        if (current.cx !== before.cx || current.cy !== before.cy) swept = true;
      } else if (a.type === 'pinch') {
        raw = followFingers(raw, frame, a);
        showRaw();
        swept = true;
      } else if (a.type === 'doubleTap') {
        // The first tap already acted, as a single tap does; the second one only zooms.
        eatNextUntil = t + STRAY_CLICK_MS;
        const next = zoomed()
          ? initialView(frame)
          : zoomAround(target, frame, { from: a, to: a, zoom: doubleTapZoom });
        animateTo(next, { x: a.x, y: a.y });
      } else if (a.type === 'gestureEnd') {
        // Only a sequence that really moved the view or had two fingers can end in a
        // stray click. A jittery tap that moved nothing (the whole grid fits) is a tap.
        if (swept) strayUntil = t + STRAY_CLICK_MS;
        swept = false;
      }
    }
  }

  // The first finger down catches any glide where it shows, and the gesture continues
  // from there, a stretch included.
  function onDown(e) {
    if (!measured && !measure()) return;
    eatNextUntil = 0;
    if (touching.size > 0) swept = true;
    else {
      origin = svg.getBoundingClientRect();
      freeze();
      raw = unstretchView(current, frame);
    }
    touching.add(e.pointerId);
    const p = local(e);
    run(tracker.down(e.pointerId, p.x, p.y, e.timeStamp), e.timeStamp);
  }
  function onMove(e) {
    if (!touching.has(e.pointerId)) return;
    const p = local(e);
    run(tracker.move(e.pointerId, p.x, p.y, e.timeStamp), e.timeStamp);
  }
  // Up and cancel are heard on the window: a mouse has no implicit capture, so one
  // released outside the pane would otherwise stay down here and pan on every hover.
  function onUp(e) {
    if (!touching.delete(e.pointerId)) return;
    const p = local(e);
    const actions = tracker.up(e.pointerId, p.x, p.y, e.timeStamp);
    endSequence(actions);
    run(actions, e.timeStamp);
  }
  function onCancel(e) {
    if (!touching.delete(e.pointerId)) return;
    const actions = tracker.cancel(e.pointerId);
    endSequence(actions);
    run(actions, e.timeStamp);
  }
  // When the last finger lifts, from any sequence (a tap during a spring-back too), the
  // view springs back inside the limits, around a pinch's last midpoint: the zoom clamps
  // about that point, so the grid under the fingers stays there. Nothing moves when the
  // view is inside already. A double-tap's own glide, run after this, overrides it.
  function endSequence(actions) {
    if (touching.size > 0) return;
    raw = null;
    const end = actions.find(a => a.type === 'gestureEnd');
    const anchor = end && end.anchor;
    if (!anchor) return animateTo(clampView(current, frame));
    const settledView = zoomAround(current, frame, { from: anchor, to: anchor, zoom: current.zoom });
    animateTo(settledView, anchor);
  }
  // A touch anywhere else between two taps (a key, a button) means they aren't a pair.
  function onOutsideDown(e) {
    if (!pane.contains(e.target)) tracker.forget();
  }
  // Safari's own pinch gesture would zoom the page; touch-action alone didn't stop it
  // in the spike, and it isn't known whether current iOS still needs this.
  function stopGesture(e) {
    e.preventDefault();
  }

  // Styles: no browser gesture on the pane or the SVG.
  const saved = { pane: pane.style.touchAction, svgTouch: svg.style.touchAction };
  pane.style.touchAction = 'none';
  svg.style.touchAction = 'none';

  const passive = { passive: true };
  pane.addEventListener('pointerdown', onDown, passive);
  pane.addEventListener('pointermove', onMove, passive);
  win.addEventListener('pointerup', onUp, true);
  win.addEventListener('pointercancel', onCancel, true);
  pane.addEventListener('gesturestart', stopGesture, { passive: false });
  pane.addEventListener('gesturechange', stopGesture, { passive: false });
  win.addEventListener('click', onClick, true);
  win.addEventListener('pointerdown', onOutsideDown, true);
  if (motionQuery) motionQuery.addEventListener('change', onMotionPref);

  // A resize or rotation keeps the zoom factor and visible center, re-clamped.
  let observer = null;
  if (win.ResizeObserver) {
    observer = new win.ResizeObserver(refresh);
    observer.observe(svg);
  } else {
    win.addEventListener('resize', refresh);
  }

  // Printing shows the whole grid, whatever the view, and a resize that the print
  // layout causes doesn't bring the zoomed view back.
  const setPrinting = on => () => {
    if (on) snap();
    printing = on;
    apply();
  };
  const beforePrint = setPrinting(true);
  const afterPrint = setPrinting(false);
  win.addEventListener('beforeprint', beforePrint);
  win.addEventListener('afterprint', afterPrint);

  refresh();

  function destroy() {
    cancelFrame();
    svg.setAttribute('viewBox', original);
    pane.style.touchAction = saved.pane;
    svg.style.touchAction = saved.svgTouch;
    svg.style.overflow = ownOverflow;
    pane.removeEventListener('pointerdown', onDown);
    pane.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp, true);
    win.removeEventListener('pointercancel', onCancel, true);
    pane.removeEventListener('gesturestart', stopGesture);
    pane.removeEventListener('gesturechange', stopGesture);
    win.removeEventListener('click', onClick, true);
    win.removeEventListener('pointerdown', onOutsideDown, true);
    if (motionQuery) motionQuery.removeEventListener('change', onMotionPref);
    if (observer) observer.disconnect();
    else win.removeEventListener('resize', refresh);
    win.removeEventListener('beforeprint', beforePrint);
    win.removeEventListener('afterprint', afterPrint);
  }

  return { reveal, refresh, zoomed, destroy };
}

export { attachSvgZoom };
