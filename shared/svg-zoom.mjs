// Generic pinch, pan and double-tap zoom for an SVG, done by rewriting its viewBox. It
// is puzzle-agnostic: it knows nothing about cells, clues or the engines, so it could
// be lifted out as a library. Its geometry is in svg-zoom-geometry.mjs and its gesture
// recognizer in svg-zoom-gestures.mjs, both pure and tested under node:test; this file
// is the thin DOM layer that feeds them pointer events and applies the result.

import { createGestureTracker } from './svg-zoom-gestures.mjs';
import {
  clampView, initialView, panBy, reveal as revealView, viewBoxOf, zoomAround,
} from './svg-zoom-geometry.mjs';

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

// Attaches zoom to `svg`, listening for pointers on `pane` (which the SVG fills, bar its
// padding, so the SVG's own box never depends on its viewBox). Call it once the SVG has
// been drawn and sits in the document: its viewBox at that moment is the whole grid.
//   maxZoom:       the zoom limit, a multiple of the zoom that fits the grid
//   doubleTapZoom: where a double-tap on the unzoomed grid goes, as a multiple of fit
//   win:           the window
// Returns { reveal(rects, margin), refresh(), reset(), zoomed(), destroy() }:
//   reveal  pans the least distance that shows the first of `rects` (SVG units) that
//           fits the view, with `margin` units around it; see svg-zoom-geometry.mjs
//   refresh re-measures the SVG and re-applies the view; a no-op while it measures 0x0
//   reset   back to the whole grid
//   zoomed  whether the grid is zoomed in
//   destroy restores the original viewBox and removes everything attached
function attachSvgZoom(svg, { pane, maxZoom = 5, doubleTapZoom = 2.5, win = window }) {
  const original = svg.getAttribute('viewBox');
  const baseVal = svg.viewBox.baseVal;
  const inert = { reveal() {}, refresh() {}, reset() {}, zoomed: () => false, destroy() {} };
  if (!original || !baseVal || baseVal.width <= 0 || baseVal.height <= 0) return inert;

  const frame = {
    base: { x: baseVal.x, y: baseVal.y, width: baseVal.width, height: baseVal.height },
    pane: { width: 0, height: 0 },
    maxZoom,
  };
  let view = initialView(frame);
  let measured = false;
  let printing = false;   // between beforeprint and afterprint: the whole grid shows
  const ownOverflow = svg.style.overflow;

  // Writes the view to the SVG: the engine's own attribute string and overflow at zoom 1
  // and in print, so an unzoomed page renders exactly as it always did. Zoomed, the SVG
  // clips, since a grid drawn with overflow: visible would paint outside its viewBox
  // over the bars.
  function apply() {
    if (!measured) return;
    if (printing || view.zoom === 1) {
      svg.setAttribute('viewBox', original);
      svg.style.overflow = ownOverflow;
      return;
    }
    const b = viewBoxOf(view, frame);
    svg.setAttribute('viewBox', `${b.x} ${b.y} ${b.width} ${b.height}`);
    svg.style.overflow = 'hidden';
  }
  function setView(next) {
    view = next;
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
  function refresh() {
    if (!measure()) return;
    setView(clampView(view, frame));
  }
  function reset() {
    setView(initialView(frame));
  }
  function zoomed() {
    return view.zoom > 1;
  }
  function reveal(rects, margin) {
    if (!measured) return;
    setView(revealView(view, frame, rects, margin));
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

  // Applies the recognizer's actions: view changes, and what each ending means for the
  // clicks that follow.
  function run(actions, t) {
    for (const a of actions) {
      if (a.type === 'pan') {
        const before = view;
        setView(panBy(view, frame, a.dx, a.dy));
        if (view.cx !== before.cx || view.cy !== before.cy) swept = true;
      } else if (a.type === 'pinch') {
        setView(zoomAround(view, frame, { from: a.from, to: a.to, zoom: view.zoom * a.scale }));
        swept = true;
      } else if (a.type === 'doubleTap') {
        // The first tap already acted, as a single tap does; the second one only zooms.
        eatNextUntil = t + STRAY_CLICK_MS;
        if (zoomed()) reset();
        else setView(zoomAround(view, frame, { from: a, to: a, zoom: doubleTapZoom }));
      } else if (a.type === 'gestureEnd') {
        // Only a sequence that really moved the view or had two fingers can end in a
        // stray click. A jittery tap that moved nothing (the whole grid fits) is a tap.
        if (swept) strayUntil = t + STRAY_CLICK_MS;
        swept = false;
      }
    }
  }

  function onDown(e) {
    if (!measured && !measure()) return;
    eatNextUntil = 0;
    if (touching.size > 0) swept = true;
    else origin = svg.getBoundingClientRect();
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
    run(tracker.up(e.pointerId, p.x, p.y, e.timeStamp), e.timeStamp);
  }
  function onCancel(e) {
    if (!touching.delete(e.pointerId)) return;
    run(tracker.cancel(e.pointerId), e.timeStamp);
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
    printing = on;
    apply();
  };
  const beforePrint = setPrinting(true);
  const afterPrint = setPrinting(false);
  win.addEventListener('beforeprint', beforePrint);
  win.addEventListener('afterprint', afterPrint);

  refresh();

  function destroy() {
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
    if (observer) observer.disconnect();
    else win.removeEventListener('resize', refresh);
    win.removeEventListener('beforeprint', beforePrint);
    win.removeEventListener('afterprint', afterPrint);
  }

  return { reveal, refresh, reset, zoomed, destroy };
}

export { attachSvgZoom };
