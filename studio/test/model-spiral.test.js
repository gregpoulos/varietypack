'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const spiral   = require('../src/model/kinds/spiral');
const { StructureError } = require('../src/model/errors');
const { commandRunner } = require('./helpers');
const { cutIndices, gapToCutIndex, entryLabel } = spiral;

// 9 cells: inward ROTI | DEREK, outward (center first) KERE | DITOR.
const puzzle = () => ({
  kind: 'spiral', title: 'T', author: 'A',
  inward:  [{ clue: 'i1', answer: 'ROTI' }, { clue: 'i2', answer: 'DEREK' }],
  outward: [{ clue: 'o1', answer: 'KERE' }, { clue: 'o2', answer: 'DITOR' }],
});
const imp = (p = puzzle()) => spiral.fromYaml(p);
const run = commandRunner(spiral);

// ── import ──────────────────────────────────────────────────────────────────

test('fromYaml: a 2+2 puzzle gives the cells and starts', () => {
  const { model, warnings } = imp();
  assert.deepEqual(warnings, []);
  assert.deepEqual(model.cells, ['r', 'o', 't', 'i', 'd', 'e', 'r', 'e', 'k']);
  assert.deepEqual(model.cuts.inward.starts, [0, 4]);
  assert.deepEqual(model.cuts.outward.starts, [0, 4]);
  assert.deepEqual(model.cuts.inward.entries.map(e => e.clue), ['i1', 'i2']);
  assert.deepEqual(model.cuts.outward.entries.map(e => e.clue), ['o1', 'o2']);
  assert.equal(model.header.title, 'T');
  assert.equal(model.nextId, 5);
});

// Outward reads every cell backward, so a rebus spelled backward there is the same cell,
// and the author's spelling survives a round trip.
test('fromYaml/toYaml: an outward rebus spelled backward agrees, and keeps its spelling', () => {
  const p = {
    kind: 'spiral', title: 'T',
    inward:  [{ clue: 'i1', answer: 'R[OT]I' }, { clue: 'i2', answer: 'DEREK' }],
    outward: [{ clue: 'o1', answer: 'KERE' }, { clue: 'o2', answer: 'DI[TO]R' }],
  };
  const { model, warnings } = imp(p);
  assert.deepEqual(warnings, []);
  assert.deepEqual(model.cells, ['r', 'ot', 'i', 'd', 'e', 'r', 'e', 'k']);
  assert.equal(spiral.toYaml(model).outward[1].answer, 'DI[TO]R');
});

test('fromYaml: a reversal conflict keeps the inward letter and warns with both labels', () => {
  const p = puzzle();
  p.outward[1].answer = 'DXTOR';   // reading position 5 ('x') pairs with cell index 3 ('i')
  const { model, warnings } = imp(p);
  assert.equal(model.cells[3], 'i');
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0], 'Cell 4: kept "I" from inward 1, discarded "X" from outward 2');
});

test('fromYaml: a single-sided circle is completed, with a warning naming the entry', () => {
  const p = puzzle();
  p.inward[0].styles = { circle: [1] };   // cell 2 -> outward 2 also covers it, but doesn't list it
  const { model, warnings } = imp(p);
  assert.deepEqual(model.circles, [1]);
  assert.deepEqual(warnings, ['Completed the circle on cell 2 (added to outward 2)']);
});

test('fromYaml: a circle listed on both entries imports without a warning', () => {
  const p = puzzle();
  p.inward[0].styles = { circle: [1] };
  p.outward[1].styles = { circle: [3] };  // outward 2 reading position 3 -> cell index 8-(4+3) = 1
  const { model, warnings } = imp(p);
  assert.deepEqual(model.circles, [1]);
  assert.deepEqual(warnings, []);
});

test('fromYaml: totals that differ throw a StructureError', () => {
  const p = puzzle();
  p.outward[1].answer = 'DITO';
  assert.throws(() => imp(p), (e) => e instanceof StructureError && /different numbers of cells \(9 vs 8\)/.test(e.message));
});

test('fromYaml: a muddled entry throws', () => {
  const p = puzzle();
  delete p.inward[0].answer; p.inward[0].length = 4;
  assert.throws(() => imp(p), (e) => e instanceof StructureError && /without answers/.test(e.message));
});

test('fromYaml: bad bracket grammar throws with the grammar message', () => {
  const p = puzzle();
  p.inward[0].answer = 'RO[TI';
  assert.throws(() => imp(p), (e) => e instanceof StructureError && /unclosed "\["/.test(e.message));
});

