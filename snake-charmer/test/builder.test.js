'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { HOOKS } = require('../src/builder');
const { buildFromObject } = require('../../shared/build/buildFromObject');
const { loadPuzzle } = require('../../shared/cli/puzzleFiles');
const { SHAPES } = require('../src/layout.mjs');
const { puzzleDataOf } = require('../../test/helpers');

const SAMPLE = path.join(__dirname, 'fixtures', 'double-turn-72.yaml');

// ── auto-shape ────────────────────────────────────────────────────────────────

// A puzzle with a ring of 8 cells: too small for double-turn, fine for stadium and turn.
const smallPuzzle = (shape) => ({
  kind: 'snake-charmer', title: 'T', ...(shape && { shape }),
  entries: [
    { clue: 'One',   answer: 'ABCD' },
    { clue: 'Two',   answer: 'EFGH' },
    { clue: 'Three', answer: 'ABCDEFGH' },
  ],
});
const shapeOf = (puzzle, options = {}) => puzzleDataOf(buildFromObject(puzzle, options, HOOKS).html).shape;

test('build: no shape specified — uses double-turn for compatible puzzle', () => {
  const { shape, ...autoShaped } = loadPuzzle(SAMPLE);   // no shape: auto-select
  assert.equal(shapeOf(autoShaped), 'double-turn');
});

test('build: shape field in YAML used when no --shape flag', () => {
  assert.equal(shapeOf(smallPuzzle('stadium')), 'stadium');
});

test('build: --shape flag overrides shape field in YAML', () => {
  assert.equal(shapeOf(smallPuzzle('turn'), { shape: 'stadium' }), 'stadium');
});

test('build: YAML shape disables auto-select fallback — throws on incompatible shape', () => {
  // N=8 is too small for double-turn; auto-select would fall back to stadium.
  // With shape: 'double-turn' in the YAML the fallback is disabled, so it must throw.
  assert.throws(() => buildFromObject(smallPuzzle('double-turn'), {}, HOOKS),
    /"shape" "double-turn" cannot lay out a ring of 8 cells/);
});

function captureStderr(fn) {
  let out = '';
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { out += chunk; return true; };
  try { return { result: fn(), stderr: out }; } finally { process.stderr.write = origWrite; }
}

test('HOOKS via buildFromObject: auto-shape fallback note is returned, not printed', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const { result, stderr } = captureStderr(() => buildFromObject(puzzle, {}, HOOKS));
  assert.ok(result.notes.some(n => /double-turn shape not supported/.test(n)), result.notes.join('|'));
  assert.equal(stderr, '');
});

test('an auto-shaped build computes the double-turn ring once', () => {
  const real = SHAPES['double-turn'].computeRing;
  let calls = 0;
  SHAPES['double-turn'].computeRing = (N) => { calls++; return real(N); };
  try {
    const { shape, ...autoShaped } = loadPuzzle(SAMPLE);   // no shape: auto-select
    buildFromObject(autoShaped, {}, HOOKS);
  } finally {
    SHAPES['double-turn'].computeRing = real;
  }
  assert.equal(calls, 1);
});

