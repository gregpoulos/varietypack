'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { boolPref, storageKey, setupStorage } = require('../engine-chrome.mjs');

// A Map-backed stand-in for the browser's localStorage.
beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
});

// Saves `state` for a puzzle, then reports what a page for `other`, whose board accepts
// a save when `fits` says so, would restore.
function saveThenRestore(puzzle, other, { state = { letters: { 1: 'A' } }, fits = () => true } = {}) {
  setupStorage(storageKey('cw', puzzle), { getState: () => state, applyState: () => {}, fits }).saveState();
  let restored = null;
  setupStorage(storageKey('cw', other), { getState: () => ({}), applyState: s => { restored = s; }, fits }).restoreState();
  return restored;
}

const PUZZLE = { title: 'T', date: '2026', boardHash: 'aaa' };

test('the same puzzle restores its own save', () => {
  assert.deepEqual(saveThenRestore(PUZZLE, PUZZLE)?.letters, { 1: 'A' });
});

// An author who fixes an answer or a grid and republishes keeps the title and date. The
// old save names cells of the old board, so it must not be applied to the new one.
test('a revised puzzle with the same title and date starts fresh', () => {
  assert.equal(saveThenRestore(PUZZLE, { ...PUZZLE, boardHash: 'bbb' }), null);
});

// Two boards can share a key (a Crushword hash leaves out where the blocks are), so the
// board decides whether a save under its key is its own.
test('a save the board says does not fit starts fresh', () => {
  assert.equal(saveThenRestore(PUZZLE, PUZZLE, { fits: () => false }), null);
});

test('clearState removes the save', () => {
  const key = storageKey('cw', PUZZLE);
  const storage = setupStorage(key, { getState: () => ({ letters: {} }), applyState: () => {}, fits: () => true });
  storage.saveState();
  storage.clearState();
  assert.equal(localStorage.getItem(key), null);
});

// The phone's first-visit instructions show when there is nothing to restore, so hasSave
// must agree with restoreState about what counts as a save.
test('hasSave is true only for a save restoreState would apply', () => {
  const key = storageKey('cw', PUZZLE);
  const make = fits => setupStorage(key, { getState: () => ({ letters: {} }), applyState: () => {}, fits });
  assert.equal(make(() => true).hasSave(), false);
  make(() => true).saveState();
  assert.equal(make(() => true).hasSave(), true);
  assert.equal(make(() => false).hasSave(), false);
});

// ── boolPref ─────────────────────────────────────────────────────────────────────────

test('boolPref: absent loads the fallback; a saved value loads back', () => {
  const pref = boolPref('vp:test:pref', true);
  assert.equal(pref.load(), true);
  pref.save(false);
  assert.equal(pref.load(), false);
  assert.equal(boolPref('vp:test:pref', true).load(), false);
});

test('boolPref: a throwing storage loads the fallback and saves nothing, silently', () => {
  const throwing = {
    getItem() { throw new Error('storage unavailable'); },
    setItem() { throw new Error('storage unavailable'); },
  };
  const pref = boolPref('vp:test:pref', false, throwing);
  assert.equal(pref.load(), false);
  assert.doesNotThrow(() => pref.save(true));
});

// A sandboxed iframe throws on merely reading window.localStorage, so the default
// storage must be looked up inside the guard, not as a parameter default.
test('boolPref: an unreadable localStorage global loads the fallback', () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get() { throw new Error('SecurityError'); },
  });
  try {
    const pref = boolPref('vp:test:pref', true);
    assert.equal(pref.load(), true);
    assert.doesNotThrow(() => pref.save(false));
  } finally {
    Object.defineProperty(globalThis, 'localStorage', saved);
  }
});