// ── export ──────────────────────────────────────────────────────────────────

test('toYaml: keeps the key order and doubles circles onto both cuts', () => {
  const p = puzzle();
  p.inward[0].styles = { circle: [1] };
  p.outward[1].styles = { circle: [3] };
  const out = spiral.toYaml(imp(p).model);
  assert.deepEqual(Object.keys(out), ['kind', 'title', 'author', 'inward', 'outward']);
  assert.deepEqual(out.inward[0].styles, { circle: [1] });
  assert.deepEqual(out.outward[1].styles, { circle: [3] });
  assert.ok(!('styles' in out.inward[1]));
});

test('toYaml: an outward entry reads from the highest cell down', () => {
  const out = spiral.toYaml(imp().model);
  assert.deepEqual(out.outward.map(e => e.answer), ['KERE', 'DITOR']);
});

test('toYaml: a reversal conflict exports the inward letters', () => {
  const p = puzzle();
  p.outward[1].answer = 'DXTOR';
  const out = spiral.toYaml(imp(p).model);
  assert.equal(out.outward[1].answer, 'DITOR');
});

// ── helpers ─────────────────────────────────────────────────────────────────

test('cutIndices: inward ascends, outward descends from T-1-s to T-e', () => {
  const { model } = imp();
  assert.deepEqual(cutIndices(model, 'inward', 1), [4, 5, 6, 7, 8]);
  assert.deepEqual(cutIndices(model, 'outward', 0), [8, 7, 6, 5]);
  assert.deepEqual(cutIndices(model, 'outward', 1), [4, 3, 2, 1, 0]);
});

test('gapToCutIndex and entryLabel', () => {
  const { model } = imp();
  assert.equal(gapToCutIndex(model, 'inward', 4), 4);
  assert.equal(gapToCutIndex(model, 'outward', 4), 5);
  assert.equal(entryLabel('outward', 2), 'outward 3');
});

// ── commands ────────────────────────────────────────────────────────────────

test('setCell edits a cell', () => {
  const { model } = imp();
  assert.equal(run(model, 'setCell', 0, 'x').cells[0], 'x');
  assert.equal(run(model, 'setCell', 0, '').cells[0], '');
});

test('insertCell shifts later breaks in both cuts, in each cut\'s own coordinates', () => {
  const { model } = imp();   // inward starts [0,4]; outward starts [0,4] (reading coordinates)
  const next = run(model, 'insertCell', 2);
  assert.deepEqual(next.cuts.inward.starts, [0, 5]);
  // the outward break sits at reading index 4 = cell index 4 (between cells 4 and 3 ->
  // 'i'|'d'); the insert is after it in reading order, so it stays at 4
  assert.deepEqual(next.cuts.outward.starts, [0, 4]);
  // an insert near the END of the sequence moves the outward break instead
  const late = run(model, 'insertCell', 8);
  assert.deepEqual(late.cuts.inward.starts, [0, 4]);
  assert.deepEqual(late.cuts.outward.starts, [0, 5]);
});

test('circles shift with an inserted cell, and a circle on a deleted cell is dropped', () => {
  const { model } = imp();
  const circled = run(model, 'toggleCircle', 6);
  assert.deepEqual(run(circled, 'insertCell', 0).circles, [7]);
  assert.deepEqual(run(circled, 'deleteCell', 6).circles, []);
});

test('deleting cells that swallow a break merges the entries and orphans the clue', () => {
  const { model } = imp();
  // 'rotid' (cells 1-5) deleted: the inward break at 4 sits inside the span and collapses
  // onto 0
  let next = model;
  for (let k = 0; k < 5; k++) next = run(next, 'deleteCell', 0);
  assert.equal(next.cells.join(''), 'erek');
  assert.deepEqual(next.cuts.inward.starts, [0]);
  // ...and the outward break now sits at the new end, so it merges too
  assert.deepEqual(next.cuts.outward.starts, [0]);
  assert.deepEqual(next.orphans.map(o => [o.clue, o.from]), [['i2', 'inward 2'], ['o2', 'outward 2']]);
  // a deletion that only straddles the break moves it instead of merging
  const moved = run(run(model, 'deleteCell', 3), 'deleteCell', 3);
  assert.equal(moved.cells.join(''), 'roterek');
  assert.deepEqual(moved.cuts.inward.starts, [0, 3]);
  assert.deepEqual(moved.orphans, []);
});

