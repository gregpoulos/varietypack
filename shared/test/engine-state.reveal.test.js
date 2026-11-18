'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { revealCells, makeComposer } = require('../engine-state.mjs');

// A one-cell board with a real composer, so what the tests assert about composition is
// the composer's own answer. `calls` records the order reveal touches things in.
function harness({ content = '', composing = false } = {}) {
  const store = { 1: content };
  const calls = [];
  const marks = {};
  const composer = makeComposer({
    getContent: n => store[n] || '',
    setContent: (n, s) => { store[n] = s; },
    onCommit:   () => calls.push('commit'),
    isSolved:   () => false,
  });
  if (composing) composer.toggle(1);
  const setCellLetter = (n, s) => { calls.push('write'); store[n] = s; delete marks[n]; };
  const setMark = (n, mark) => { calls.push('mark'); if (mark) marks[n] = mark; else delete marks[n]; };
  const reveal = expected => revealCells({
    ids: [1], composer, getContent: n => store[n] || '', getExpected: () => expected,
    canReveal: () => true, setCellLetter, setMark,
  });
  return { composer, store, calls, marks, reveal };
}

test('reveal drops composition, then writes the answer, then marks the cell revealed', () => {
  const { composer, calls, reveal } = harness({ content: 'h', composing: true });
  const realReset = composer.reset;
  composer.reset = () => { calls.push('reset'); realReset(); };
  reveal('a');
  assert.deepEqual(calls, ['reset', 'write', 'mark']);
});

test('revealing a composing cell leaves it filled and no longer composing', () => {
  const { composer, store, reveal } = harness({ content: 'ha', composing: true });
  assert.equal(composer.isComposing(1), true);
  assert.equal(composer.isCellFilled(1), false);
  reveal('r');
  assert.equal(composer.isComposing(1), false);
  assert.equal(composer.isCellFilled(1), true);
  assert.equal(store[1], 'r');
});

test('reveal never commits the half-typed prefix', () => {
  const { calls, reveal } = harness({ content: 'ha', composing: true });
  reveal('hare');
  assert.ok(!calls.includes('commit'), 'onCommit must not run');
});

test('reveal writes a rebus answer whole', () => {
  const { store, marks, reveal } = harness();
  reveal('bc');
  assert.equal(store[1], 'bc');
  assert.equal(marks[1], 'revealed');
});

test('reveal replaces a wrong letter', () => {
  const { store, marks, reveal } = harness({ content: 'z' });
  reveal('a');
  assert.equal(store[1], 'a');
  assert.equal(marks[1], 'revealed');
});

test('reveal on an empty cell fills it', () => {
  const { store, composer, reveal } = harness();
  reveal('a');
  assert.equal(store[1], 'a');
  assert.equal(composer.isCellFilled(1), true);
});

// ── revealCells: Reveal clue and Reveal puzzle ───────────────────────────────────────

const ANSWER = { 0: 'a', 1: 'bc', 2: 'd' };

// Three cells, a real composer, and a log of every write in order.
function multi({ content = {}, marked = [], composing = null } = {}) {
  const store = { ...content };
  const log = [];
  const marks = Object.fromEntries(marked.map(n => [n, 'checked']));
  const composer = makeComposer({
    getContent: n => store[n] || '',
    setContent: (n, s) => { store[n] = s; },
    onCommit:   () => log.push('commit'),
    isSolved:   () => false,
  });
  if (composing !== null) composer.toggle(composing);
  const realReset = composer.reset;
  composer.reset = () => { log.push('reset'); realReset(); };
  const run = ids => revealCells({
    ids, composer, getContent: n => store[n] || '', getExpected: n => ANSWER[n],
    canReveal: n => !marks[n],
    setCellLetter: (n, s) => { log.push(`write ${n}`); store[n] = s; delete marks[n]; },
    setMark: (n, mark) => { log.push(`mark ${n}`); if (mark) marks[n] = mark; else delete marks[n]; },
  });
  return { store, log, marks, composer, run };
}

test('revealCells ends composition first, then writes and marks each cell in turn', () => {
  const { log, run } = multi({ content: { 1: 'x' }, composing: 1 });
  run([0, 1, 2]);
  assert.deepEqual(log, [
    'reset', 'write 0', 'mark 0', 'write 1', 'mark 1', 'write 2', 'mark 2',
  ]);
});

test('revealCells fills every cell with its answer and leaves none composing', () => {
  const { store, composer, marks, run } = multi({ content: { 1: 'x' }, composing: 1 });
  run([0, 1, 2]);
  assert.deepEqual(store, { 0: 'a', 1: 'bc', 2: 'd' });
  assert.equal(composer.getComposing(), null);
  assert.deepEqual(marks, { 0: 'revealed', 1: 'revealed', 2: 'revealed' });
});

test('revealCells leaves a cell already confirmed right untouched', () => {
  const { store, log, run } = multi({ content: { 0: 'a' }, marked: [0] });
  run([0, 1]);
  assert.ok(!log.includes('write 0'), 'the correct cell is not rewritten');
  assert.equal(store[1], 'bc');
});

test('revealCells never commits a half-typed prefix', () => {
  const { log, run } = multi({ content: { 2: 'dd' }, composing: 2 });
  run([2]);
  assert.ok(!log.includes('commit'));
});

test('revealCells reveals only the cells it is given', () => {
  const { store, run } = multi();
  run([1]);
  assert.deepEqual(store, { 1: 'bc' });
});

// Composition is dropped only on a cell that is actually revealed. A cell already marked
// correct can still be composing (Enter on it opens composition), and a reveal that
// doesn't touch it must not end that composition.
test('revealCells leaves composition alone on a composing cell it does not reveal', () => {
  const { log, composer, run } = multi({ content: { 0: 'a' }, marked: [0], composing: 0 });
  run([0, 1]);
  assert.equal(composer.getComposing(), 0);
  assert.ok(!log.includes('reset'));
  assert.ok(log.includes('write 1'), 'the other cell is still revealed');
});

test('revealCells ends composition on a composing cell it does reveal', () => {
  const { log, composer, run } = multi({ content: { 1: 'x' }, composing: 1 });
  run([0, 1]);
  assert.equal(composer.getComposing(), null);
  assert.equal(log[0], 'reset');
});

// ── A cell already holding the answer is still revealed, its letter left alone ──────

test('reveal marks a cell already holding the answer revealed and leaves its letter', () => {
  const { store, calls, marks, reveal } = harness({ content: 'a' });
  reveal('a');
  assert.equal(marks[1], 'revealed');
  assert.equal(store[1], 'a');
  assert.ok(!calls.includes('write'), 'the letter is not rewritten');
});

// Crushword composes every cell as it is typed, so a just-typed right letter is
// composing when Reveal arrives; it must come out unrewritten, as in the other tools.
test('reveal ends composition before comparing, so a composing cell holding the answer is not rewritten', () => {
  const { composer, calls, marks, reveal } = harness({ content: 'ha', composing: true });
  reveal('ha');
  assert.equal(composer.isComposing(1), false);
  assert.equal(marks[1], 'revealed');
  assert.ok(!calls.includes('write'), 'the letter is not rewritten');
  assert.ok(!calls.includes('commit'), 'onCommit must not run');
});

test('reveal of a half-typed prefix writes the answer and marks it revealed', () => {
  const { store, marks, reveal } = harness({ content: 'h', composing: true });
  reveal('ha');
  assert.equal(store[1], 'ha');
  assert.equal(marks[1], 'revealed');
});
