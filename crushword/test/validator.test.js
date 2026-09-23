'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../src/validator');

// Fully open 3x3 grid: across {1,4,5}, down {1,2,3} — see grid.test.js.
// Every cell is checked in both directions, so this fixture never triggers
// the uncrossed-cell warning added in a later task.
function minimalPuzzle() {
  return {
    kind: 'crushword',
    title: 'Test',
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

// validateCommonHeader's own behavior (kind mismatch, missing title, hashed in
// source vs muddled, instructions type/emptiness) is covered by shared/test/
// builderUtils.test.js. This is the single wiring test proving crushword
// forwards validateCommonHeader's errors and passes its own kind
// ('crushword').

test('validate: rejects wrong kind', () => {
  const p = { ...minimalPuzzle(), kind: 'spiral' };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"kind"')));
});

test('validate: rejects missing grid', () => {
  const p = minimalPuzzle();
  delete p.grid;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"grid"')));
});

test('validate: rejects ragged grid rows', () => {
  const p = minimalPuzzle();
  p.grid = ['...', '..', '...'];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('grid[1]')));
});

test('validate: rejects a character other than "." or "#" in the grid', () => {
  const p = minimalPuzzle();
  p.grid = ['..x', '...', '...'];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('grid[0][2]')));
});

test('validate: rejects an all-blocked grid', () => {
  const p = minimalPuzzle();
  p.grid = ['###', '###', '###'];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('at least one open')));
});

test('validate: rejects a grid whose block pattern implies no entries at all', () => {
  const p = { kind: 'crushword', title: 'Degenerate', grid: ['.'], across: {}, down: {} };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('no across/down entries')));
});

test('validate: rejects an open cell that belongs to no across or down entry', () => {
  // (2,2) is boxed in by blocks, so no slot covers it and no clue could ever
  // supply its content — the puzzle would be unsolvable.
  const p = {
    kind: 'crushword', title: 'Boxed in',
    grid: ['..#', '..#', '##.'],
    across: { 1: { clue: 'a1', answer: 'AB' }, 3: { clue: 'a3', answer: 'CD' } },
    down:   { 1: { clue: 'd1', answer: 'AC' }, 2: { clue: 'd2', answer: 'BD' } },
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('Cell (3, 3)') && e.includes('no across or down entry')));
});

test('validate: rejects an unclued open cell in a muddled puzzle too (a grid-only check)', () => {
  const p = {
    kind: 'crushword', title: 'Boxed in', hashed: true, format: 2, boardHash: 'x'.repeat(64),
    grid: ['..#', '..#', '##.'],
    across: { 1: { clue: 'a1', length: 2 }, 3: { clue: 'a3', length: 2 } },
    down:   { 1: { clue: 'd1', length: 2 }, 2: { clue: 'd2', length: 2 } },
  };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('Cell (3, 3)') && e.includes('no across or down entry')));
});

test('validate: rejects a positive-but-non-integer maxCellLetters', () => {
  const p = { ...minimalPuzzle(), maxCellLetters: 2.5 };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"maxCellLetters"')));
});

test('validate: rejects across that is not an object', () => {
  const p = minimalPuzzle();
  p.across = [];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"across"')));
});

test('validate: rejects a missing across entry number', () => {
  const p = minimalPuzzle();
  delete p.across[5];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"across"') && e.includes('missing: 5')));
});

test('validate: rejects an unexpected extra across entry number', () => {
  const p = minimalPuzzle();
  p.across[99] = { clue: 'x', answer: 'AB' };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"across"') && e.includes('unexpected: 99')));
});

test('validate: rejects a missing down entry number', () => {
  const p = minimalPuzzle();
  delete p.down[2];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"down"') && e.includes('missing: 2')));
});

test('validate: rejects an entry whose cell count does not match its grid slot', () => {
  const p = minimalPuzzle();
  p.across[1].answer = 'CATS'; // grid slot at across[1] is 3 cells, not 4
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('across[1]') && e.includes('3 cells but answer has 4')));
});

