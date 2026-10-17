'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { commonPuzzleData } = require('../build/page');

test('commonPuzzleData: required fields always present', () => {
  const data = commonPuzzleData({ title: 'T', kind: 'spiral', hashed: false });
  assert.deepEqual(data, { title: 'T', kind: 'spiral', hashed: false });
});

test('commonPuzzleData: optional fields included only when !== undefined', () => {
  const data = commonPuzzleData({
    title: 'T', kind: 'spiral', hashed: false,
    author: 'A', date: '2026', letters: ['a'], boardHash: 'h',
  });
  assert.equal(data.author, 'A');
  assert.equal(data.date, '2026');
  assert.deepEqual(data.letters, ['a']);
  assert.equal(data.boardHash, 'h');
});

test('commonPuzzleData: instructions passed through verbatim (already rendered at prepare time)', () => {
  const data = commonPuzzleData({ title: 'T', kind: 'spiral', hashed: false, instructions: '<p>x</p>\n' });
  assert.equal(data.instructions, '<p>x</p>\n');
});

test('commonPuzzleData: includes embedOrigin only when set', () => {
  assert.equal(commonPuzzleData({ title: 'T', kind: 'spiral', hashed: true, embedOrigin: 'https://h.example' }).embedOrigin, 'https://h.example');
  assert.ok(!('embedOrigin' in commonPuzzleData({ title: 'T', kind: 'spiral', hashed: true })));
});
