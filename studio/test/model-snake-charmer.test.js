'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const sc       = require('../src/model/kinds/snake-charmer');
const { StructureError } = require('../src/model/errors');

function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

// Ring ABCDEFGH (N = 8), five entries over 16 positions; the third, GHAB, straddles the
// lap boundary.
const puzzle = () => ({
  kind: 'snake-charmer', title: 'T',
  entries: [
    { clue: 'e1', answer: 'ABC' }, { clue: 'e2', answer: 'DEF' }, { clue: 'e3', answer: 'GHAB' },
    { clue: 'e4', answer: 'CD' }, { clue: 'e5', answer: 'EFGH' },
  ],
});
const imp = (p = puzzle()) => sc.fromYaml(p);
const run = (model, name, ...args) => sc.commands[name](deepFreeze(structuredClone(model)), ...args);

test('newModel: a blank ring and one entry over both laps; the shape is kept', () => {
  const m = sc.newModel({ cells: 16 });
  assert.equal(m.ring.length, 16);
  assert.ok(m.ring.every(c => c === ''));
  assert.deepEqual(m.cut.starts, [0]);
  assert.equal(m.shape, null);
  assert.equal(m.loops, null);
  assert.equal(sc.newModel({ cells: 48, shape: 'turn' }).shape, 'turn');
  assert.deepEqual(sc.sizeFields, [{ name: 'cells', label: 'Cells per lap', min: 8, max: 120, step: 2, default: 48 }]);
});