// validateEntry's own behavior (missing/empty clue, missing/empty/normalizes-to-
// empty answer, bracket grammar) is covered by shared/test/validateEntry.test.js.
// This is the single wiring test proving crushword forwards validateEntry's
// errors and formats its label as "across[N]"/"down[N]".

test('validate: rejects an entry with an empty clue', () => {
  const p = minimalPuzzle();
  p.across[1].clue = '';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('across[1]') && e.includes('clue')));
});

// ── muddled mode ──────────────────────────────────────────────────────────────

function muddledPuzzle() {
  const p = minimalPuzzle();
  p.hashed = true;
  p.format = 2;
  p.boardHash = 'any-hash';
  for (const dir of [p.across, p.down]) {
    for (const num of Object.keys(dir)) {
      const cellCount = dir[num].answer.length; // fixture answers are all unbracketed 3-letter words
      delete dir[num].answer;
      dir[num].length = cellCount;
    }
  }
  return p;
}

test('validate: muddled puzzle passes with a skip-validation note', () => {
  const { errors, warnings } = validate(muddledPuzzle());
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('muddled')));
});

test('validate: muddled puzzle — per-slot length check still enforced', () => {
  const p = muddledPuzzle();
  p.across[1].length = 99;
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('across[1]') && e.includes('3 cells but answer has 99')));
});

test('validate: muddled puzzle rejects answer: instead of length:', () => {
  const p = muddledPuzzle();
  delete p.across[1].length;
  p.across[1].answer = 'CAT';
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('across[1]') && e.includes('length:, not answer:')));
});

test('validate: rejects muddled-shaped entries (length: without answer:) when boardHash is absent', () => {
  const p = minimalPuzzle();
  delete p.across[1].answer;
  p.across[1].length = 3; // length: with no top-level boardHash
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('boardHash')));
});

test('validate: rejects a bracket group exceeding the default maxCellLetters (3)', () => {
  const p = minimalPuzzle();
  p.across[1].answer = '[CATS]'; // 1 cell, 4 letters — grid slot needs 3 cells too, so also mismatches length
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('across[1]') && e.includes('"cats"') && e.includes('exceeding maxCellLetters (3)')));
});

test('validate: a bracket group is allowed when maxCellLetters is raised to fit it', () => {
  // Both directions must agree on the bracketing at the shared cell (1,1) — see grid.test.js's
  // fully-open-3x3 numbering. across[1] covers row 0; down[1] covers col 0.
  const p = minimalPuzzle();
  p.maxCellLetters = 4;
  p.across[1].answer = '[CATS]';
  p.down[1] = { clue: 'd1', answer: '[CATS]' };
  const { errors } = validate(p);
  assert.ok(!errors.some(e => e.includes('exceeding maxCellLetters')));
});

test('validate: warns on an answer under 3 letters', () => {
  const p = minimalPuzzle();
  p.across[4].answer = 'GO'; // grid slot at across[4] is 3 cells; this also trips the per-slot length check,
                             // which is fine — this test only asserts the length warning appears alongside it
  const { errors, warnings } = validate(p);
  assert.ok(errors.some(e => e.includes('across[4]')), 'sanity: the length mismatch should also fire');
  assert.ok(warnings.some(w => w.includes('across[4]') && w.includes('only 2 letters')));
});

test('validate: the minimum-length convention counts letters, so a short rebus entry is not warned', () => {
  // "[AIL]S" is 2 cells but the 4-letter word AILS — a sound entry. Counting cells
  // here would warn on eight legitimate entries in examples/crushword.yaml alone.
  const p = minimalPuzzle();
  p.across[4].answer = '[AIL]S';
  p.down[2].answer = 'A[AIL]';  // keep the crossing cell in agreement
  const { warnings } = validate(p);
  assert.ok(!warnings.some(w => w.includes('across[4]') && w.includes('letters long')));
});

