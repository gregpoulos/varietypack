// Pure geometry for the generic SVG viewBox zoom. It knows nothing about puzzles, cells
// or the DOM: it maps a view (zoom factor plus visible center) to the viewBox rectangle
// that shows it, and back again for pinch, pan and reveal. It also holds the rubber band
// that lets a gesture stretch past the limits.
//
// Vocabulary:
//   Box   { x, y, width, height }, in SVG user units.
//   Frame { base, pane, maxZoom, bleed, marginPx, zoomStretch }: `base` is the SVG's
//         original viewBox, `pane` is the SVG element's on-screen size in px, `maxZoom` is
//         a multiple of the fit scale. On an axis the base doesn't fit, a view may pan
//         past `base` by `bleed` user units or `marginPx` screen px, whichever is more
//         (both optional, default 0): the bleed so a stroke centered on the grid's outer
//         edge isn't half cut off by the zoomed SVG's clip, the margin so the solver sees
//         the grid end. Neither changes the fit scale or the zoom 1 view. `zoomStretch`
//         (optional, default 0: none) is the rubber band's reach for a zoom past its
//         limits, in log-zoom units.
//   View  { zoom, cx, cy }: `zoom` as a multiple of the fit scale, >= 1 except while a
//         gesture stretches it; (cx, cy) is the visible center in user units.

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

// The range one axis's center may take: a single point, the base's center, when the
// visible extent covers the base (it `fits`); otherwise the range that keeps the visible
// extent inside the base widened by `extra` on both sides. Whether it fits is decided
// against the base alone, so a margin never stops the whole grid from fitting. The
// margin grows in with the overflow, never more than half of it, so the range widens
// from that point smoothly as a pinch makes the axis stop fitting: a jump there would
// show as one in a view stretched on that axis.
function axisRange(visible, start, extent, extra) {
  if (visible >= extent) return { fits: true, lo: start + extent / 2, hi: start + extent / 2 };
  const pad = Math.min(extra, (extent - visible) / 2);
  return { fits: false, lo: start - pad + visible / 2, hi: start + extent + pad - visible / 2 };
}

// Both axes' center ranges at `zoom`, unclamped: the stretch needs them at the zoom it
// shows, which may lie outside [1, maxZoom].
function limitsAt(zoom, frame) {
  const size = visibleSize({ zoom }, frame);
  const k = fitScale(frame) * zoom;
  const extra = Math.max(frame.bleed || 0, (frame.marginPx || 0) / k);
  const { base } = frame;
  return {
    x: axisRange(size.width, base.x, base.width, extra),
    y: axisRange(size.height, base.y, base.height, extra),
  };
}

const clampTo = (value, range) => Math.min(Math.max(value, range.lo), range.hi);

