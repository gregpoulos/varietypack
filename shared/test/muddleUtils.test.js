'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { walkAnswers, buildMuddledYaml, muddlePuzzle } = require('../build/muddleUtils');

// ── walkAnswers ───────────────────────────────────────────────────────────────

test('walkAnswers: flat object with answer — replaces with length, drops answer', () => {
  const entry = { clue: 'Greeting', answer: 'WAH-WAH', styles: { circle: [0] } };
  const out   = walkAnswers(entry);
  assert.ok(!('answer' in out), 'answer key must be removed');
  assert.equal(out.length, 6);  // wahwah
  assert.equal(out.clue,   'Greeting');
  assert.deepEqual(out.styles, { circle: [0] });
});

test('walkAnswers: array — maps over elements', () => {
  const entries = [
    { clue: 'A', answer: 'AA' },
    { clue: 'B', answer: 'BB' },
  ];
  const out = walkAnswers(entries);
  assert.equal(out.length, 2);
  assert.ok(!('answer' in out[0]));
  assert.equal(out[0].length, 2);
  assert.equal(out[1].length, 2);
});

test('walkAnswers: nested object (rows/entries) — recurses into nested arrays', () => {
  const puzzle = {
    kind: 'marching-bands',
    rows: [
      { entries: [{ clue: 'a', answer: 'ABC' }] },
    ],
    bands: [
      { entries: [{ clue: 'b', answer: 'XYZ' }] },
    ],
  };
  const out = walkAnswers(puzzle);
  assert.ok(!('answer' in out.rows[0].entries[0]));
  assert.equal(out.rows[0].entries[0].length, 3);
  assert.ok(!('answer' in out.bands[0].entries[0]));
  assert.equal(out.bands[0].entries[0].length, 3);
});

test('walkAnswers: non-entry primitive fields pass through unchanged', () => {
  const puzzle = { kind: 'snake-charmer', title: 'My Puzzle', loops: 2, entries: [] };
  const out = walkAnswers(puzzle);
  assert.equal(out.kind,  'snake-charmer');
  assert.equal(out.title, 'My Puzzle');
  assert.equal(out.loops, 2);
});

test('walkAnswers: entry without answer — passes through unchanged', () => {
  const entry = { clue: 'Test', length: 5 };
  const out   = walkAnswers(entry);
  assert.equal(out.clue,   'Test');
  assert.equal(out.length, 5);
  assert.ok(!('answer' in out));
});

// ── buildMuddledYaml ──────────────────────────────────────────────────────────

test('muddled length is the cell count, not the letter count', () => {
  const out = buildMuddledYaml(
    { kind: 'spiral', title: 'T', inward: [{ clue: 'c', answer: 'S[HAR]ON' }] },
    'deadbeef'
  );
  assert.strictEqual(out.inward[0].length, 4);
  assert.strictEqual(out.inward[0].answer, undefined);
});

test('muddled output declares format 2', () => {
  const out = buildMuddledYaml({ kind: 'spiral', title: 'T', inward: [] }, 'deadbeef');
  assert.strictEqual(out.format, 2);
  assert.strictEqual(out.hashed, true);
  assert.strictEqual(out.boardHash, 'deadbeef');
});

// ── muddlePuzzle ──────────────────────────────────────────────────────────────

const okValidate = () => ({ errors: [], warnings: ['w'] });
const puzzleWithAnswers = { kind: 'stub', title: 'T', entries: [{ clue: 'c', answer: 'ab-c' }] };

test('muddlePuzzle: returns the muddled object for a valid puzzle', () => {
  const r = muddlePuzzle(puzzleWithAnswers, { validateFn: okValidate, prepareFn: () => ({ boardHash: 'abc' }) });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, ['w']);
  assert.equal(r.muddled.hashed, true);
  assert.equal(r.muddled.format, 2);
  assert.equal(r.muddled.boardHash, 'abc');
  assert.deepEqual(r.muddled.entries, [{ clue: 'c', length: 3 }]);
});

test('muddlePuzzle: passes hashed: true to prepareFn', () => {
  let seen;
  muddlePuzzle(puzzleWithAnswers, { validateFn: okValidate, prepareFn: (p) => { seen = p.hashed; return { boardHash: 'x' }; } });
  assert.equal(seen, true);
});

test('muddlePuzzle: returns errors and a null muddled object when invalid', () => {
  let prepared = false;
  const r = muddlePuzzle(puzzleWithAnswers, {
    validateFn: () => ({ errors: ['bad'], warnings: [] }),
    prepareFn: () => { prepared = true; return { boardHash: 'x' }; },
  });
  assert.deepEqual(r.errors, ['bad']);
  assert.equal(r.muddled, null);
  assert.equal(prepared, false);
});
