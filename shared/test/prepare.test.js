'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { processEntries, prepareCommon } = require('../build/prepare');

const { sha256hex } = require('../sha256hex.mjs');

const { joinCells } = require('../boardString.mjs');

const board = () => ({ boardCells: ['a', 'b'], letters: ['a', 'b', null] });

const neverCalled = () => { throw new Error('computeBoard must not run'); };

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

test('processEntries: muddled entry — sets correct length, _cells is null', () => {
  const out = processEntries([{ clue: 'Test', length: 5 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].clue,   'Test');
  assert.equal(out[0].length, 5);
  assert.strictEqual(out[0]._cells, null);
  assert.ok(!('answer' in out[0]));
});

test('prepareCommon: carries title, kind, author and date; hashed defaults to false', () => {
  const r = prepareCommon({ title: 'T', author: 'A', date: '2026' }, 'k', board);
  assert.deepEqual(
    { title: r.title, kind: r.kind, author: r.author, date: r.date, hashed: r.hashed },
    { title: 'T', kind: 'k', author: 'A', date: '2026', hashed: false });
});

test('prepareCommon: omits author, date and instructions when absent', () => {
  const r = prepareCommon({ title: 'T' }, 'k', board);
  assert.equal(r.author, undefined);
  assert.equal(r.date, undefined);
  assert.equal('instructions' in r, false);
});

test('prepareCommon: renders instructions as markdown', () => {
  const r = prepareCommon({ title: 'T', instructions: 'Solve *it*.' }, 'k', board);
  assert.equal(r.instructions, '<p>Solve <em>it</em>.</p>\n');
});

test('prepareCommon: non-hashed has boardHash of the joined boardCells and the letters', () => {
  const r = prepareCommon({ title: 'T' }, 'k', board);
  assert.equal(r.boardHash, sha256hex(joinCells(['a', 'b'])));
  assert.deepEqual(r.letters, ['a', 'b', null]);
});

test('prepareCommon: hashed has the same boardHash and no letters', () => {
  const r = prepareCommon({ title: 'T', hashed: true }, 'k', board);
  assert.equal(r.boardHash, sha256hex(joinCells(['a', 'b'])));
  assert.equal('letters' in r, false);
});

test('prepareCommon: a stored boardHash passes through and computeBoard never runs', () => {
  const r = prepareCommon({ title: 'T', hashed: true, boardHash: 'stored' }, 'k', neverCalled);
  assert.equal(r.boardHash, 'stored');
  assert.equal('letters' in r, false);
});
