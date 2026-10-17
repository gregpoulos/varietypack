'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { ranges, entryAt, addBreak, removeBreak, reanchor, orphanOf } = require('../src/model/starts');

const E = (id, clue = '') => ({ id, clue });
const cut = (starts, ids, clues = []) => ({ starts, entries: ids.map((id, i) => E(id, clues[i] ?? '')) });
function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

test('ranges: each entry covers [start, next start) and the last runs to the total', () => {
  assert.deepEqual(ranges([0, 4, 9], 12), [[0, 4], [4, 9], [9, 12]]);
});

test('entryAt: the entry whose range holds the index', () => {
  assert.equal(entryAt([0, 4, 9], 0), 0);
  assert.equal(entryAt([0, 4, 9], 3), 0);
  assert.equal(entryAt([0, 4, 9], 4), 1);
  assert.equal(entryAt([0, 4, 9], 11), 2);
});

test('addBreak: the left part keeps its id and clue, the new entry follows it', () => {
  const c = deepFreeze(cut([0, 6], ['a', 'b'], ['A clue', 'B clue']));
  const out = addBreak(c, 3, E('n'));
  assert.deepEqual(out.starts, [0, 3, 6]);
  assert.deepEqual(out.entries.map(e => e.id), ['a', 'n', 'b']);
  assert.equal(out.entries[0].clue, 'A clue');
  assert.equal(out.entries[1].clue, '');
});

test('addBreak: refuses index 0 and an existing start', () => {
  assert.throws(() => addBreak(cut([0, 6], ['a', 'b']), 0, E('n')), /break/);
  assert.throws(() => addBreak(cut([0, 6], ['a', 'b']), 6, E('n')), /break/);
});

test('removeBreak: the left entry survives and a non-empty clue is orphaned', () => {
  const c = deepFreeze(cut([0, 3, 6], ['a', 'b', 'c'], ['A', 'B', 'C']));
  const { cut: out, orphan } = removeBreak(c, 3, 'inward 2');
  assert.deepEqual(out.starts, [0, 6]);
  assert.deepEqual(out.entries.map(e => e.id), ['a', 'c']);
  assert.deepEqual(orphan, { id: 'b', clue: 'B', from: 'inward 2' });
});

test('removeBreak: an empty clue leaves no orphan, and displayAnswer travels with the orphan', () => {
  assert.equal(removeBreak(cut([0, 3], ['a', 'b']), 3, 'x').orphan, null);
  const c = { starts: [0, 3], entries: [E('a'), { id: 'b', clue: 'B', displayAnswer: 'LIE TO' }] };
  assert.equal(removeBreak(c, 3, 'x').orphan.displayAnswer, 'LIE TO');
});

test('removeBreak: only an existing break above 0 can be removed', () => {
  assert.throws(() => removeBreak(cut([0, 3], ['a', 'b']), 0, 'x'), /break/);
  assert.throws(() => removeBreak(cut([0, 3], ['a', 'b']), 2, 'x'), /break/);
});

const label = j => `entry ${j + 1}`;

test('reanchor: an insert before a break shifts it', () => {
  const c = cut([0, 5], ['a', 'b']);
  const { cut: out, orphans } = reanchor(c, { start: 2, removed: 0, inserted: 1 }, 11, label);
  assert.deepEqual(out.starts, [0, 6]);
  assert.deepEqual(orphans, []);
});

test('reanchor: an insert after a break leaves it', () => {
  const { cut: out } = reanchor(cut([0, 5], ['a', 'b']), { start: 8, removed: 0, inserted: 1 }, 11, label);
  assert.deepEqual(out.starts, [0, 5]);
});

test('reanchor: a break exactly at the edit start stays', () => {
  const { cut: out } = reanchor(cut([0, 5], ['a', 'b']), { start: 5, removed: 0, inserted: 2 }, 12, label);
  assert.deepEqual(out.starts, [0, 5]);
});

test('reanchor: a deletion spanning a break collapses it, orphaning a non-empty clue', () => {
  const c = cut([0, 4, 8], ['a', 'b', 'c'], ['A', 'B', 'C']);
  // delete cells 3..5 (removed 3): the break at 4 sits inside the span -> maps to 3,
  // equals no other start
  const { cut: out, orphans } = reanchor(c, { start: 3, removed: 3, inserted: 0 }, 9, label);
  assert.deepEqual(out.starts, [0, 3, 5]);
  assert.deepEqual(orphans, []);
  // a span that swallows two breaks: both map to edit.start, the second merges away
  const c2 = cut([0, 4, 5, 9], ['a', 'b', 'c', 'd'], ['A', 'B', 'C', 'D']);
  const r2 = reanchor(c2, { start: 3, removed: 3, inserted: 0 }, 9, label);
  assert.deepEqual(r2.cut.starts, [0, 3, 6]);
  assert.deepEqual(r2.cut.entries.map(e => e.id), ['a', 'b', 'd']);
  assert.deepEqual(r2.orphans, [{ id: 'c', clue: 'C', from: 'entry 3' }]);
});

test('reanchor: shrinking the total below a start merges it away', () => {
  const c = cut([0, 4, 9], ['a', 'b', 'c'], ['A', 'B', 'C']);
  const { cut: out, orphans } = reanchor(c, { start: 6, removed: 6, inserted: 0 }, 6, label);
  assert.deepEqual(out.starts, [0, 4]);
  assert.deepEqual(orphans, [{ id: 'c', clue: 'C', from: 'entry 3' }]);
});

test('reanchor never mutates its input', () => {
  const c = deepFreeze(cut([0, 4, 9], ['a', 'b', 'c'], ['A', 'B', 'C']));
  assert.doesNotThrow(() => reanchor(c, { start: 2, removed: 5, inserted: 0 }, 6, label));
});

test('orphanOf: a clue of only spaces is no clue, as completeness and attaching already treat it', () => {
  assert.equal(orphanOf({ id: 'e1', clue: '' }, 'x'), null);
  assert.equal(orphanOf({ id: 'e1', clue: '   ' }, 'x'), null);
  assert.deepEqual(orphanOf({ id: 'e1', clue: ' hi ' }, 'x'), { id: 'e1', clue: ' hi ', from: 'x' });
});