test('validate: does not check maxCellLetters or minimum length in muddled mode', () => {
  const p = muddledPuzzle();
  p.maxCellLetters = 1; // would reject nearly every entry if checked
  const { errors, warnings } = validate(p);
  assert.deepEqual(errors, []);
  assert.ok(!warnings.some(w => w.includes('letters long')));
});

test('validate: warns when the grid lacks 180-degree symmetry', () => {
  // .#.
  // ...
  // ...
  // The single block is only in the top row — its 180-degree counterpart
  // (bottom row) is open, so this is not symmetric. Built from deriveSlots'
  // own output so the across/down maps are guaranteed to match.
  const grid = ['.#.', '...', '...'];
  const { deriveSlots, isSymmetric } = require('../src/grid');
  assert.equal(isSymmetric(grid), false);
  const { acrossSlots, downSlots } = deriveSlots(grid);
  const p = {
    kind: 'crushword', title: 'Asymmetric', grid,
    across: Object.fromEntries(acrossSlots.map(s => [s.num, { clue: `a${s.num}`, answer: 'A'.repeat(s.len) }])),
    down: Object.fromEntries(downSlots.map(s => [s.num, { clue: `d${s.num}`, answer: 'A'.repeat(s.len) }])),
  };
  const { warnings } = validate(p);
  assert.ok(warnings.some(w => w.includes('180-degree')));
});

test('validate: does not warn about symmetry for a symmetric grid', () => {
  const { warnings } = validate(minimalPuzzle());
  assert.ok(!warnings.some(w => w.includes('180-degree')));
});

test('validate: warns when the grid is not fully connected', () => {
  // Four separate 2x2 open blocks, split by a full cross of blocks:
  // ..#..
  // ..#..
  // #####
  // ..#..
  // ..#..
  // Built from deriveSlots' own output (not hand-typed numbers) so the
  // across/down maps are guaranteed to match the grid's derived numbering.
  const grid = ['..#..', '..#..', '#####', '..#..', '..#..'];
  const { deriveSlots, isConnected } = require('../src/grid');
  assert.equal(isConnected(grid), false);
  const { acrossSlots, downSlots } = deriveSlots(grid);
  assert.ok(acrossSlots.length > 0 && downSlots.length > 0, 'sanity: fixture must produce entries in both directions');
  const p = {
    kind: 'crushword', title: 'Disconnected', grid,
    across: Object.fromEntries(acrossSlots.map(s => [s.num, { clue: `a${s.num}`, answer: 'A'.repeat(s.len) }])),
    down: Object.fromEntries(downSlots.map(s => [s.num, { clue: `d${s.num}`, answer: 'A'.repeat(s.len) }])),
  };
  const { warnings } = validate(p);
  assert.ok(warnings.some(w => w.includes('not fully connected')));
});

test('validate: does not warn about connectivity for a connected grid', () => {
  const { warnings } = validate(minimalPuzzle());
  assert.ok(!warnings.some(w => w.includes('connected')));
});

test('validate: rejects a cell where across and down disagree', () => {
  const p = minimalPuzzle();
  p.down[1].answer = 'XDA'; // was 'CDA' — cell (0,0) now "x" vs across[1]'s "c"
  const { errors } = validate(p);
  // entryCells normalizes to lowercase, matching the convention already established
  // by validateEntry's own warnings and Marching Bands' cross-check messages —
  // never uppercase cell content in a message.
  assert.ok(errors.some(e => e.includes('Cell (1, 1)') && e.includes('across[1]') && e.includes('"c"') && e.includes('down[1]') && e.includes('"x"')));
});

