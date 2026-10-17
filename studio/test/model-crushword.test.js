'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const cw       = require('../src/model/kinds/crushword');
const { StructureError } = require('../src/model/errors');

function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

// The validator's own minimal puzzle: a fully open 3×3 grid, across {1,4,5}, down
// {1,2,3}.
const puzzle = () => ({
  kind: 'crushword', title: 'T',
  grid: ['...', '...', '...'],
  across: { 1: { clue: 'a1', answer: 'CAT' }, 4: { clue: 'a4', answer: 'DOG' }, 5: { clue: 'a5', answer: 'ANT' } },
  down:   { 1: { clue: 'd1', answer: 'CDA' }, 2: { clue: 'd2', answer: 'AON' }, 3: { clue: 'd3', answer: 'TGT' } },
});
const imp = (p = puzzle()) => cw.fromYaml(p);
const run = (model, name, ...args) => cw.commands[name](deepFreeze(structuredClone(model)), ...args);
// Blank model for a grid given as strings.
// (Its clues don't match the blocks; the grid checks read only blocks and cells.)
function fromGrid(grid) {
  return { ...cw.newModel({ rows: grid.length, cols: grid[0].length }), blocks: grid.flatMap(row => [...row].map(ch => ch === '#')) };
}

test('newModel: all cells open and empty, with a clue per derived slot', () => {
  const m = cw.newModel({ rows: 9, cols: 17 });
  assert.equal(m.blocks.filter(b => !b).length, 153);
  assert.ok(m.cells.every(c => c === ''));
  assert.deepEqual(Object.keys(m.clues).sort(), cw.slots(m).map(s => s.key).sort());
  assert.equal(m.maxCellLetters, null);
  assert.equal(cw.isModel(m), true);
});

test('fromYaml: the 3×3 puzzle gives its cells and clue keys', () => {
  const { model, warnings } = imp();
  assert.deepEqual(warnings, []);
  assert.deepEqual(model.cells, ['c', 'a', 't', 'd', 'o', 'g', 'a', 'n', 't']);
  assert.deepEqual(Object.keys(model.clues).sort(), ['A 0,0', 'A 1,0', 'A 2,0', 'D 0,0', 'D 0,1', 'D 0,2']);
  assert.equal(model.clues['A 1,0'].clue, 'a4');
  assert.equal(cw.isModel(model), true);
});

test('isModel: a cell may hold digits', () => {
  const { model } = imp();
  assert.equal(cw.isModel({ ...model, cells: ['c', '4', 't', 'd', 'o', 'g', 'a', 'n', 't'] }), true);
});

test('fromYaml: an across/down conflict keeps across and warns', () => {
  const p = puzzle();
  p.down[1].answer = 'XDA';
  const { model, warnings } = imp(p);
  assert.equal(model.cells[0], 'c');
  assert.deepEqual(warnings, ['Cell (1, 1): kept "C" from across 1, discarded "X" from down 1']);
});

test('fromYaml: a numbering mismatch throws a StructureError naming it', () => {
  const p = puzzle();
  p.across[9] = p.across[5]; delete p.across[5];
  assert.throws(() => imp(p), e => e instanceof StructureError && /across/.test(e.message) && /5|9/.test(e.message));
});

test('fromYaml: a wrong cell count, a bad grid and a muddled entry throw', () => {
  const short = puzzle(); short.across[1].answer = 'CA';
  assert.throws(() => imp(short), StructureError);
  assert.throws(() => imp({ ...puzzle(), grid: ['..', '...'] }), StructureError);
  assert.throws(() => imp({ ...puzzle(), grid: ['..x', '...', '...'] }), StructureError);
  assert.throws(() => imp({ ...puzzle(), grid: ['###'] }), StructureError);
  const muddled = puzzle(); muddled.across[1] = { clue: 'a1', length: 3 };
  assert.throws(() => imp(muddled), StructureError);
  assert.throws(() => imp({ ...puzzle(), maxCellLetters: 'x' }), StructureError);
});

