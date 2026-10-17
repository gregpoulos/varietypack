'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { storageKey, setupStorage } = require('../engine-chrome.mjs');

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
