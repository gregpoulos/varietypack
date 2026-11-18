'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeHelpActions, makeHelpRecord, makeBoardChecker, makeComposer } = require('../engine-state.mjs');

// A three-cell board with a real checker, composer and help record, and a log of every
// call the actions make, in order, so the tests can pin the order itself: the save must
// come after the completion path, or a board an action finished reloads unsolved.
const ANSWER = { 0: 'a', 1: 'b', 2: 'c' };
function harness({ content = {}, marked = [], composing = null, hooks = {} } = {}) {
  const store = { ...content };
  const marks = new Map(marked.map(n => [n, 'checked']));
  const log = [];
  const composer = makeComposer({
    getContent: n => store[n] || '', setContent: (n, s) => { store[n] = s; },
    onCommit: () => {}, isSolved: () => false,
  });
  if (composing !== null) composer.toggle(composing);
  const helpRecord = makeHelpRecord();
  const checker = makeBoardChecker({
    cellIds: [0, 1, 2], getContent: n => store[n] || '', isCellFilled: composer.isCellFilled,
    isCellConfirmedRight: n => marks.has(n) && marks.get(n) !== 'wrong',
    isCellMarkedWrong: n => marks.get(n) === 'wrong', hashed: false, getExpected: n => ANSWER[n],
    getBoardHash: () => 'h', markSolved: () => log.push('markSolved'), syncUI: () => log.push('checkerSync'),
  });
  const actions = makeHelpActions({
    checker, composer, helpRecord,
    setCellLetter: (n, s) => { log.push(`write ${n}`); store[n] = s; marks.delete(n); },
    setMark: (n, mark) => { log.push(`mark ${n}`); if (mark) marks.set(n, mark); else marks.delete(n); },
    saveState: () => log.push('save'),
    syncUI: () => log.push('sync'),
    refocus: () => log.push('refocus'),
    flashWrong: wrong => log.push(`flash ${wrong.join(',')}`),
    ...hooks,
  });
  return { actions, helpRecord, log, store, marks, composer, checker };
}

test('checkSet marks the right cells checked and the wrong ones wrong, flashes the wrong, counts one check, then saves', () => {
  const { actions, helpRecord, log, marks } = harness({ content: { 0: 'a', 1: 'x' } });
  actions.checkSet([0, 1, 2]);
  assert.deepEqual([...marks], [[0, 'checked'], [1, 'wrong']]);
  assert.deepEqual(helpRecord.get(), { checks: 1, reveals: 0 });
  // Both marks precede the save, so a reload keeps the slash.
  assert.deepEqual(log, ['mark 0', 'mark 1', 'save', 'flash 1', 'sync', 'refocus']);
});

test('revealSet turns a wrong cell revealed', () => {
  const { actions, marks, store } = harness({ content: { 0: 'x' } });
  actions.checkSet([0]);
  assert.equal(marks.get(0), 'wrong');
  actions.revealSet([0]);
  assert.equal(marks.get(0), 'revealed');
  assert.equal(store[0], 'a');
});

test('checkSet over cells with nothing to check counts nothing, writes nothing, and refocuses', () => {
  const { actions, helpRecord, log } = harness();
  actions.checkSet([0, 1, 2]);
  assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 0 });
  assert.deepEqual(log, ['refocus']);
});

test('checkSet runs beforeCheck first, so a typed cell can be committed into the check', () => {
  const calls = [];
  const { actions } = harness({ hooks: { beforeCheck: () => calls.push('before') } });
  actions.checkSet([0]);
  assert.deepEqual(calls, ['before']);
});

// A solved board takes no help: the rows are disabled, but the action guards itself.
test('checkSet and revealSet do nothing on a solved board', () => {
  const { actions, helpRecord, log, marks } = harness({ content: { 0: 'a', 1: 'b', 2: 'c' } });
  actions.checkSet([0, 1, 2]);
  actions.revealSet([0, 1, 2]);
  assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 0 });
  assert.equal(marks.size, 0);
  assert.deepEqual(log, ['refocus', 'refocus']);
});

// Crushword's beforeCheck commits the typed cell, and that commit can itself finish the
// board: the completion event has gone out by then, so the check must count nothing.
test('checkSet does nothing when the commit beforeCheck makes solves the board', () => {
  const h = harness({
    content: { 0: 'a', 1: 'b', 2: 'c' }, composing: 2,
    hooks: { beforeCheck: () => h.composer.toggle(2) },
  });
  h.actions.checkSet([0, 1, 2]);
  assert.deepEqual(h.helpRecord.get(), { checks: 0, reveals: 0 });
  assert.equal(h.marks.size, 0);
  assert.deepEqual(h.log, ['refocus']);
});

test('revealSet writes and marks, counts one reveal, runs the completion path, then saves', () => {
  const { actions, helpRecord, log, store } = harness({ content: { 0: 'a', 1: 'b' } });
  actions.revealSet([2]);
  assert.equal(store[2], 'c');
  assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 1 });
  // Revealing the last cell fills the board with the right content: checkIfFilled paints
  // it solved and syncs, and only then does the action save.
  assert.deepEqual(log, [
    'write 2', 'mark 2', 'markSolved', 'checkerSync', 'save', 'sync', 'refocus',
  ]);
});

test('revealSet that finishes the board saves after markSolved', () => {
  const { actions, log } = harness({ content: { 0: 'a', 1: 'b', 2: 'x' } });
  actions.revealSet([2]);
  assert.ok(log.indexOf('markSolved') !== -1);
  assert.ok(log.indexOf('save') > log.indexOf('markSolved'), JSON.stringify(log));
});

test('revealSet over cells that are all confirmed right counts nothing and refocuses', () => {
  const { actions, helpRecord, log } = harness({ content: ANSWER, marked: [0, 1, 2] });
  actions.revealSet([0, 1, 2]);
  assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 0 });
  assert.deepEqual(log, ['refocus']);
});

test('revealSet ends a half-typed cell without committing it, and afterReveal replaces the sync', () => {
  const calls = [];
  const { actions, store } = harness({
    content: { 1: 'zz' }, composing: 1, hooks: { afterReveal: () => calls.push('after') },
  });
  actions.revealSet([1]);
  assert.equal(store[1], 'b');
  assert.deepEqual(calls, ['after']);
});

test('a reveal of other cells leaves an unconfirmed composing cell composing', () => {
  const { actions, composer } = harness({ content: { 0: 'a' }, composing: 0 });
  actions.revealSet([1]);
  assert.equal(composer.getComposing(), 0);
});

// Cell 1 already holds its answer, but the solver asked for it: revealed, not checked.
test('revealSet over a clue leaves checked cells checked and marks the rest revealed', () => {
  const { actions, helpRecord, marks, store } = harness({ content: { 0: 'a', 1: 'b' }, marked: [0] });
  actions.revealSet([0, 1, 2]);
  assert.deepEqual([0, 1, 2].map(n => marks.get(n)), ['checked', 'revealed', 'revealed']);
  assert.equal(store[2], 'c');
  assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 1 });
});
