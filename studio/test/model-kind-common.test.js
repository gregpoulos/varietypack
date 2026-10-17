'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const common   = require('../src/model/kindCommon');
const { StructureError } = require('../src/model/errors');

test('runsLabel: 1-based, runs compressed', () => {
  assert.equal(common.runsLabel([2, 3, 4, 8]), '3–5, 9');
  assert.equal(common.runsLabel([0]), '1');
  assert.equal(common.runsLabel([0, 1]), '1–2');
});

test('sanitizeCell: lowercase letters and digits only', () => {
  assert.equal(common.sanitizeCell('Ab-3 c'), 'ab3c');
  assert.equal(common.sanitizeCell(''), '');
  assert.equal(common.sanitizeCell('Ñé'), 'ne');   // the build path's accent folding
});

test('toggleSorted: adds in order, removes when present, never mutates', () => {
  const list = Object.freeze([1, 5]);
  assert.deepEqual(common.toggleSorted(list, 3), [1, 3, 5]);
  assert.deepEqual(common.toggleSorted(list, 5), [1]);
});

test('remapCircles: keep before the edit, shift after it, drop inside a changed-size span', () => {
  assert.deepEqual(common.remapCircles([1, 6, 9], { start: 4, removed: 0, inserted: 2 }, 20), [1, 8, 11]);
  assert.deepEqual(common.remapCircles([1, 5, 9], { start: 4, removed: 3, inserted: 0 }, 20), [1, 6]);
  assert.deepEqual(common.remapCircles([1, 4], { start: 4, removed: 1, inserted: 1 }, 20), [1, 4]);   // swapped in place: kept
  assert.deepEqual(common.remapCircles([1, 9], { start: 4, removed: 0, inserted: 0 }, 5), [1]);        // past the new end
});

test('cumulativeStarts: where each list begins, and the total', () => {
  assert.deepEqual(common.cumulativeStarts([['a', 'b'], ['c'], ['d', 'e', 'f']]), { starts: [0, 2, 3], total: 6 });
  assert.deepEqual(common.cumulativeStarts([]), { starts: [], total: 0 });
});

test('parseEntryCells: cells per entry, with StructureErrors for anything off', () => {
  assert.deepEqual(common.parseEntryCells([{ clue: 'c', answer: 'A[BC]' }], 'entries'), [['a', 'bc']]);
  const bad = (entries, re) => assert.throws(() => common.parseEntryCells(entries, 'entries'), (e) => e instanceof StructureError && re.test(e.message));
  bad(undefined, /"entries" must be a list/);
  bad([null], /clue and an answer/);
  bad([{ clue: 'c' }], /muddled/);
  bad([{ clue: 'c', answer: 4 }], /answer must be text/);
  bad([{ clue: 1984, answer: 'AB' }], /clue must be text/);
  bad([{ clue: 'c', answer: 'A[' }], /unclosed/);
  bad([{ clue: 'c', answer: '—' }], /at least one letter/);
});

test('takeOrphan: the orphan is consumed; a non-empty target clue becomes a new orphan', () => {
  const orphans = [{ id: 'e9', clue: 'old', from: 'entry 4' }];
  const r = common.takeOrphan({ orphans, nextId: 12 }, 'e9', { clue: 'mine' }, 'entry 2');
  assert.equal(r.clue, 'old');
  assert.deepEqual(r.orphans, [{ id: 'e12', clue: 'mine', from: 'entry 2' }]);
  assert.equal(r.nextId, 13);
  const blank = common.takeOrphan({ orphans, nextId: 12 }, 'e9', { clue: '  ' }, 'entry 2');
  assert.deepEqual(blank.orphans, []);
  assert.equal(blank.nextId, 12);
  assert.equal(common.takeOrphan({ orphans, nextId: 12 }, 'nope', { clue: '' }, 'x'), null);
});

test('isModelBase: header, circles, orphans and nextId', () => {
  const base = { kind: 'k', header: { title: 'T' }, circles: [], orphans: [], nextId: 1 };
  assert.equal(common.isModelBase(base, 'k'), true);
  assert.equal(common.isModelBase({ ...base, kind: 'x' }, 'k'), false);
  assert.equal(common.isModelBase({ ...base, header: { title: 4 } }, 'k'), false);
  assert.equal(common.isModelBase(null, 'k'), false);
});

test('displayPatch: a blank text deletes the display answer', () => {
  assert.deepEqual(common.displayPatch({ id: 'e1', clue: 'c', displayAnswer: 'A B' }, ''), { id: 'e1', clue: 'c' });
  assert.deepEqual(common.displayPatch({ id: 'e1', clue: 'c' }, 'A B'), { id: 'e1', clue: 'c', displayAnswer: 'A B' });
});

test('isCut: starts strictly increasing from 0 and below the total, one sound entry each', () => {
  const entries = [{ id: 'a', clue: '' }, { id: 'b', clue: 'x' }];
  assert.equal(common.isCut({ starts: [0, 4], entries }, 9), true);
  assert.equal(common.isCut({ starts: [1, 4], entries }, 9), false);
  assert.equal(common.isCut({ starts: [0, 0], entries }, 9), false);
  assert.equal(common.isCut({ starts: [0, 9], entries }, 9), false);
  assert.equal(common.isCut({ starts: [0, 4], entries: entries.slice(1) }, 9), false);
  assert.equal(common.isCut({ starts: [0, 4], entries: [entries[0], { id: 'b' }] }, 9), false);
  assert.equal(common.isCut(null, 9), false);
});

test('isCells and isCircles: letters only, and circles that point at a cell', () => {
  assert.equal(common.isCells(['a', '', 'har', '4', 'r2']), true);
  assert.equal(common.isCells(['A']), false);
  assert.equal(common.isCells([null]), false);
  assert.equal(common.isCircles([0, 2], 3), true);
  assert.equal(common.isCircles([3], 3), false);
  assert.equal(common.isCircles([1.5], 3), false);
});
