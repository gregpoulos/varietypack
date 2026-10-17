'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { newEntry, entryFromYaml, entryToYaml, circledPositions } = require('../src/model/entries');

test('newEntry: an empty entry with the given id', () => {
  assert.deepEqual(newEntry('e7'), { id: 'e7', clue: '', extra: {}, extraStyles: {} });
});

test('entryFromYaml: keeps "LIE TO" as displayAnswer, and none for "LIETO"', () => {
  const cells = ['l', 'i', 'e', 't', 'o'];
  assert.equal(entryFromYaml({ clue: 'c', answer: 'LIE TO' }, 'e1', cells).displayAnswer, 'LIE TO');
  assert.ok(!('displayAnswer' in entryFromYaml({ clue: 'c', answer: 'LIETO' }, 'e1', cells)));
});

test('entryFromYaml: a rebus answer in canonical form needs no displayAnswer', () => {
  const e = entryFromYaml({ clue: 'c', answer: 'S[HAR]ON' }, 'e1', ['s', 'har', 'o', 'n']);
  assert.ok(!('displayAnswer' in e));
});

test('entryFromYaml: unknown entry keys and non-cell styles are kept; circle is not', () => {
  const e = entryFromYaml({ clue: 'c', answer: 'AB', note: 'hi', styles: { circle: [0], wobble: [1] } }, 'e1', ['a', 'b']);
  assert.deepEqual(e.extra, { note: 'hi' });
  assert.deepEqual(e.extraStyles, { wobble: [1] });
  assert.equal(e.clue, 'c');
});

test('entryToYaml: uses displayAnswer when it still matches the cells', () => {
  const e = { id: 'e1', clue: 'c', displayAnswer: 'LIE TO', extra: {}, extraStyles: {} };
  assert.equal(entryToYaml(e, ['l', 'i', 'e', 't', 'o'], []).answer, 'LIE TO');
});

test('entryToYaml: falls back to the canonical form when displayAnswer no longer matches', () => {
  const e = { id: 'e1', clue: 'c', displayAnswer: 'LIE TO', extra: {}, extraStyles: {} };
  assert.equal(entryToYaml(e, ['l', 'i', 'e', 'x', 'o'], []).answer, 'LIEXO');
});

test('entryToYaml: circled positions come out ascending, and styles is omitted when empty', () => {
  const e = newEntry('e1');
  e.clue = 'c';
  assert.deepEqual(entryToYaml(e, ['a', 'b', 'c'], [2, 0]).styles, { circle: [0, 2] });
  assert.ok(!('styles' in entryToYaml(e, ['a', 'b', 'c'], [])));
});

test('entryToYaml: unknown keys and styles round-trip, circle first', () => {
  const src = { clue: 'c', answer: 'AB', note: 'hi', styles: { circle: [1], wobble: [0] } };
  const e = entryFromYaml(src, 'e1', ['a', 'b']);
  const out = entryToYaml(e, ['a', 'b'], [1]);
  assert.deepEqual(out, src);
  assert.deepEqual(Object.keys(out), ['clue', 'answer', 'styles', 'note']);
  assert.deepEqual(Object.keys(out.styles), ['circle', 'wobble']);
});

test('entryToYaml refuses an empty cell', () => {
  assert.throws(() => entryToYaml(newEntry('e1'), ['a', ''], []), /empty/);
});

test('circledPositions: the positions whose cell key is circled, ascending', () => {
  assert.deepEqual(circledPositions([9, 4, 7, 2], [2, 9]), [0, 3]);
  assert.deepEqual(circledPositions(['0,0', '0,1'], ['0,1']), [1]);
  assert.deepEqual(circledPositions([1, 2], []), []);
});
