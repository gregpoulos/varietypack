'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { slugify, exportFileName } = require('../src/model/filenames');

test('slugify: lowercases and joins words with hyphens', () => {
  assert.equal(slugify('Small Rebus Example!'), 'small-rebus-example');
});

test('slugify: an empty or symbol-only title becomes "puzzle"', () => {
  assert.equal(slugify(''), 'puzzle');
  assert.equal(slugify('!!!'), 'puzzle');
});

test('slugify: caps at 60 characters without a trailing hyphen', () => {
  const s = slugify('word '.repeat(30));
  assert.ok(s.length <= 60);
  assert.ok(!s.endsWith('-'));
});

test('exportFileName: names each export type', () => {
  assert.equal(exportFileName('My Puzzle', 'source'), 'my-puzzle.yaml');
  assert.equal(exportFileName('My Puzzle', 'muddled'), 'my-puzzle.muddled.yaml');
  assert.equal(exportFileName('My Puzzle', 'html'), 'my-puzzle.html');
  assert.equal(exportFileName('My Puzzle', 'hashed'), 'my-puzzle.hashed.html');
  assert.equal(exportFileName('My Puzzle', 'draft'), 'my-puzzle.vpstudio.json');
});
