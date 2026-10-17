'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const core     = require('../src/core');

const ROOT = path.resolve(__dirname, '..', '..');
const load = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

test('checkText: reports a parse error without throwing', () => {
  const r = core.checkText('title: [unclosed');
  assert.ok(typeof r.parseError === 'string' && r.parseError.length > 0);
  assert.equal(r.html, null);
});

test('checkText: the YAML must be an object', () => {
  assert.match(core.checkText('- a\n- b').parseError, /puzzle object/);
});

// Nothing in the studio converts Dates: it relies on the YAML 1.2 parser never making
// one.
test('parseYaml: an unquoted date stays a string', () => {
  assert.equal(core.parseYaml('kind: spiral\ndate: 2026-05-01\n').date, '2026-05-01');
});

test('checkPuzzle: unknown kind', () => {
  assert.deepEqual(core.checkPuzzle({ kind: 'nope', title: 'T' }).errors, ['unknown kind "nope"']);
});

test('checkPuzzle: validator errors, no html', () => {
  const p = load('spiral/test/fixtures/test-78.yaml');
  p.inward = p.inward.slice(0, 1);
  const r = core.checkPuzzle(p);
  assert.ok(r.errors.length > 0);
  assert.equal(r.html, null);
});

test('checkPuzzle: a valid puzzle returns html and title', () => {
  const p = load('examples/spiral.yaml');
  const r = core.checkPuzzle(p);
  assert.deepEqual(r.errors, []);
  assert.ok(r.html.includes('window.PUZZLE_DATA'));
  assert.equal(r.title, p.title);
});

test('checkPuzzle: build notes are returned', () => {
  const r = core.checkPuzzle({
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  });
  assert.ok(r.notes.some(n => /double-turn shape not supported/.test(n)), r.notes.join('|'));
});

test('checkPuzzle: a layout failure becomes an error', () => {
  const p = load('snake-charmer/test/fixtures/double-turn-42.yaml');
  p.shape = 'turn';
  const r = core.checkPuzzle(p);
  assert.ok(r.errors.some(e => /turn shape requires N divisible by 4/.test(e)), r.errors.join('|'));
  assert.equal(r.html, null);
});

test('checkPuzzle: a muddled puzzle builds hashed', () => {
  const r = core.checkPuzzle(load('spiral/test/fixtures/test-78.muddled.yaml'));
  assert.equal(r.muddled, true);
  assert.ok(r.html.includes('"hashed": true'));
});

test('a kind naming an Object.prototype member is an unknown kind, not a crash', () => {
  assert.deepEqual(core.validate({ kind: 'constructor', title: 'T' }).errors, ['unknown kind "constructor"']);
  assert.deepEqual(core.checkPuzzle({ kind: 'toString', title: 'T' }).errors, ['unknown kind "toString"']);
});

test('feasibleShapes: only the shapes whose geometry exists for N', () => {
  assert.deepEqual(core.feasibleShapes(48), ['circle', 'stadium', 'turn', 'double-turn']);
  assert.ok(!core.feasibleShapes(42).includes('turn'));
  assert.ok(core.feasibleShapes(42).includes('stadium'));
  assert.ok(!core.feasibleShapes(44).includes('double-turn'));
  assert.deepEqual(core.feasibleShapes(9), []);
});

test('autoShape is exposed by the core', () => {
  assert.equal(core.autoShape(48), 'double-turn');
  assert.equal(core.autoShape(44), 'stadium');
});
