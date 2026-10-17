'use strict';
// Undo/redo over immutable snapshots. Models are never mutated, so a snapshot is just the
// model object itself.

function createHistory(present) {
  return { past: [], present, future: [], lastKey: null };
}

// Commits `next` as one undo step. A commit whose key equals the previous commit's
// replaces the present instead (typing bursts coalesce).
function commit(h, next, { key = null, limit = 200 } = {}) {
  if (next === h.present) return h;
  if (key !== null && key === h.lastKey) return { ...h, present: next, future: [] };
  return {
    past: [...h.past, h.present].slice(-limit),
    present: next,
    future: [],
    lastKey: key,
  };
}

function undo(h) {
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    lastKey: null,
  };
}

function redo(h) {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
    lastKey: null,
  };
}

const canUndo = (h) => h.past.length > 0;
const canRedo = (h) => h.future.length > 0;

module.exports = { createHistory, commit, undo, redo, canUndo, canRedo };
