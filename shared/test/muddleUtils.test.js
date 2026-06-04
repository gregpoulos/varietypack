'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { walkAnswers, buildMuddledYaml } = require('../build/muddleUtils');

// ── walkAnswers ───────────────────────────────────────────────────────────────

test('walkAnswers: flat object with answer — replaces with length, drops answer and no hash', () => {
  const entry = { clue: 'Greeting', answer: 'WAH-WAH', styles: { circle: [0] } };
  const out   = walkAnswers(entry);
  assert.ok(!('answer' in out), 'answer key must be removed');
  assert.ok(!('hash' in out),   'hash must not be present');
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
  assert.ok(!('hash' in out[0]));
  assert.ok(!('hash' in out[1]));
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
  assert.ok(!('hash'   in out.rows[0].entries[0]));
  assert.equal(out.rows[0].entries[0].length, 3);
  assert.ok(!('answer' in out.bands[0].entries[0]));
  assert.ok(!('hash'   in out.bands[0].entries[0]));
  assert.equal(out.bands[0].entries[0].length, 3);
});

test('walkAnswers: inward/outward (spiral) — replaces answers in both lists', () => {
  const puzzle = {
    kind:    'spiral',
    inward:  [{ clue: 'In',  answer: 'ROTI' }],
    outward: [{ clue: 'Out', answer: 'MAJORCA' }],
  };
  const out = walkAnswers(puzzle);
  assert.ok(!('answer' in out.inward[0]));
  assert.ok(!('hash'   in out.inward[0]));
  assert.equal(out.inward[0].length, 4);
  assert.ok(!('answer' in out.outward[0]));
  assert.ok(!('hash'   in out.outward[0]));
  assert.equal(out.outward[0].length, 7);
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
  assert.ok(!('hash'   in out));
});

// ── buildMuddledYaml ──────────────────────────────────────────────────────────

test('buildMuddledYaml: sets hashed:true and boardHash at top level', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T',
    entries: [{ clue: 'a', answer: 'AB' }],
  };
  const out = buildMuddledYaml(puzzle, 'computed-board-hash');
  assert.equal(out.hashed,    true);
  assert.equal(out.boardHash, 'computed-board-hash');
});

test('buildMuddledYaml: overwrites hashed:false from source with true', () => {
  const puzzle = { kind: 'snake-charmer', title: 'T', hashed: false, entries: [] };
  const out    = buildMuddledYaml(puzzle, 'bh');
  assert.equal(out.hashed, true);
});

test('buildMuddledYaml: walks entries — answers replaced with length, no hash', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T',
    entries: [{ clue: 'One', answer: 'AA' }, { clue: 'Two', answer: 'BBB' }],
  };
  const out = buildMuddledYaml(puzzle, 'bh');
  assert.ok(!('answer' in out.entries[0]));
  assert.ok(!('hash'   in out.entries[0]));
  assert.equal(out.entries[0].length, 2);
  assert.equal(out.entries[0].clue,   'One');
});

test('walkAnswers: non-plain objects (Date) pass through unchanged, not flattened to {}', () => {
  const d = new Date('2026-06-03T00:00:00.000Z');  // js-yaml parses an unquoted timestamp to a Date
  const puzzle = { kind: 'spiral', date: d, inward: [{ clue: 'a', answer: 'ROTI' }] };
  const out = walkAnswers(puzzle);
  assert.ok(out.date instanceof Date, 'Date must remain a Date, not be flattened to {}');
  assert.equal(out.date.getTime(), d.getTime());
});