test('insertCell and deleteCell use the given index', () => {
  const { model } = imp();
  assert.equal(run(model, 'insertCell', 3).cells.length, 10);
  assert.equal(run(model, 'insertCell', 3).cells[3], '');
  assert.equal(run(model, 'deleteCell', 0).cells.join(''), 'otiderek');
});

test('toggleBreak: add then remove round-trips', () => {
  const { model } = imp();
  const added = run(model, 'toggleBreak', 'inward', 2);
  assert.deepEqual(added.cuts.inward.starts, [0, 2, 4]);
  assert.equal(added.cuts.inward.entries[1].id, 'e5');
  assert.equal(added.nextId, 6);
  const removed = run(added, 'toggleBreak', 'inward', 2);
  assert.deepEqual(removed.cuts.inward.starts, [0, 4]);
  assert.deepEqual(removed.cuts.inward.entries.map(e => e.id), ['e1', 'e2']);
});

test('toggleBreak: removing a break orphans a non-empty clue, labeled with the entry', () => {
  const { model } = imp();
  const out = run(model, 'toggleBreak', 'outward', 4);
  assert.deepEqual(out.cuts.outward.starts, [0]);
  assert.equal(out.orphans.length, 1);
  assert.equal(out.orphans[0].clue, 'o2');
  assert.equal(out.orphans[0].from, 'outward 2');
});

test('toggleBreak: index 0 and out-of-range indexes do nothing', () => {
  const { model } = imp();
  assert.equal(run(model, 'toggleBreak', 'inward', 0).cuts.inward.starts.length, 2);
  assert.equal(run(model, 'toggleBreak', 'inward', 9).cuts.inward.starts.length, 2);
});

test('setClue, setDisplayText, toggleCircle and setHeader', () => {
  const { model } = imp();
  assert.equal(run(model, 'setClue', 'outward', 1, 'new').cuts.outward.entries[1].clue, 'new');
  const shown = run(model, 'setDisplayText', 'inward', 0, 'RO-TI');
  assert.equal(shown.cuts.inward.entries[0].displayText, 'RO-TI');
  assert.ok(!('displayText' in run(shown, 'setDisplayText', 'inward', 0, '').cuts.inward.entries[0]));
  assert.deepEqual(run(model, 'toggleCircle', 3).circles, [3]);
  assert.deepEqual(run(run(model, 'toggleCircle', 3), 'toggleCircle', 3).circles, []);
  assert.equal(run(model, 'setHeader', 'author', '').header.author, undefined);
});

// Identity, not equality: history.commit records a step for any result that isn't the
// very same model, so a stale index or cut name must hand the model back untouched.
test('setClue and setDisplayText return the model itself for an entry that does not exist', () => {
  const { model } = imp();
  const missing = [['inward', -1], ['inward', model.cuts.inward.entries.length], ['inward', 99], ['sideways', 0]];
  for (const [cutName, j] of missing) {
    assert.equal(spiral.commands.setClue(model, cutName, j, 'x'), model);
    assert.equal(spiral.commands.setDisplayText(model, cutName, j, 'X'), model);
  }
});

test('attachOrphan swaps: the target\'s clue becomes the orphan, the orphan\'s clue moves in', () => {
  const { model } = imp();
  const orphaned = run(model, 'toggleBreak', 'outward', 4);          // orphan 'o2'
  const attached = run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 'inward', 0);
  assert.equal(attached.cuts.inward.entries[0].clue, 'o2');
  assert.equal(attached.orphans.length, 1);
  assert.equal(attached.orphans[0].clue, 'i1');
  assert.equal(attached.orphans[0].from, 'inward 1');
});

test('attachOrphan onto an empty-clue entry leaves no orphan; discardOrphan removes one', () => {
  const { model } = imp();
  const blank = run(model, 'setClue', 'inward', 1, '');
  const orphaned = run(blank, 'toggleBreak', 'outward', 4);
  const attached = run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 'inward', 1);
  assert.deepEqual(attached.orphans, []);
  assert.deepEqual(run(orphaned, 'discardOrphan', orphaned.orphans[0].id).orphans, []);
});

// ── completeness ────────────────────────────────────────────────────────────

test('completeness of a new puzzle lists the title, the empty cells and both clues', () => {
  const model = spiral.newModel({ cells: 40 });
  const d = spiral.completeness(model);
  assert.ok(d.every(x => x.level === 'error'));
  assert.deepEqual(d.map(x => x.message), [
    'Give the puzzle a title.',
    'Cells 1–40 are empty.',
    'Inward 1 (cells 1–40) has no clue.',
    'Outward 1 (cells 1–40) has no clue.',
  ]);
  assert.deepEqual(d[0].target, { header: 'title' });
});