test('fromYaml: starts come from cumulative lengths and positionsOf wraps the lap boundary', () => {
  const { model, warnings } = imp();
  assert.deepEqual(warnings, []);
  assert.deepEqual(model.ring, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.deepEqual(model.cut.starts, [0, 3, 6, 10, 12]);
  assert.deepEqual(sc.positionsOf(model, 2), [6, 7, 8, 9]);
  assert.equal(sc.ringLabel(model, 2), 'ring cells 7–2');
  assert.equal(sc.twin(model, 3), 11);
  assert.equal(sc.twin(model, 11), 3);
});

test('fromYaml: a lap conflict keeps lap 1 and warns with both entries', () => {
  const p = puzzle(); p.entries[4].answer = 'EFGX';
  const { model, warnings } = imp(p);
  assert.equal(model.ring[7], 'h');
  assert.deepEqual(warnings, ['Ring cell 8: kept "H" from entry 3 (lap 1), discarded "X" from entry 5 (lap 2)']);
});

test('fromYaml: an odd total, loops other than 2, and muddled entries throw StructureErrors', () => {
  const odd = puzzle(); odd.entries[4].answer = 'EFG';
  assert.throws(() => imp(odd), (e) => e instanceof StructureError && /odd number of cells \(15\)/.test(e.message));
  const loops = puzzle(); loops.loops = 3;
  assert.throws(() => imp(loops), (e) => e instanceof StructureError && /only two-loop puzzles/.test(e.message));
  const mud = puzzle(); delete mud.entries[0].answer; mud.entries[0].length = 3;
  assert.throws(() => imp(mud), (e) => e instanceof StructureError && /muddled/.test(e.message));
});

test('fromYaml: files that are not shaped like puzzles throw StructureErrors', () => {
  assert.throws(() => sc.fromYaml({ kind: 'snake-charmer', title: 'T' }), StructureError);
  assert.throws(() => sc.fromYaml({ kind: 'snake-charmer', title: 'T', entries: [] }), (e) => e instanceof StructureError && /no cells/.test(e.message));
  const clue = puzzle(); clue.entries[0].clue = 7;
  assert.throws(() => imp(clue), StructureError);
  const letterless = puzzle(); letterless.entries[0].answer = '—';
  assert.throws(() => imp(letterless), (e) => e instanceof StructureError && /at least one letter/.test(e.message));
});

test('fromYaml: a one-sided circle is completed with a warning naming the entry', () => {
  const p = puzzle();
  p.entries[0].styles = { circle: [1] };            // position 1 = ring cell 2; lap 2 position 9 is in entry 3
  const { model, warnings } = imp(p);
  assert.deepEqual(model.circles, [1]);
  assert.deepEqual(warnings, ['Completed the circle on ring cell 2 (added to entry 3)']);
});

test('toYaml: circles are written on both laps, and loops and shape only when present', () => {
  const p = puzzle();
  p.entries[0].styles = { circle: [1] };
  p.entries[2].styles = { circle: [3] };            // position 9
  const out = sc.toYaml(imp(p).model);
  assert.deepEqual(out.entries[0].styles, { circle: [1] });
  assert.deepEqual(out.entries[2].styles, { circle: [3] });
  assert.ok(!('loops' in out) && !('shape' in out));
  assert.deepEqual(Object.keys(out), ['kind', 'title', 'entries']);
  const withBoth = { ...puzzle(), loops: 2, shape: 'stadium' };
  const out2 = sc.toYaml(imp(withBoth).model);
  assert.equal(out2.loops, 2);
  assert.equal(out2.shape, 'stadium');
  assert.deepEqual(Object.keys(out2), ['kind', 'title', 'loops', 'shape', 'entries']);
});

test('setRing: inserting a cell shifts the starts in both laps and keeps a straddling entry', () => {
  const { model } = imp();
  const next = run(model, 'setRing', ['a', 'b', 'c', 'd', 'x', 'e', 'f', 'g', 'h']);
  assert.deepEqual(next.cut.starts, [0, 3, 7, 11, 13]);
  assert.deepEqual(sc.positionsOf(next, 2), [7, 8, 9, 10]);   // GH | AB, still across the boundary (N is now 9)
  assert.equal(next.ring.length, 9);
});

test('insertCell and deleteCell use the given index and keep circles on their cells', () => {
  let m = imp().model;
  for (let k = 0; k < 8; k++) m = run(m, 'setCell', k, 'x');         // equal neighbors everywhere
  m = run(m, 'toggleCircle', 5);
  const ins = run(m, 'insertCell', 2);
  assert.deepEqual(ins.cut.starts, [0, 4, 7, 11, 14]);
  assert.deepEqual(ins.circles, [6]);
  const del = run(m, 'deleteCell', 2);
  assert.deepEqual(del.circles, [4]);
});

test('setRing never leaves the ring empty', () => {
  const { model } = imp();
  assert.deepEqual(run(model, 'setRing', []), model);
});

test('toggleBreak at position N creates two entries starting on the same ring cell', () => {
  const { model } = imp();
  const next = run(model, 'toggleBreak', 8);
  assert.deepEqual(next.cut.starts, [0, 3, 6, 8, 10, 12]);
  assert.deepEqual(sc.coincidentStarts(next), [0]);
  assert.deepEqual(sc.coincidentStarts(model), []);
  const back = run(next, 'toggleBreak', 8);
  assert.deepEqual(back.cut.starts, [0, 3, 6, 10, 12]);
});

test('toggleBreak: removing a break orphans its clue, and 0 and out-of-range do nothing', () => {
  const { model } = imp();
  const next = run(model, 'toggleBreak', 10);
  assert.deepEqual(next.orphans.map(o => [o.clue, o.from]), [['e4', 'entry 4']]);
  assert.deepEqual(run(model, 'toggleBreak', 0), model);
  assert.deepEqual(run(model, 'toggleBreak', 16), model);
});

test('lapsLabel: lap 1, lap 2, laps 1–2 and both laps', () => {
  const { model } = imp();
  assert.equal(sc.lapsLabel(model, 0), 'lap 1');
  assert.equal(sc.lapsLabel(model, 3), 'lap 2');
  assert.equal(sc.lapsLabel(model, 2), 'laps 1–2');
  assert.equal(sc.lapsLabel(sc.newModel({ cells: 16 }), 0), 'both laps');
});

test('other commands: setShape, setClue, setDisplayAnswer, setHeader, attach and discard orphans', () => {
  const { model } = imp();
  assert.equal(run(model, 'setShape', 'turn').shape, 'turn');
  assert.equal(run(run(model, 'setShape', 'turn'), 'setShape', null).shape, null);
  assert.equal(run(model, 'setClue', 3, 'new').cut.entries[3].clue, 'new');
  assert.equal(run(model, 'setDisplayAnswer', 0, 'A-B-C').cut.entries[0].displayAnswer, 'A-B-C');
  assert.equal(run(model, 'setHeader', 'author', 'Me').header.author, 'Me');
  const orphaned = run(model, 'toggleBreak', 10);
  const attached = run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 0);
  assert.equal(attached.cut.entries[0].clue, 'e4');
  assert.equal(attached.orphans[0].clue, 'e1');
  assert.deepEqual(run(orphaned, 'discardOrphan', orphaned.orphans[0].id).orphans, []);
});

