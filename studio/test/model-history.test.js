'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { createHistory, commit, undo, redo, canUndo, canRedo } = require('../src/model/history');

test('commit, then undo, then redo restores', () => {
  let h = createHistory('a');
  h = commit(h, 'b');
  assert.equal(h.present, 'b');
  assert.equal(canUndo(h), true);
  h = undo(h);
  assert.equal(h.present, 'a');
  assert.equal(canRedo(h), true);
  h = redo(h);
  assert.equal(h.present, 'b');
  assert.equal(canRedo(h), false);
});

test('the same key coalesces into one step', () => {
  let h = createHistory('a');
  h = commit(h, 'b', { key: 'type' });
  h = commit(h, 'c', { key: 'type' });
  assert.equal(h.past.length, 1);
  assert.equal(undo(h).present, 'a');
});

test('a different key starts a new step', () => {
  let h = createHistory('a');
  h = commit(h, 'b', { key: 'type' });
  h = commit(h, 'c', { key: 'clue:inward:e1' });
  assert.equal(h.past.length, 2);
});

test('no key never coalesces', () => {
  let h = createHistory('a');
  h = commit(h, 'b');
  h = commit(h, 'c');
  assert.equal(h.past.length, 2);
});

test('undo ends a coalescing run', () => {
  let h = createHistory('a');
  h = commit(h, 'b', { key: 'type' });
  h = undo(h);
  h = commit(h, 'c', { key: 'type' });
  assert.equal(h.past.length, 1);
  assert.equal(h.present, 'c');
});

test('a commit after an undo clears the future', () => {
  let h = commit(createHistory('a'), 'b');
  h = undo(h);
  h = commit(h, 'c');
  assert.equal(canRedo(h), false);
});

test('a coalesced commit also clears the future', () => {
  let h = commit(createHistory('a'), 'b', { key: 'k' });
  h = commit(h, 'c', { key: 'k' });
  h = undo(h);
  h = commit(h, 'd', { key: 'k' });
  assert.deepEqual(h.future, []);
});

test('the limit keeps only the most recent steps', () => {
  let h = createHistory(0);
  for (let i = 1; i <= 10; i++) h = commit(h, i, { limit: 3 });
  assert.deepEqual(h.past, [7, 8, 9]);
});

test('a no-op commit returns the same object', () => {
  const h = createHistory('a');
  assert.equal(commit(h, 'a'), h);
});

test('undo and redo at the ends return the same object', () => {
  const h = createHistory('a');
  assert.equal(undo(h), h);
  assert.equal(redo(h), h);
});