test('validate: warns about an uncrossed cell (real entry in only one direction)', () => {
  // Plus-shaped grid: across[3] covers a cell (1,1 in 1-indexed) that no down
  // slot covers at all, and down[1]/down[2] each cover two cells (their first
  // and last) that no across slot covers.
  const p = {
    kind: 'crushword', title: 'Plus',
    grid: ['.#.', '...', '.#.'],
    across: { 3: { clue: 'a', answer: 'CAT' } },
    down:   { 1: { clue: 'b', answer: 'ACE' }, 2: { clue: 'c', answer: 'OTA' } },
  };
  const { errors, warnings } = validate(p);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('across[3]') && w.includes('cell (2, 2)') && w.includes('no crossing down entry')));
  assert.ok(warnings.some(w => w.includes('down[1]') && w.includes('cell (1, 1)') && w.includes('no crossing across entry')));
  assert.ok(warnings.some(w => w.includes('down[1]') && w.includes('cell (3, 1)') && w.includes('no crossing across entry')));
  assert.ok(warnings.some(w => w.includes('down[2]') && w.includes('cell (1, 3)') && w.includes('no crossing across entry')));
  assert.ok(warnings.some(w => w.includes('down[2]') && w.includes('cell (3, 3)') && w.includes('no crossing across entry')));
});

test('validate: does not warn about uncrossed cells when every cell is checked', () => {
  const { warnings } = validate(minimalPuzzle());
  assert.ok(!warnings.some(w => w.includes('no crossing')));
});

test('validate: skips cross-check and uncrossed-cell warning in muddled mode', () => {
  const p = muddledPuzzle();
  const { errors, warnings } = validate(p);
  assert.deepEqual(errors, []);
  assert.ok(!warnings.some(w => w.includes('no crossing')));
});

test('validate: skips cross-check and uncrossed-cell warning when an earlier error exists', () => {
  const p = minimalPuzzle();
  p.across[1].clue = ''; // triggers an entry-validation error, unrelated to crossing
  const { errors, warnings } = validate(p);
  assert.ok(errors.length > 0);
  assert.ok(!warnings.some(w => w.includes('no crossing')));
  assert.ok(!errors.some(e => e.includes('disagree')));
});

test('validate: reports the entry error instead of throwing when an answer is not a string', () => {
  // A YAML entry written `answer:` with no value parses to null. validateEntry
  // records it correctly; the cell-level checks must not then hand null to
  // entryCells, which throws by design for a non-string.
  for (const bad of [null, 42, []]) {
    const p = minimalPuzzle();
    p.across[1].answer = bad;
    let result;
    assert.doesNotThrow(() => { result = validate(p); }, `answer: ${JSON.stringify(bad)}`);
    assert.ok(result.errors.some(e => e.includes('across[1].answer must be a non-empty string')));
  }
});

test('validate: rejects a non-canonical clue key alongside the canonical one', () => {
  // '04' and 4 coerce to the same number, so a Number()-keyed set comparison sees
  // one key. The slot loops only ever look up 4, so the '04' entry — here a
  // deliberately over-long answer — would never be validated at all.
  const p = minimalPuzzle();
  p.across['04'] = { clue: 'stray', answer: 'ZZZZZZZZ' };
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"across"') && e.includes('"04"')));
});

test('validate: rejects a non-canonical clue key used in place of the canonical one', () => {
  const p = minimalPuzzle();
  p.across['04'] = p.across[4];
  delete p.across[4];
  const { errors } = validate(p);
  assert.ok(errors.some(e => e.includes('"04"')));
  assert.ok(
    !errors.some(e => e.includes('across[4] must be an object')),
    'should name the malformed key, not report the entry as missing'
  );
});

test('validate: examples/crushword.yaml passes with zero errors and zero warnings', () => {
  const path = require('path');
  const { loadPuzzle } = require('../../shared/build/builderUtils');
  const puzzle = loadPuzzle(path.join(__dirname, '..', '..', 'examples', 'crushword.yaml'));
  const { errors, warnings } = validate(puzzle);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});