test('completeness: empty-cell runs compress, and orphans are listed last', () => {
  const { model } = imp();
  let m = run(model, 'setCell', 2, '');
  m = run(m, 'setCell', 3, '');
  m = run(m, 'setCell', 4, '');
  m = run(m, 'setCell', 8, '');
  assert.equal(spiral.completeness(m)[0].message, 'Cells 3–5, 9 are empty.');
  const orphaned = run(model, 'toggleBreak', 'outward', 4);
  const last = spiral.completeness(orphaned).pop();
  assert.equal(last.message, 'Unattached clue "o2" (from outward 2). Attach or discard it.');
  assert.deepEqual(last.target, { orphan: orphaned.orphans[0].id });
});

test('completeness: a complete puzzle has no diagnostics, and one empty cell is singular', () => {
  const { model } = imp();
  assert.deepEqual(spiral.completeness(model), []);
  assert.equal(spiral.completeness(run(model, 'setCell', 4, ''))[0].message, 'Cell 5 is empty.');
});

test('completeness: an outward entry\'s range reads min–max over its cell numbers', () => {
  const { model } = imp();
  const d = spiral.completeness(run(model, 'setClue', 'outward', 0, ''));
  assert.equal(d[0].message, 'Outward 1 (cells 6–9) has no clue.');
  assert.deepEqual(d[0].target, { cut: 'outward', entry: 0 });
});

test('newModel: blank cells, one entry per cut', () => {
  const m = spiral.newModel({ cells: 40 });
  assert.equal(m.cells.length, 40);
  assert.ok(m.cells.every(c => c === ''));
  assert.deepEqual(m.cuts.inward.starts, [0]);
  assert.deepEqual(m.cuts.outward.starts, [0]);
  assert.equal(m.nextId, 3);
  assert.deepEqual(spiral.sizeFields, [{ name: 'cells', label: 'Cells', min: 40, max: 200, default: 78 }]);
});

test('fromYaml: a file that is not shaped like a spiral puzzle throws a StructureError, not a TypeError', () => {
  assert.throws(() => spiral.fromYaml({ kind: 'spiral', title: 'T' }), StructureError);
  assert.throws(() => spiral.fromYaml({ kind: 'spiral', title: 'T', inward: [null], outward: [] }), StructureError);
  assert.throws(() => spiral.fromYaml({ kind: 'spiral', title: 'T', inward: [{ clue: 'c', answer: 42 }], outward: [] }), StructureError);
});

// ── navigation helpers the editor uses ──────────────────────────────────────

test('stepRead: moves along the cut\'s reading order and stops at the ends', () => {
  const { model } = imp();   // 9 cells
  assert.equal(spiral.stepRead(model, 'inward', 3, 1), 4);
  assert.equal(spiral.stepRead(model, 'outward', 3, 1), 2);
  assert.equal(spiral.stepRead(model, 'inward', 3, -1), 2);
  assert.equal(spiral.stepRead(model, 'inward', 8, 1), 8);
  assert.equal(spiral.stepRead(model, 'outward', 0, 1), 0);
});

test('entryStart: Tab and Shift+Tab jump between entry starts; null past either end', () => {
  const { model } = imp();   // inward starts at cells 0 and 4; outward at cells 8 and 4
  assert.equal(spiral.entryStart(model, 'inward', 1, 1), 4);
  assert.equal(spiral.entryStart(model, 'inward', 5, 1), null);
  assert.equal(spiral.entryStart(model, 'inward', 5, -1), 4);
  assert.equal(spiral.entryStart(model, 'inward', 4, -1), 0);
  assert.equal(spiral.entryStart(model, 'inward', 0, -1), null);
  assert.equal(spiral.entryStart(model, 'outward', 6, 1), 4);
  assert.equal(spiral.entryStart(model, 'outward', 6, -1), 8);
  assert.equal(spiral.entryStart(model, 'outward', 8, -1), null);
});

test('entryFirstCell: the first cell of an entry in its reading order', () => {
  const { model } = imp();
  assert.equal(spiral.entryFirstCell(model, 'inward', 1), 4);
  assert.equal(spiral.entryFirstCell(model, 'outward', 0), 8);
});