test('fromYaml: circles are the union over entries, and a completion warns', () => {
  const p = puzzle();
  p.across[1].styles = { circle: [1] };            // (0,1) circled on across 1 only
  const { model, warnings } = imp(p);
  assert.deepEqual(model.circles, ['0,1']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Completed the circle on cell \(1, 2\)/);
});

test('toYaml: numbers ascend, circles are written on both crossing entries, maxCellLetters only when set', () => {
  const { model } = imp();
  const withCircle = cw.commands.toggleCircle(model, 1, 1);
  const y = cw.toYaml(withCircle);
  assert.deepEqual(Object.keys(y.across), ['1', '4', '5']);
  assert.deepEqual(y.across[4].styles, { circle: [1] });
  assert.deepEqual(y.down[2].styles, { circle: [1] });
  assert.ok(!('maxCellLetters' in y));
  assert.equal(cw.toYaml(cw.commands.setMaxCellLetters(model, 2)).maxCellLetters, 2);
});

test('toggleBlock: with symmetry, a corner also blocks the opposite corner', () => {
  const m = cw.newModel({ rows: 5, cols: 5 });
  const n = run(m, 'toggleBlock', 0, 0, true);
  assert.equal(n.blocks[0], true);
  assert.equal(n.blocks[24], true);
  assert.equal(run(m, 'toggleBlock', 0, 1, false).blocks[23], false);
});

test('toggleBlock: clues of slots whose start survives are kept; a removed slot\'s clue is orphaned with its old number', () => {
  let m = cw.newModel({ rows: 5, cols: 5 });
  m = cw.commands.setClue(m, 'A 0,0', 'across one');
  m = cw.commands.setClue(m, 'A 1,0', 'across two');
  m = cw.commands.setClue(m, 'D 0,0', 'down one');
  assert.equal(cw.slots(m).find(s => s.key === 'A 1,0').num, 6);
  // Blocking (0,0): across 1 would start at (0,1) and down 1 at (1,0), so both old slot
  // keys go.
  const n = run(m, 'toggleBlock', 0, 0, false);
  assert.equal(n.clues['A 1,0'].clue, 'across two');
  assert.ok(!('A 0,0' in n.clues));
  assert.deepEqual(n.orphans.map(o => [o.clue, o.from]).sort(), [['across one', 'Across 1'], ['down one', 'Down 1']]);
  assert.ok(n.clues['A 0,1'] && n.clues['D 1,0']);            // new slots get empty entries
  assert.equal(n.clues['A 0,1'].clue, '');
});

test('toggleBlock: blocking clears the cell\'s letters and circle', () => {
  let m = cw.newModel({ rows: 5, cols: 5 });
  m = cw.commands.setCell(m, 0, 0, 'ab');
  m = cw.commands.toggleCircle(m, 0, 0);
  const n = run(m, 'toggleBlock', 0, 0, false);
  assert.equal(n.cells[0], '');
  assert.deepEqual(n.circles, []);
});

test('toggleBlock: blocking the last open cell returns the model unchanged', () => {
  const { model } = imp({ ...puzzle(), grid: ['..'], across: { 1: { clue: 'a', answer: 'AB' } }, down: {} });
  let m = run(model, 'toggleBlock', 0, 0, false);           // one open cell left
  assert.equal(m.blocks[0], true);
  const again = run(m, 'toggleBlock', 0, 1, false);
  assert.deepEqual(again, m);
});

test('toggleBlock: toggling an open cell back reopens it', () => {
  const m = cw.newModel({ rows: 5, cols: 5 });
  const blocked = run(m, 'toggleBlock', 2, 2, false);
  assert.equal(blocked.blocks[12], true);
  assert.equal(run(blocked, 'toggleBlock', 2, 2, false).blocks[12], false);
});

