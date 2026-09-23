'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { preparePuzzle } = require('../src/hasher');
const sha256hex = require('../../shared/sha256hex');
const { joinCells } = require('../../shared/boardString');

// 3x3 fully open grid: across {1,4,5}, down {1,2,3}.
function minimalPuzzle() {
  return {
    kind: 'crushword', title: 'Test', hashed: false,
    grid: ['...', '...', '...'],
    across: {
      1: { clue: 'a1', answer: 'CAT' },
      4: { clue: 'a4', answer: 'DOG' },
      5: { clue: 'a5', answer: 'ANT' },
    },
    down: {
      1: { clue: 'd1', answer: 'CDA' },
      2: { clue: 'd2', answer: 'AON' },
      3: { clue: 'd3', answer: 'TGT' },
    },
  };
}

test('preparePuzzle: includes metadata fields', () => {
  const p = { ...minimalPuzzle(), author: 'Greg', date: '2026' };
  const r = preparePuzzle(p);
  assert.equal(r.title, 'Test');
  assert.equal(r.author, 'Greg');
  assert.equal(r.date, '2026');
  assert.equal(r.kind, 'crushword');
  assert.equal(r.hashed, false);
  assert.deepEqual(r.grid, minimalPuzzle().grid);
});

test('preparePuzzle: maxCellLetters defaults to 3 when absent', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.maxCellLetters, 3);
});

test('preparePuzzle: maxCellLetters is passed through when present', () => {
  const r = preparePuzzle({ ...minimalPuzzle(), maxCellLetters: 5 });
  assert.equal(r.maxCellLetters, 5);
});

test('preparePuzzle: omits author/date/instructions when absent', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.author, undefined);
  assert.equal(r.date, undefined);
  assert.equal(r.instructions, undefined);
});

test('preparePuzzle: instructions rendered as markdown when present', () => {
  const r = preparePuzzle({ ...minimalPuzzle(), instructions: 'Solve *it*.' });
  assert.equal(r.instructions, '<p>Solve <em>it</em>.</p>\n');
});

test('preparePuzzle: across/down entries have clue and length (not answer)', () => {
  const r = preparePuzzle(minimalPuzzle());
  assert.equal(r.across[1].clue, 'a1');
  assert.equal(r.across[1].length, 3);
  assert.equal(r.across[1].answer, undefined);
  assert.equal(r.down[2].length, 3);
});

test('preparePuzzle: styles preserved when present', () => {
  const p = minimalPuzzle();
  p.across[1].styles = { circle: [0] };
  const r = preparePuzzle(p);
  assert.deepEqual(r.across[1].styles, { circle: [0] });
});

test('preparePuzzle: non-hashed builds a row-major letters array, null at blocks', () => {
  const p = {
    kind: 'crushword', title: 'T', hashed: false,
    grid: ['.#.', '...'],
    across: { 3: { clue: 'a', answer: 'AB' } },
    down: { 1: { clue: 'd1', answer: 'AC' }, 2: { clue: 'd2', answer: 'BD' } },
  };
  const r = preparePuzzle(p);
  assert.equal(r.letters.length, 6); // 2 rows * 3 cols
  assert.equal(r.letters[1], null); // (0,1) is blocked
});

test('preparePuzzle: non-hashed includes boardHash; hashed omits letters', () => {
  const nonHashed = preparePuzzle(minimalPuzzle());
  assert.ok('boardHash' in nonHashed);
  assert.ok(Array.isArray(nonHashed.letters));

  const hashed = preparePuzzle({ ...minimalPuzzle(), hashed: true });
  assert.match(hashed.boardHash, /^[0-9a-f]{64}$/);
  assert.equal(hashed.letters, undefined);
});

test('preparePuzzle: boardHash is sha256 of row-major open-cell letters, joined with CELL_DELIM', () => {
  const r = preparePuzzle(minimalPuzzle());
  // 3x3 fully open: row-major open cells are (0,0)..(2,2) — the same order
  // getSolution() will walk. Board content: across[1]=CAT across[4]=DOG
  // across[5]=ANT gives rows c-a-t / d-o-g / a-n-t.
  const expected = sha256hex(joinCells([...'catdogant']));
  assert.equal(r.boardHash, expected);
});

// ── boardHash passthrough (muddled mode) ────────────────────────────────────

function muddledPuzzle() {
  const p = minimalPuzzle();
  p.hashed = true;
  p.boardHash = 'precomputed-hash';
  for (const dir of [p.across, p.down]) {
    for (const num of Object.keys(dir)) {
      dir[num].length = dir[num].answer.length;
      delete dir[num].answer;
    }
  }
  return p;
}

test('preparePuzzle: passthrough — uses puzzle.boardHash directly, skips letters construction', () => {
  const r = preparePuzzle(muddledPuzzle());
  assert.equal(r.boardHash, 'precomputed-hash');
  assert.ok(!('letters' in r));
});

test('preparePuzzle: passthrough — maxCellLetters still defaults/passes through in muddled mode', () => {
  assert.equal(preparePuzzle(muddledPuzzle()).maxCellLetters, 3);
  assert.equal(preparePuzzle({ ...muddledPuzzle(), maxCellLetters: 4 }).maxCellLetters, 4);
});

// ── rebus cells ──────────────────────────────────────────────────────────────

test('letters carries one entry per cell for a rebus crossing', () => {
  // 3x3: across[1]=S[HA]N (3 cells), down[1]=SAD, down[2]=[HA]BE — cross
  // agreement at (0,1) is the rebus cell "ha" shared by across[1] pos1 and
  // down[2] pos0.
  const p = {
    kind: 'crushword', title: 'T', hashed: false,
    grid: ['...', '...', '...'],
    across: {
      1: { clue: 'a1', answer: 'S[HA]N' },
      4: { clue: 'a4', answer: 'ABC' },
      5: { clue: 'a5', answer: 'DEF' },
    },
    down: {
      1: { clue: 'd1', answer: 'SAD' },
      2: { clue: 'd2', answer: '[HA]BE' },
      3: { clue: 'd3', answer: 'NCF' },
    },
  };
  const r = preparePuzzle(p);
  assert.equal(r.letters[1], 'ha'); // (0,1) flat index 1
});
