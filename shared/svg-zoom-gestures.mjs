// Pure gesture recognizer for the generic SVG zoom: it turns a stream of pointer
// down/move/up/cancel calls into pan, pinch, tap and double-tap actions. It touches no
// DOM and knows nothing about puzzles. Coordinates are px and times are ms.
//
// A sequence (first pointer down to last pointer up) is exactly one of: a tap, a
// double-tap, or a gesture (a pan, or anything that had a second pointer).

const DEFAULTS = { tapSlop: 10, doubleTapMs: 300, doubleTapSlop: 15 };

// Creates a recognizer. Each of down/move/up/cancel returns an array of actions:
//   { type: 'pan', dx, dy }                        finger movement since the last action
//   { type: 'pinch', from: {x,y}, to: {x,y}, scale }  previous and new midpoints, and the
//                                                  ratio of the new finger distance to the old
//   { type: 'tap', x, y }                          returned by the up
//   { type: 'doubleTap', x, y }                    returned by the up
//   { type: 'gestureEnd' }                         the last pointer lifted or was canceled
//                                                  after a pan or a second pointer
// Only the first two pointers are tracked; a third is ignored. forget() drops a tap
// that was waiting to pair into a double-tap.
function createGestureTracker(options = {}) {
  const { tapSlop, doubleTapMs, doubleTapSlop } = { ...DEFAULTS, ...options };
  // Tracked pointers by id: its start (x0, y0), last position (x, y), and whether it's
  // panning (past the slop, or part of a multi-pointer sequence).
  const pointers = new Map();
  let gesture = false; // this sequence has become a pan or pinch
  let double = false; // this sequence began as a possible double-tap's second tap
  let lastTap = null; // { x, y, t } of the previous tap's up, while it can still pair
  let prevDist = 0;
  let prevMid = { x: 0, y: 0 };

  // The distance and midpoint of the two tracked pointers.
  function pair() {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  // Ends a sequence whose last pointer is gone, forgetting any pending double-tap.
  function endSequence() {
    gesture = false;
    double = false;
    lastTap = null;
  }

  function down(id, x, y, t) {
    if (pointers.has(id) || pointers.size >= 2) return [];
    const p = { x0: x, y0: y, x, y, panning: false };
    if (pointers.size === 0) {
      // First pointer of a sequence: it may be a double-tap's second tap.
      gesture = false;
      double = Boolean(
        lastTap && t - lastTap.t <= doubleTapMs
        && Math.hypot(x - lastTap.x, y - lastTap.y) <= doubleTapSlop,
      );
      lastTap = null;
      pointers.set(id, p);
      return [];
    }
    // Second pointer: the sequence is a gesture whether or not anything moves.
    gesture = true;
    double = false;
    p.panning = true;
    for (const other of pointers.values()) other.panning = true;
    pointers.set(id, p);
    ({ dist: prevDist, mid: prevMid } = pair());
    return [];
  }

  function move(id, x, y) {
    const p = pointers.get(id);
    if (!p) return [];
    if (pointers.size === 2) {
      // Two pointers: report the midpoint travel and the change in spread.
      p.x = x;
      p.y = y;
      const { dist, mid } = pair();
      const action = {
        type: 'pinch', from: prevMid, to: mid, scale: prevDist > 0 ? dist / prevDist : 1,
      };
      prevDist = dist;
      prevMid = mid;
      return [action];
    }
    // One pointer: stay a tap until it leaves the slop, then pan from where it started.
    if (!p.panning) {
      if (Math.hypot(x - p.x0, y - p.y0) <= tapSlop) return [];
      p.panning = true;
      gesture = true;
    }
    const action = { type: 'pan', dx: x - p.x, dy: y - p.y };
    p.x = x;
    p.y = y;
    return [action];
  }

  function up(id, x, y, t) {
    if (!pointers.has(id)) return [];
    const wasPair = pointers.size === 2;
    pointers.delete(id);
    if (wasPair) {
      // The remaining pointer keeps panning, with no slop.
      return [];
    }
    if (gesture) {
      endSequence();
      return [{ type: 'gestureEnd' }];
    }
    if (double) {
      endSequence();
      return [{ type: 'doubleTap', x, y }];
    }
    lastTap = { x, y, t };
    return [{ type: 'tap', x, y }];
  }

  function cancel(id) {
    if (!pointers.has(id)) return [];
    pointers.delete(id);
    if (pointers.size > 0) return [];
    const wasGesture = gesture;
    endSequence();
    return wasGesture ? [{ type: 'gestureEnd' }] : [];
  }

  // Drops a tap waiting to pair into a double-tap, for the caller to say that something
  // else happened in between (a touch elsewhere), which makes the next tap a plain tap.
  function forget() {
    lastTap = null;
  }

  return { down, move, up, cancel, forget };
}

export { createGestureTracker };