test('setCell ignores blocks and does not truncate; setSlotCells writes and the crossing slot reads it', () => {
  const { model } = imp();
  assert.equal(run(model, 'setCell', 0, 0, 'ABCD').cells[0], 'abcd');
  const blocked = run(cw.newModel({ rows: 5, cols: 5 }), 'toggleBlock', 0, 0, false);
  assert.equal(cw.commands.setCell(blocked, 0, 0, 'a').cells[0], '');
  const n = run(model, 'setSlotCells', 'A 0,0', ['x', 'y', 'z']);
  assert.deepEqual(n.cells.slice(0, 3), ['x', 'y', 'z']);
  const down = cw.slots(n).find(s => s.key === 'D 0,0');
  assert.deepEqual(down.cells.map(k => { const [r, c] = k.split(',').map(Number); return n.cells[r * 3 + c]; }), ['x', 'd', 'a']);
  assert.deepEqual(run(model, 'setSlotCells', 'A 0,0', ['x']), model);   // wrong count: ignored
  assert.deepEqual(run(model, 'setSlotCells', 'Z 9,9', ['x', 'y', 'z']), model);
});

test('gridChecks: the plus-shaped grid gives its five uncrossed cells', () => {
  const m = fromGrid(['.#.', '...', '.#.']);
  assert.deepEqual(cw.gridChecks(m).uncrossed.map(u => `${u.cell} ${u.dir}`),
    ['0,0 down', '0,2 down', '1,1 across', '2,0 down', '2,2 down']);
});

test('gridChecks: noEntry, missing, symmetric and connected', () => {
  const m = fromGrid(['.#.', '###', '.#.']);
  const c = cw.gridChecks(m);
  assert.deepEqual(c.noEntry, ['0,0', '0,2', '2,0', '2,2']);
  assert.deepEqual(c.missing, ['A', 'D']);
  assert.equal(c.symmetric, true);
  assert.equal(c.connected, false);
  assert.equal(cw.gridChecks(fromGrid(['...', '...', '...'])).connected, true);
});

test('gridChecks: overfull follows maxCellLetters', () => {
  const { model } = imp();
  const m = { ...model, maxCellLetters: 2, cells: model.cells.map((c, i) => (i === 4 ? 'abc' : c)) };
  assert.deepEqual(cw.gridChecks(m).overfull, ['1,1']);
  assert.deepEqual(cw.gridChecks({ ...m, maxCellLetters: null }).overfull, []);
});

test('gridChecks: short counts letters, and only for filled slots', () => {
  const base = fromGrid(['..']);
  assert.deepEqual(cw.gridChecks({ ...base, cells: ['ail', 's'] }).short, []);           // [AIL]S: four letters
  assert.deepEqual(cw.gridChecks({ ...base, cells: ['a', 'b'] }).short, ['A 0,0']);      // AB: two
  assert.deepEqual(cw.gridChecks({ ...base, cells: ['a', ''] }).short, []);              // unfilled: not short yet
});

test('resize keeps clues whose slot start survives, and resizeLosses equals the orphans it adds', () => {
  let m = cw.newModel({ rows: 5, cols: 5 });
  for (const s of cw.slots(m)) m = cw.commands.setClue(m, s.key, `clue ${s.key}`);
  const n = run(m, 'resize', 3, 5);                       // drops the bottom two rows
  assert.equal(n.rows, 3);
  assert.equal(n.cells.length, 15);
  assert.equal(n.clues['A 0,0'].clue, 'clue A 0,0');
  assert.ok(!('A 4,0' in n.clues));
  const lost = cw.resizeLosses(m, 3, 5);
  assert.ok(lost > 0);
  assert.equal(n.orphans.length - m.orphans.length, lost);
  assert.equal(cw.resizeLosses(m, 7, 5), 0);
  const grown = run(m, 'resize', 7, 5);
  assert.equal(grown.cells.length, 35);
  assert.equal(grown.blocks.filter(Boolean).length, 0);
});

test('resize ignores a size outside 3–25 or the size it already is', () => {
  const m = cw.newModel({ rows: 5, cols: 5 });
  for (const [r, c] of [[5, 5], [2, 5], [5, 26], [5.5, 5], [5, 'x']]) assert.deepEqual(run(m, 'resize', r, c), m);
});

