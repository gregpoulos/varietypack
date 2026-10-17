'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../normalize.mjs');
const { parseAnswerCells, entryCellCount } = require('../build/cells');

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
      entryCellCount({ clue: 'c', answer }),
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

test('accented letters fold to their base letter, bare or bracketed', () => {
  assert.deepStrictEqual(parseAnswerCells('CAFÉ').cells, ['c', 'a', 'f', 'e']);
  assert.deepStrictEqual(parseAnswerCells('PI[ÑA]').cells, ['p', 'i', 'na']);
});

test('a bare character that folds to several letters is that many cells, never a rebus cell', () => {
  assert.deepStrictEqual(parseAnswerCells('\uFB01LM').cells, ['f', 'i', 'l', 'm']);   // the ﬁ ligature
});

test('a digit is a cell like a letter, bare or bracketed', () => {
  assert.deepStrictEqual(parseAnswerCells('R2D2').cells, ['r', '2', 'd', '2']);
  assert.deepStrictEqual(parseAnswerCells('[4]GET').cells, ['4', 'g', 'e', 't']);
});

test('a number with no plain 0–9 form is an error, not cells', () => {
  for (const answer of ['½CUP', '٣', '⑴A']) {   // ½ folds to 1⁄2, Arabic-Indic three doesn't fold, ⑴ folds to (1)
    const { cells, error } = parseAnswerCells(answer);
    assert.strictEqual(cells, null, answer);
    assert.match(error, /can't be typed as A–Z or 0–9/, answer);
  }
});

test('full-width brackets fold to brackets, so they still mark a rebus cell', () => {
  assert.deepStrictEqual(parseAnswerCells('S［HAR］ON').cells, ['s', 'har', 'o', 'n']);
});

test('a letter outside the basic Latin alphabet is read whole, not as half a surrogate pair', () => {
  assert.deepStrictEqual(parseAnswerCells('\u{1D400}B').cells, ['a', 'b']);   // MATHEMATICAL BOLD CAPITAL A
});

test('a letter with no a–z form is an error, bare or bracketed, naming it', () => {
  for (const answer of ['ÆON', 'S[ÆO]N', 'STRAßE', 'ΔELTA']) {
    const { cells, error } = parseAnswerCells(answer);
    assert.strictEqual(cells, null, answer);
    assert.match(error, /can't be typed as A–Z or 0–9/, answer);
  }
  assert.match(parseAnswerCells('ÆON').error, /"Æ"/);
});

test('parseAnswerCells throws on a non-string answer', () => {
  assert.throws(() => parseAnswerCells(123), TypeError);
  assert.throws(() => parseAnswerCells(['A', 'B']), TypeError);
});

test('entryCellCount throws on an invalid answer, with the parser\'s own reason', () => {
  assert.throws(() => entryCellCount({ clue: 'c', answer: 'S[HARON' }),
    { name: 'Error', message: 'invalid answer "S[HARON": unclosed "[" in answer' });
  assert.throws(() => entryCellCount({ clue: 'c', answer: 'ÆON' }), /^Error: invalid answer "ÆON": letter "Æ" can't be typed as A–Z or 0–9/);
});

test('entryCellCount returns entry.length for a muddled entry (answer absent)', () => {
  assert.strictEqual(entryCellCount({ clue: 'c', length: 4 }), 4);
  assert.strictEqual(entryCellCount({ hash: 'abc123', length: 5 }), 5);
});

test('entryCellCount counts cells, not letters, for a rebus entry', () => {
  assert.strictEqual(entryCellCount({ clue: 'c', answer: 'S[HAR]ON' }), 4);
});

test('entryCellCount: prefers answer over a stray length field (must agree with processEntries)', () => {
  // A malformed entry carrying both must derive length from the answer, like
  // processEntries, so the validator (answer-based) and prepare step
  // (entryCellCount-based) never disagree.
  assert.equal(entryCellCount({ answer: 'ABC', length: 99 }), 3);
});