// Identity, not equality: history.commit records a step for any result that isn't the
// very same model, so a stale index must hand the model back untouched.
test('setClue and setDisplayAnswer return the model itself for an entry that does not exist', () => {
  const { model } = imp();
  for (const j of [-1, model.cut.entries.length, 99]) {
    assert.equal(sc.commands.setClue(model, j, 'x'), model);
    assert.equal(sc.commands.setDisplayAnswer(model, j, 'X'), model);
  }
});

test('completeness: title, empty ring cells, entries without clues, then orphans', () => {
  const blank = sc.completeness(sc.newModel({ cells: 16 })).map(d => d.message);
  assert.deepEqual(blank, [
    'Give the puzzle a title.',
    'Ring cells 1–16 are empty.',
    'Entry 1 (ring cells 1–16) has no clue.',
  ]);
  const { model } = imp();
  assert.deepEqual(sc.completeness(model), []);
  let m = run(model, 'setCell', 2, ''); m = run(m, 'setCell', 3, ''); m = run(m, 'setCell', 4, '');
  assert.equal(sc.completeness(m)[0].message, 'Ring cells 3–5 are empty.');
  assert.equal(sc.completeness(run(model, 'setCell', 4, ''))[0].message, 'Ring cell 5 is empty.');
  const noClue = sc.completeness(run(model, 'setClue', 2, ''));
  assert.equal(noClue[0].message, 'Entry 3 (ring cells 7–2) has no clue.');
  assert.deepEqual(noClue[0].target, { entry: 2 });
  const orphaned = run(model, 'toggleBreak', 10);
  assert.match(sc.completeness(orphaned).pop().message, /^Unattached clue "e4" \(from entry 4\)/);
});

test('navigation helpers: wrap at both ends, Tab jumps, and | at the caret', () => {
  const { model } = imp();                                   // 16 positions, starts [0,3,6,10,12]
  assert.equal(sc.stepPosition(model, 15, 1), 0);
  assert.equal(sc.stepPosition(model, 0, -1), 15);
  assert.equal(sc.entryStartPosition(model, 4, 1), 6);
  assert.equal(sc.entryStartPosition(model, 13, 1), 0);
  assert.equal(sc.entryStartPosition(model, 4, -1), 3);
  assert.equal(sc.entryStartPosition(model, 0, -1), 12);
  assert.deepEqual(sc.breakAtCaret(model, 9), { index: 9 });
  assert.deepEqual(sc.breakAtCaret(model, 0), { message: 'Entry 1 always starts at the first cell of lap 1.' });
  assert.equal(sc.entryAtPosition(model, 9), 2);
});

// ── robustness (cross-tool review of PR 3a) ─────────────────────────────────

test('fromYaml: a shape that is not one of the four throws a StructureError', () => {
  assert.throws(() => imp({ ...puzzle(), shape: 'hexagon' }), (e) => e instanceof StructureError && /shape/.test(e.message));
  assert.throws(() => imp({ ...puzzle(), shape: 7 }), StructureError);
  assert.equal(imp({ ...puzzle(), shape: 'turn' }).model.shape, 'turn');
});

test('isModel: starts and entries must line up', () => {
  const { model } = imp();
  assert.equal(sc.isModel(model), true);
  assert.equal(sc.isModel({ ...model, cut: { ...model.cut, entries: model.cut.entries.slice(1) } }), false);
  assert.equal(sc.isModel({ ...model, cut: { ...model.cut, starts: [1, ...model.cut.starts.slice(1)] } }), false);
  assert.equal(sc.isModel({ ...model, shape: 'hexagon' }), false);
});

test('attachOrphan with an entry that no longer exists changes nothing', () => {
  const { model } = imp();
  const orphaned = run(model, 'toggleBreak', 10);
  assert.deepEqual(run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 99), orphaned);
});

test('isModel looks inside: cells, starts, entries and circles must be sound', () => {
  const { model } = imp();
  const bad = (patch) => assert.equal(sc.isModel({ ...model, ...patch }), false, JSON.stringify(patch).slice(0, 60));
  bad({ ring: [null, ...model.ring.slice(1)] });
  bad({ ring: ['A', ...model.ring.slice(1)] });
  bad({ cut: { ...model.cut, starts: [0, 5, 3, 10, 12] } });
  bad({ cut: { ...model.cut, starts: [0, 3, 6, 10, 99] } });
  bad({ cut: { ...model.cut, entries: model.cut.entries.map(e => ({ id: e.id })) } });
  bad({ circles: ['x'] });
  bad({ circles: [99] });
});
