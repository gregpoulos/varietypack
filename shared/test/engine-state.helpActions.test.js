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
  const markedSet = new Set(marked);
  const log = [];
  const composer = makeComposer({
    getContent: n => store[n] || '', setContent: (n, s) => { store[n] = s; },
    onCommit: () => {}, isSolved: () => false,
  });
  if (composing !== null) composer.toggle(composing);
  const helpRecord = makeHelpRecord();
  const checker = makeBoardChecker({
    cellIds: [0, 1, 2], getContent: n => store[n] || '', isCellFilled: composer.isCellFilled,
    isCellMarkedCorrect: n => markedSet.has(n), hashed: false, getExpected: n => ANSWER[n],
    getBoardHash: () => 'h', markSolved: () => log.push('markSolved'), syncUI: () => log.push('checkerSync'),
  });
  const actions = makeHelpActions({
    checker, composer, helpRecord,
    setCellLetter: (n, s) => { log.push(`write ${n}`); store[n] = s; markedSet.delete(n); },
    setCorrect: (n, on) => { log.push(`mark ${n}`); if (on) markedSet.add(n); },
    saveState: () => log.push('save'),
    syncUI: () => log.push('sync'),
    refocus: () => log.push('refocus'),
    flashWrong: wrong => log.push(`flash ${wrong.join(',')}`),
    ...hooks,
  });
  return { actions, helpRecord, log, store, markedSet, composer, checker };
}

test('checkSet marks the right cells, flashes the wrong, counts one check, then saves', () => {
  const { actions, helpRecord, log, markedSet } = harness({ content: { 0: 'a', 1: 'x' } });
  actions.checkSet([0, 1, 2]);
  assert.deepEqual([...markedSet], [0]);
  assert.deepEqual(helpRecord.get(), { checks: 1, reveals: 0 });
  assert.deepEqual(log, ['mark 0', 'save', 'flash 1', 'sync', 'refocus']);
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

test('checkSet that completes the board saves it solved: the save follows the completion path', () => {
  // Every cell right but unmarked is unreachable by typing; this pins the order anyway.
  const { actions, log } = harness({ content: { 0: 'a', 1: 'b', 2: 'c' } });
  actions.checkSet([0, 1, 2]);
  assert.ok(log.indexOf('save') > log.indexOf('mark 2'));
  assert.ok(log.indexOf('save') > log.indexOf('markSolved') || !log.includes('markSolved'));
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

test('revealSet over cells that are all correct counts nothing and refocuses', () => {
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

// A cell that composes while still marked correct holds exactly what was marked. When a
// help action's marks then finish the board, composition must end so the completion path
// (checkIfFilled returns early on a composing cell) runs.
test('revealSet that completes the board ends a composition left open on a correct cell', () => {
  const { actions, composer, checker, log } = harness({ content: { 0: 'a' } });
  actions.checkSet([0]);
  composer.toggle(0);
  assert.equal(composer.getComposing(), 0);
  actions.revealSet([0, 1, 2]);
  assert.equal(composer.getComposing(), null);
  assert.equal(checker.isBoardFilled(), true);
  assert.equal(log.filter(x => x === 'markSolved').length, 1);
});

test('checkSet that completes the board ends a composition left open on a correct cell', () => {
  const { actions, composer, checker, log, store } = harness({ content: { 0: 'a' } });
  actions.checkSet([0]);
  composer.toggle(0);
  assert.equal(composer.getComposing(), 0);
  store[1] = 'b'; store[2] = 'c';   // the rest filled in while cell 0 composes
  actions.checkSet([0, 1, 2]);
  assert.equal(composer.getComposing(), null);
  assert.equal(checker.isBoardFilled(), true);
  assert.equal(log.filter(x => x === 'markSolved').length, 1);
});

test('a help action that leaves the board unsolved leaves composition alone', () => {
  const { actions, composer } = harness({ content: { 0: 'a' } });
  actions.checkSet([0]);
  composer.toggle(0);
  actions.revealSet([1]);
  assert.equal(composer.getComposing(), 0);
});