// Clamps the zoom to [1, maxZoom] and the center to its range at that zoom.
function clampView(view, frame) {
  const zoom = Math.min(Math.max(view.zoom, 1), frame.maxZoom);
  const lim = limitsAt(zoom, frame);
  return { zoom, cx: clampTo(view.cx, lim.x), cy: clampTo(view.cy, lim.y) };
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
// top-left corner. With `clamp: false`, neither the zoom nor the center is clamped (a
// gesture's raw view, which stretchView displays).
function zoomAround(view, frame, { from, to, zoom }, { clamp = true } = {}) {
  const next = clamp ? Math.min(Math.max(zoom, 1), frame.maxZoom) : zoom;
  const fit = fitScale(frame);
  const kOld = fit * view.zoom;
  const kNew = fit * next;
  const box = viewBoxOf(view, frame);
  // The grid point under `from` in the old view.
  const px = box.x + from.x / kOld;
  const py = box.y + from.y / kOld;
  // The center that puts that point under `to` at the new scale.
  const moved = {
    zoom: next,
    cx: px - to.x / kNew + frame.pane.width / (2 * kNew),
    cy: py - to.y / kNew + frame.pane.height / (2 * kNew),
  };
  return clamp ? clampView(moved, frame) : moved;
}

// Pans by a finger movement of (dx, dy) px: the content follows the finger. With
// `clamp: false`, the center isn't clamped (a gesture's raw view).
function panBy(view, frame, dx, dy, { clamp = true } = {}) {
  const k = fitScale(frame) * view.zoom;
  const moved = { zoom: view.zoom, cx: view.cx - dx / k, cy: view.cy - dy / k };
  return clamp ? clampView(moved, frame) : moved;
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

// The rubber band's stiffness: iOS's scroll views, as reverse-engineered (Apple doesn't
// publish it). Lower is stiffer.
const RUBBER_C = 0.55;

// How far something dragged `excess` past a limit shows past it, both signed and in the
// same units as `dim`, the size the stretch can never reach: iOS's rubber-band curve,
// (1 − 1 / (x·c / d + 1)) · d. A `dim` of 0 means no stretch.
function rubberBand(excess, dim, c = RUBBER_C) {
  if (dim <= 0) return 0;
  const x = Math.abs(excess);
  return Math.sign(excess) * (1 - 1 / (x * c / dim + 1)) * dim;
}

// The inverse of rubberBand: the raw excess that shows as `shown`. rubberBand never
// reaches dim, but a view stretched before the pane shrank can show past the new dim;
// that is read as just short of it, a large finite excess with the right sign.
const UNBAND_MAX = 0.999;
function unrubberBand(shown, dim, c = RUBBER_C) {
  if (dim <= 0) return 0;
  const b = Math.min(Math.abs(shown), dim * UNBAND_MAX);
  return Math.sign(shown) * (b / (1 - b / dim)) / c;
}

// Maps a value past [lo, hi] through `band`, in units that `scale` converts to the
// band's own; a value inside is returned as is.
function bandOutside(value, lo, hi, scale, band) {
  if (value < lo) return lo + band((value - lo) * scale) / scale;
  if (value > hi) return hi + band((value - hi) * scale) / scale;
  return value;
}

// The view a gesture shows for its raw, unclamped view: inside the limits the raw view
// itself; past them, a zoom stretched by the rubber band in log space (reach
// `zoomStretch`) and a center stretched in screen px (reach: the pane's size on that
// axis), both measured at the zoom shown.
function stretchView(raw, frame) {
  const zoom = Math.exp(bandOutside(Math.log(raw.zoom), 0, Math.log(frame.maxZoom), 1,
    e => rubberBand(e, frame.zoomStretch || 0)));
  return stretchCenter(raw, zoom, frame, rubberBand);
}

// The inverse of stretchView, so a touch that catches a springing-back view continues
// from where it shows.
function unstretchView(shown, frame) {
  const zoom = Math.exp(bandOutside(Math.log(shown.zoom), 0, Math.log(frame.maxZoom), 1,
    e => unrubberBand(e, frame.zoomStretch || 0)));
  return { ...stretchCenter(shown, shown.zoom, frame, unrubberBand), zoom };
}

// A gesture's next raw view, for fingers whose midpoint went from pane point `from` to
// `to` while their spread grew by `scale` (a pan is scale 1). The zoom changes in raw
// space, where the band resists it; the move is worked out on the view shown, so the
// grid under the fingers keeps up with them even while an over-pinch shows less zoom
// than the raw view holds, and the raw center takes the same change.
function followFingers(raw, frame, { from, to, scale }) {
  const zoom = raw.zoom * scale;
  const shown = stretchView(raw, frame);
  const shownZoom = stretchView({ ...raw, zoom }, frame).zoom;
  const moved = zoomAround(shown, frame, { from, to, zoom: shownZoom }, { clamp: false });
  return { zoom, cx: raw.cx + moved.cx - shown.cx, cy: raw.cy + moved.cy - shown.cy };
}

// Applies `band` (rubberBand or its inverse) to each axis's center past its range at
// `zoom`, in screen px. An axis that fits has a single point for a range, so it stretches
// away from the base's center.
function stretchCenter(view, zoom, frame, band) {
  const lim = limitsAt(zoom, frame);
  const k = fitScale(frame) * zoom;
  const axis = (c, range, dim) => bandOutside(c, range.lo, range.hi, k, e => band(e, dim));
  return {
    zoom,
    cx: axis(view.cx, lim.x, frame.pane.width),
    cy: axis(view.cy, lim.y, frame.pane.height),
  };
}

// How far, in user units, the visible box must stop short of the base's edge for that
// side to count as having more grid beyond it.
const EDGE_EPS = 0.5;

// The sides of the visible box beyond which more of the base lies, measured against the
// base itself: a side resting in the bleed or margin has none. All false at zoom 1.
function edgesOf(view, frame) {
  if (view.zoom <= 1) return { top: false, right: false, bottom: false, left: false };
  const box = viewBoxOf(view, frame);
  const { base } = frame;
  return {
    top: box.y > base.y + EDGE_EPS,
    right: box.x + box.width < base.x + base.width - EDGE_EPS,
    bottom: box.y + box.height < base.y + base.height - EDGE_EPS,
    left: box.x > base.x + EDGE_EPS,
  };
}

export {
  initialView, fitScale, visibleSize, clampView, viewBoxOf, zoomAround, panBy, reveal,
  RUBBER_C, rubberBand, unrubberBand, stretchView, unstretchView, followFingers, edgesOf,
};
