'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const normalize = require('../normalize');
const { parseAnswerCells, entryCells, entryLength, processEntries } = require('../build/builderUtils');

test('bare characters are one cell each', () => {
  assert.deepStrictEqual(parseAnswerCells('PARIS').cells, ['p', 'a', 'r', 'i', 's']);
});

test('a bracketed group is exactly one cell', () => {
  assert.deepStrictEqual(parseAnswerCells('S[HAR]ON').cells, ['s', 'har', 'o', 'n']);
});

test('a bare character that normalizes to empty is dropped', () => {
  assert.deepStrictEqual(parseAnswerCells('LIE TO').cells, ['l', 'i', 'e', 't', 'o']);
  assert.deepStrictEqual(parseAnswerCells('WAH-WAH').cells, ['w', 'a', 'h', 'w', 'a', 'h']);
  assert.deepStrictEqual(parseAnswerCells("DON'T").cells, ['d', 'o', 'n', 't']);
});

test('bracket-free answers keep exactly the current cell count', () => {
  for (const answer of ['LIE TO', 'WAH-WAH', "DON'T", 'EDWARD IV', 'PARIS']) {
    assert.strictEqual(
      entryLength({ clue: 'c', answer }),
      normalize(answer).length,
      `cell count drifted for ${answer}`
    );
  }
});

test('a group normalizes internally, dropping punctuation', () => {
  assert.deepStrictEqual(parseAnswerCells('A[N.C.]E').cells, ['a', 'nc', 'e']);
});

test('unclosed bracket is an error', () => {
  const { cells, error } = parseAnswerCells('S[HARON');
  assert.strictEqual(cells, null);
  assert.match(error, /unclosed/);
});

test('unmatched closing bracket is an error', () => {
  const { cells, error } = parseAnswerCells('SHAR]ON');
  assert.strictEqual(cells, null);
  assert.match(error, /unmatched/);
});

test('nested bracket is an error', () => {
  const { cells, error } = parseAnswerCells('S[H[A]R]ON');
  assert.strictEqual(cells, null);
  assert.match(error, /nested/);
});

test('a bracketed group with no letters is an error', () => {
  const { cells, error } = parseAnswerCells('S[--]ON');
  assert.strictEqual(cells, null);
  assert.match(error, /no letters/);
});

test('parseAnswerCells throws on a non-string answer', () => {
  assert.throws(() => parseAnswerCells(123), TypeError);
  assert.throws(() => parseAnswerCells(['A', 'B']), TypeError);
});

test('entryLength throws on an entry whose answer has invalid bracket grammar', () => {
  assert.throws(() => entryLength({ clue: 'c', answer: 'S[HARON' }), TypeError);
});

test('entryLength returns entry.length for a muddled entry (answer absent)', () => {
  assert.strictEqual(entryLength({ clue: 'c', length: 4 }), 4);
  assert.strictEqual(entryLength({ hash: 'abc123', length: 5 }), 5);
});

test('entryCells returns null for a muddled entry', () => {
  assert.strictEqual(entryCells({ clue: 'c', length: 4 }), null);
});

test('entryLength counts cells, not letters, for a rebus entry', () => {
  assert.strictEqual(entryLength({ clue: 'c', answer: 'S[HAR]ON' }), 4);
});

test('processEntries exposes cells and a cell-count length', () => {
  const [out] = processEntries([{ clue: 'Judge on AGT', answer: 'S[HAR]ON' }]);
  assert.deepStrictEqual(out._cells, ['s', 'har', 'o', 'n']);
  assert.strictEqual(out.length, 4);
  assert.strictEqual(out.clue, 'Judge on AGT');
});

test('processEntries: passes styles through by value when present', () => {
  const styles = { circle: [0] };
  const out = processEntries([{ clue: 'c', answer: 'AB', styles }]);
  assert.deepEqual(out[0].styles, { circle: [0] });
});

test('processEntries: keeps an empty styles object (presence test, not truthiness)', () => {
  const out = processEntries([{ clue: 'c', answer: 'AB', styles: {} }]);
  assert.ok('styles' in out[0]);
  assert.deepEqual(out[0].styles, {});
});

test('processEntries: omits the styles key entirely when styles is undefined', () => {
  const out = processEntries([{ clue: 'c', answer: 'AB' }]);
  assert.ok(!('styles' in out[0]));
});

test('processEntries: renders markdown in the clue text', () => {
  const out = processEntries([{ clue: '**bold** clue', answer: 'AB' }]);
  assert.equal(out[0].clue, '<strong>bold</strong> clue');
});

test('processEntries: renders markdown in a muddled entry\'s clue too (no plaintext answer needed)', () => {
  const out = processEntries([{ clue: '*italic*', length: 2 }]);
  assert.equal(out[0].clue, '<em>italic</em>');
});

test('entryLength: prefers answer over a stray length field (must agree with entryCells)', () => {
  // A malformed entry carrying both must derive length from the answer, like entryCells,
  // so the validator (answer-based) and hasher (entryLength-based) never disagree.
  assert.equal(entryLength({ answer: 'ABC', length: 99 }), 3);
});

test('processEntries: muddled entry — sets correct length, _cells is null', () => {
  const out = processEntries([{ clue: 'Test', length: 5 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].clue,   'Test');
  assert.equal(out[0].length, 5);
  assert.strictEqual(out[0]._cells, null);
  assert.ok(!('answer' in out[0]));
});