test('breakAtCaret: the cut index for a break starting an entry at the caret, or why not', () => {
  const { model } = imp();
  assert.deepEqual(spiral.breakAtCaret(model, 'inward', 4), { index: 4 });
  assert.deepEqual(spiral.breakAtCaret(model, 'outward', 4), { index: 4 });
  assert.deepEqual(spiral.breakAtCaret(model, 'inward', 0), { message: 'Cell 1 always starts an inward entry.' });
  assert.deepEqual(spiral.breakAtCaret(model, 'outward', 8), { message: 'Cell 9 always starts an outward entry.' });
});

test('entryAtCell: which entry of a cut covers a cell', () => {
  const { model } = imp();
  assert.equal(spiral.entryAtCell(model, 'inward', 3), 0);
  assert.equal(spiral.entryAtCell(model, 'inward', 4), 1);
  assert.equal(spiral.entryAtCell(model, 'outward', 8), 0);
  assert.equal(spiral.entryAtCell(model, 'outward', 4), 1);
});

// ── robustness ──────────────────────────────────────────────────────────────

test('fromYaml: a puzzle with no cells, or an answer with no letters, throws a StructureError', () => {
  assert.throws(() => spiral.fromYaml({ kind: 'spiral', title: 'T', inward: [], outward: [] }), (e) => e instanceof StructureError && /no cells/.test(e.message));
  const p = puzzle(); p.inward[0].answer = '—';
  assert.throws(() => imp(p), (e) => e instanceof StructureError && /at least one letter/.test(e.message));
});

test('fromYaml: a clue or title that is not text throws a StructureError', () => {
  const clue = puzzle(); clue.inward[0].clue = 1984;
  assert.throws(() => imp(clue), (e) => e instanceof StructureError && /clue/.test(e.message));
  const title = puzzle(); title.title = 2024;
  assert.throws(() => imp(title), (e) => e instanceof StructureError && /title/.test(e.message));
});

test('the cell count never reaches zero', () => {
  const { model } = imp();
  const one = { ...model, cells: ['a'], cuts: { inward: { starts: [0], entries: [model.cuts.inward.entries[0]] }, outward: { starts: [0], entries: [model.cuts.outward.entries[0]] } }, circles: [] };
  assert.deepEqual(run(one, 'deleteCell', 0), one);
});

test('insertCell and deleteCell use the given index, not a diff of the letters', () => {
  const { model } = imp();
  let same = model;                                                    // 9 equal cells, a break at 4, a circle at 5
  for (let i = 0; i < 9; i++) same = run(same, 'setCell', i, 'x');
  same = run(same, 'toggleCircle', 5);
  const inserted = run(same, 'insertCell', 2);
  assert.deepEqual(inserted.cuts.inward.starts, [0, 5]);      // the break shifts with the cells after the insert
  assert.deepEqual(inserted.circles, [6]);
  const deleted = run(same, 'deleteCell', 2);
  assert.deepEqual(deleted.cuts.inward.starts, [0, 3]);
  assert.deepEqual(deleted.circles, [4]);
});

test('attachOrphan with an entry that no longer exists changes nothing', () => {
  const { model } = imp();
  const orphaned = run(model, 'toggleBreak', 'outward', 4);
  assert.deepEqual(run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 'inward', 99), orphaned);
  assert.deepEqual(run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 'nowhere', 0), orphaned);
});

test('isModel looks inside: cells, starts, entries and circles must be sound', () => {
  const { model } = imp();
  assert.equal(spiral.isModel(model), true);
  // The starts and entries of both cuts must line up.
  const short = { ...model, cuts: { ...model.cuts, inward: { ...model.cuts.inward, entries: model.cuts.inward.entries.slice(1) } } };
  assert.equal(spiral.isModel(short), false);
  const off = { ...model, cuts: { ...model.cuts, outward: { ...model.cuts.outward, starts: [2, 4] } } };
  assert.equal(spiral.isModel(off), false);
  const bad = (patch) => assert.equal(spiral.isModel({ ...model, ...patch }), false, JSON.stringify(patch).slice(0, 60));
  bad({ cells: [null, ...model.cells.slice(1)] });
  bad({ cells: ['A', ...model.cells.slice(1)] });
  bad({ cuts: { ...model.cuts, inward: { ...model.cuts.inward, starts: [0, 99] } } });
  bad({ cuts: { ...model.cuts, outward: { ...model.cuts.outward, entries: model.cuts.outward.entries.map(e => ({ id: e.id })) } } });
  bad({ circles: [1.5] });
  bad({ circles: [99] });
});