test('setClue, setDisplayAnswer, toggleCircle, setMaxCellLetters, setHeader, orphans', () => {
  const { model } = imp();
  assert.equal(run(model, 'setClue', 'A 0,0', 'new').clues['A 0,0'].clue, 'new');
  assert.deepEqual(run(model, 'setClue', 'A 9,9', 'new'), model);
  assert.equal(run(model, 'setDisplayAnswer', 'A 0,0', 'C A T').clues['A 0,0'].displayAnswer, 'C A T');
  assert.deepEqual(run(model, 'toggleCircle', 1, 1).circles, ['1,1']);
  assert.deepEqual(run(run(model, 'toggleCircle', 1, 1), 'toggleCircle', 1, 1).circles, []);
  const two = run(run(model, 'toggleCircle', 2, 0), 'toggleCircle', 0, 2);
  assert.deepEqual(two.circles, ['0,2', '2,0']);
  assert.equal(run(model, 'setMaxCellLetters', 4).maxCellLetters, 4);
  assert.equal(run(run(model, 'setMaxCellLetters', 4), 'setMaxCellLetters', null).maxCellLetters, null);
  assert.deepEqual(run(model, 'setMaxCellLetters', 0), model);
  assert.equal(run(model, 'setHeader', 'title', 'X').header.title, 'X');
  // an orphan attaches to a slot, swapping any clue already there
  const orphaned = { ...model, orphans: [{ id: 'e99', clue: 'lost', from: 'Across 5' }], nextId: 100 };
  const attached = run(orphaned, 'attachOrphan', 'e99', 'A 0,0');
  assert.equal(attached.clues['A 0,0'].clue, 'lost');
  assert.deepEqual(attached.orphans.map(o => [o.clue, o.from]), [['a1', 'Across 1']]);
  assert.deepEqual(run(orphaned, 'attachOrphan', 'e99', 'A 9,9'), orphaned);
  assert.deepEqual(run(orphaned, 'discardOrphan', 'e99').orphans, []);
});

test('completeness: title, empty cells, no-entry cells, missing clues, overfull cells, orphans', () => {
  const blank = cw.newModel({ rows: 3, cols: 3 });
  const msgs = cw.completeness(blank).map(o => o.message);
  assert.ok(msgs.includes('Give the puzzle a title.'));
  assert.ok(msgs.some(m => /^Empty cells: \(1, 1\), .*and 0|^Empty cells: \(1, 1\)/.test(m)));
  assert.ok(msgs.includes('Across 1 has no clue.'));
  assert.ok(msgs.includes('Down 2 has no clue.'));
  const { model } = imp();
  assert.deepEqual(cw.completeness(model), []);
  const over = { ...model, maxCellLetters: 2, cells: model.cells.map((c, i) => (i === 4 ? 'abc' : c)) };
  assert.ok(cw.completeness(over).some(o => o.message === 'Cell (2, 2) holds 3 letters; the limit is 2.'));
  const noEntry = { ...fromGrid(['.#.', '###', '.#.']), header: { title: 'T', extra: {} } };
  assert.ok(cw.completeness(noEntry).some(o => o.message === 'Cell (1, 1) is open but in no entry — block it or open a neighbor.'));
  assert.ok(cw.completeness({ ...model, orphans: [{ id: 'e9', clue: 'zz', from: 'Across 2' }] }).some(o => /Unattached clue "zz"/.test(o.message)));
});

test('every command leaves its input unmutated (frozen models)', () => {
  const { model } = imp();
  for (const [name, args] of [['setCell', [0, 0, 'x']], ['toggleBlock', [0, 0, true]], ['resize', [4, 4]], ['setClue', ['A 0,0', 'z']],
    ['toggleCircle', [0, 0]], ['setSlotCells', ['A 0,0', ['x', 'y', 'z']]], ['setMaxCellLetters', [2]], ['setHeader', ['author', 'A']]]) {
    assert.doesNotThrow(() => run(model, name, ...args), name);
  }
});

test('isModel rejects a malformed model', () => {
  const { model } = imp();
  assert.equal(cw.isModel(model), true);
  assert.equal(cw.isModel({ ...model, cells: model.cells.slice(1) }), false);
  assert.equal(cw.isModel({ ...model, circles: ['9,9'] }), false);
  assert.equal(cw.isModel({ ...model, clues: {} }), false);
  assert.equal(cw.isModel({ ...model, maxCellLetters: 0 }), false);
  assert.equal(cw.isModel(null), false);
});
