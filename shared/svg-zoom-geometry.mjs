// Pure geometry for the generic SVG viewBox zoom. It knows nothing about puzzles, cells
// or the DOM: it maps a view (zoom factor plus visible center) to the viewBox rectangle
// that shows it, and back again for pinch, pan and reveal.
//
// Vocabulary:
//   Box   { x, y, width, height }, in SVG user units.
//   Frame { base, pane, maxZoom }: `base` is the SVG's original viewBox, `pane` is the
//         SVG element's on-screen size in px, `maxZoom` is a multiple of the fit scale.
//   View  { zoom, cx, cy }: `zoom` >= 1 as a multiple of the fit scale; (cx, cy) is the
//         visible center in user units.

// The view that shows the whole base: zoom 1, centered on it.
function initialView(frame) {
  const { base } = frame;
  return { zoom: 1, cx: base.x + base.width / 2, cy: base.y + base.height / 2 };
}

// Px per user unit when the whole base fits the pane (zoom 1).
function fitScale(frame) {
  return Math.min(frame.pane.width / frame.base.width, frame.pane.height / frame.base.height);
}

// The visible extent in user units. It always has the pane's aspect ratio, so the
// viewBox never letterboxes except at zoom 1.
function visibleSize(view, frame) {
  const k = fitScale(frame) * view.zoom;
  return { width: frame.pane.width / k, height: frame.pane.height / k };
}

// Clamps one axis: center on the base when the visible extent covers it, otherwise keep
// the visible range inside it.
function clampAxis(center, visible, start, extent) {
  if (visible >= extent) return start + extent / 2;
  return Math.min(Math.max(center, start + visible / 2), start + extent - visible / 2);
}

// Clamps the zoom to [1, maxZoom] and the center so the view stays within the base.
function clampView(view, frame) {
  const zoom = Math.min(Math.max(view.zoom, 1), frame.maxZoom);
  const size = visibleSize({ zoom }, frame);
  const { base } = frame;
  return {
    zoom,
    cx: clampAxis(view.cx, size.width, base.x, base.width),
    cy: clampAxis(view.cy, size.height, base.y, base.height),
  };
}

// The visible rectangle of a view, ready to become a viewBox.
function viewBoxOf(view, frame) {
  const size = visibleSize(view, frame);
  return {
    x: view.cx - size.width / 2,
    y: view.cy - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

// Zooms to `zoom` (clamped) so that the grid point under pane point `from` at the old
// view ends up under pane point `to`. Pinch calls it incrementally with a moving
// midpoint; a double-tap calls it with from === to. Pane points are px from the pane's
// top-left corner.
function zoomAround(view, frame, { from, to, zoom }) {
  const next = Math.min(Math.max(zoom, 1), frame.maxZoom);
  const fit = fitScale(frame);
  const kOld = fit * view.zoom;
  const kNew = fit * next;
  const box = viewBoxOf(view, frame);
  // The grid point under `from` in the old view.
  const px = box.x + from.x / kOld;
  const py = box.y + from.y / kOld;
  // The center that puts that point under `to` at the new scale.
  return clampView({
    zoom: next,
    cx: px - to.x / kNew + frame.pane.width / (2 * kNew),
    cy: py - to.y / kNew + frame.pane.height / (2 * kNew),
  }, frame);
}

// Pans by a finger movement of (dx, dy) px: the content follows the finger.
function panBy(view, frame, dx, dy) {
  const k = fitScale(frame) * view.zoom;
  return clampView({ zoom: view.zoom, cx: view.cx - dx / k, cy: view.cy - dy / k }, frame);
}

// The pan along one axis that brings [start - m, end + m] into the visible range
// [center - visible / 2, center + visible / 2], or 0 if it's already inside. The margin
// shrinks when the rect barely fits, and never goes below 0.
function revealAxis(center, visible, start, extent, margin) {
  const m = Math.max(0, Math.min(margin, (visible - extent) / 2));
  const lo = center - visible / 2;
  const hi = center + visible / 2;
  if (start - m < lo) return start - m - lo;
  if (start + extent + m > hi) return start + extent + m - hi;
  return 0;
}

// Pans by the smallest amount that shows a rect, with `margin` units around it. `rects`
// is a preference list: per axis independently, the first rect no larger than the visible
// extent on that axis is used, or the last one if none fits. A view that already shows
// it is returned unchanged.
function reveal(view, frame, rects, margin) {
  const size = visibleSize(view, frame);
  const pick = (extentOf) => rects.find((rect) => extentOf(rect) <= extentOf(size))
    || rects[rects.length - 1];
  const rx = pick((b) => b.width);
  const ry = pick((b) => b.height);
  return clampView({
    zoom: view.zoom,
    cx: view.cx + revealAxis(view.cx, size.width, rx.x, rx.width, margin),
    cy: view.cy + revealAxis(view.cy, size.height, ry.y, ry.height, margin),
  }, frame);
}

export {
  initialView, fitScale, visibleSize, clampView, viewBoxOf, zoomAround, panBy, reveal,
};
