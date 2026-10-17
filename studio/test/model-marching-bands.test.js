'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const mb       = require('../src/model/kinds/marching-bands');
const { StructureError } = require('../src/model/errors');
const { bandCells } = require('../../marching-bands/src/layout.mjs');

function deepFreeze(o) { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); }

// A 5×5 puzzle (the validator's own minimal one): the center cell is a block.
//   r0: A B C D E   r1: F G H I J   r2: K L # M N   r3: O P Q R S   r4: T U V W X
const puzzle = () => ({
  kind: 'marching-bands', title: 'T',
  rows: [
    { entries: [{ clue: 'r1a', answer: 'AB' }, { clue: 'r1b', answer: 'CDE' }] },
    { entries: [{ clue: 'r2a', answer: 'FG' }, { clue: 'r2b', answer: 'HIJ' }] },
    { entries: [{ clue: 'r3a', answer: 'KL' }, { clue: 'r3b', answer: 'MN' }] },
    { entries: [{ clue: 'r4a', answer: 'OPQ' }, { clue: 'r4b', answer: 'RS' }] },
    { entries: [{ clue: 'r5a', answer: 'TU' }, { clue: 'r5b', answer: 'VWX' }] },
  ],
  bands: [
    { entries: [{ clue: 'Aa', answer: 'ABCDE' }, { clue: 'Ab', answer: 'JNSX' }, { clue: 'Ac', answer: 'WVUT' }, { clue: 'Ad', answer: 'OKF' }] },
    { entries: [{ clue: 'Ba', answer: 'GHI' }, { clue: 'Bb', answer: 'MR' }, { clue: 'Bc', answer: 'QP' }, { clue: 'Bd', answer: 'L' }] },
  ],
});
const imp = (p = puzzle()) => mb.fromYaml(p);
const run = (model, name, ...args) => mb.commands[name](deepFreeze(structuredClone(model)), ...args);

test('isCenter: only the middle cell of an odd grid', () => {
  assert.equal(mb.isCenter(5, 13), true);
  assert.equal(mb.isCenter(4, 13), false);
});

test('shortLabel and entryName match the solver\'s clue labels', () => {
  assert.equal(mb.shortLabel('rows', 2, 1), '3b');
  assert.equal(mb.shortLabel('bands', 0, 3), 'Ad');
  assert.equal(mb.entryName('rows', 2, 1), 'Row 3 · b');
  assert.equal(mb.entryName('bands', 0, 3), 'Band A · d');
});

test('newModel: blank cells, one entry per row and band', () => {
  const m = mb.newModel({ size: 5 });
  assert.equal(m.cells.length, 25);
  assert.ok(m.cells.every(c => c === ''));
  assert.equal(m.rows.length, 5);
  assert.equal(m.bands.length, 2);
  assert.ok([...m.rows, ...m.bands].every(c => c.starts.length === 1 && c.entries.length === 1));
  assert.equal(m.emitSize, true);
  assert.equal(m.size, 5);
  assert.deepEqual(mb.sizeFields, [{ name: 'size', label: 'Grid size', min: 3, max: 25, default: 13 }]);
});

test('fromYaml: N = 5 gives the cells and the starts', () => {
  const { model, warnings } = imp();
  assert.deepEqual(warnings, []);
  assert.equal(model.size, 5);
  assert.equal(model.emitSize, false);
  assert.equal(model.cells[12], '');                              // the center
  assert.equal(model.cells.slice(0, 5).join(''), 'abcde');
  assert.equal(model.cells.slice(10, 15).join(''), 'kl' + '' + 'mn');
  assert.deepEqual(model.rows[2].starts, [0, 2]);
  assert.deepEqual(model.bands[0].starts, [0, 5, 9, 13]);
  assert.deepEqual(model.bands[1].starts, [0, 3, 5, 7]);
  assert.equal(model.nextId, 5 * 2 + 8 + 1);
});

// A band's bottom edge reads its row backward, so a rebus spelled backward there is the
// same cell, and the author's spelling survives a round trip.
test('fromYaml/toYaml: a bottom-edge band rebus spelled backward agrees, and keeps its spelling', () => {
  const p = puzzle();
  p.rows[4].entries[1].answer = '[VY]WX';         // cell (5,3) is "vy"
  p.bands[0].entries[2].answer = 'W[YV]UT';       // band A reads row 5 right to left
  const { model, warnings } = imp(p);
  assert.deepEqual(warnings, []);
  assert.equal(model.cells[22], 'vy');
  assert.equal(mb.toYaml(model).bands[0].entries[2].answer, 'W[YV]UT');
});

test('fromYaml: a row/band conflict keeps the row and warns with both names', () => {
  const p = puzzle(); p.bands[0].entries[1].answer = 'JNSZ';       // band A position 8 is cell (5,5): row letter X
  const { model, warnings } = imp(p);
  assert.equal(model.cells[24], 'x');
  assert.deepEqual(warnings, ['Cell (5, 5): kept "X" from Row 5 · b, discarded "Z" from Band A · b']);
});

test('fromYaml: counts and sums that do not tile throw StructureErrors', () => {
  const badBand = puzzle(); badBand.bands[0].entries[3].answer = 'OK';
  assert.throws(() => imp(badBand), (e) => e instanceof StructureError && /Band A/.test(e.message));
  const fewRows = puzzle(); fewRows.rows.pop();
  assert.throws(() => imp(fewRows), (e) => e instanceof StructureError && /rows/.test(e.message));
  const badRow = puzzle(); badRow.rows[0].entries[1].answer = 'CD';
  assert.throws(() => imp(badRow), StructureError);
  const sizeOff = { ...puzzle(), size: 7 };
  assert.throws(() => imp(sizeOff), (e) => e instanceof StructureError && /size/.test(e.message));
});

test('fromYaml: muddled and misshapen files throw StructureErrors', () => {
  const mud = puzzle(); delete mud.rows[0].entries[0].answer; mud.rows[0].entries[0].length = 2;
  assert.throws(() => imp(mud), (e) => e instanceof StructureError && /muddled/.test(e.message));
  assert.throws(() => mb.fromYaml({ kind: 'marching-bands', title: 'T' }), StructureError);
  assert.throws(() => mb.fromYaml({ kind: 'marching-bands', title: 'T', rows: [{}], bands: [] }), StructureError);
});

test('fromYaml: a one-sided circle is completed with a warning naming the entry', () => {
  const p = puzzle(); p.rows[0].entries[0].styles = { circle: [1] };    // cell (1, 2); band A also covers it
  const { model, warnings } = imp(p);
  assert.deepEqual(model.circles, [2]);
  assert.deepEqual(warnings, ['Completed the circle on cell (1, 2) (added to Band A · a)']);
});

test('toYaml: circles are written on both the row and the band entry; size only when emitSize', () => {
  const p = puzzle();
  p.rows[0].entries[0].styles = { circle: [1] };
  p.bands[0].entries[0].styles = { circle: [1] };
  const { model } = imp(p);
  const out = mb.toYaml(model);
  assert.deepEqual(out.rows[0].entries[0].styles, { circle: [1] });
  assert.deepEqual(out.bands[0].entries[0].styles, { circle: [1] });
  assert.ok(!('size' in out));
  assert.equal(mb.toYaml({ ...model, emitSize: true }).size, 5);
  assert.deepEqual(Object.keys(mb.toYaml({ ...model, emitSize: true })), ['kind', 'title', 'size', 'rows', 'bands']);
});

test('toggleBreak: splitting then joining a row restores one entry and orphans the joined clue', () => {
  const { model } = imp();
  const joined = run(model, 'toggleBreak', 'rows', 0, 2);              // row 0 already has a start at 2, so this joins
  assert.deepEqual(joined.rows[0].starts, [0]);
  assert.equal(joined.rows[0].entries.length, 1);
  assert.deepEqual(joined.orphans.map(o => [o.clue, o.from]), [['r1b', 'Row 1 · b']]);
  const resplit = run(joined, 'toggleBreak', 'rows', 0, 2);
  assert.deepEqual(resplit.rows[0].starts, [0, 2]);
  assert.equal(resplit.rows[0].entries.length, 2);
  assert.equal(resplit.rows[0].entries[1].clue, '');
});

test('toggleBreak: i = 0 and out-of-range indexes change nothing', () => {
  const { model } = imp();
  assert.deepEqual(run(model, 'toggleBreak', 'rows', 0, 0), model);
  assert.deepEqual(run(model, 'toggleBreak', 'bands', 1, 0), model);
  assert.deepEqual(run(model, 'toggleBreak', 'rows', 0, 99), model);
});

test('setCell is a no-op on the center', () => {
  const { model } = imp();
  assert.deepEqual(run(model, 'setCell', 13, 'x'), model);
  assert.equal(run(model, 'setCell', 1, 'Z').cells[0], 'z');
});

test('setLine on a row: cells are written, the band crossing sees them, starts decide the entries', () => {
  const { model } = imp();
  // row 0 (A B C D E | AB CDE) becomes xyzab with a start at 3 instead of 2
  const next = run(model, 'setLine', 'rows', 0, ['x', 'y', 'z', 'a', 'b'], [0, 3]);
  assert.equal(next.cells.slice(0, 5).join(''), 'xyzab');
  const band = mb.pathIds(next, 'bands', 0).slice(0, 5).map(id => next.cells[id - 1]).join('');
  assert.equal(band, 'xyzab');
  assert.deepEqual(next.rows[0].starts, [0, 3]);
  assert.equal(next.rows[0].entries[0].id, model.rows[0].entries[0].id);   // the start at 0 didn't move: keeps its entry and clue
  assert.equal(next.rows[0].entries[0].clue, 'r1a');
  assert.equal(next.rows[0].entries[1].clue, '');                          // a new start: new, empty
  assert.deepEqual(next.orphans.map(o => [o.clue, o.from]), [['r1b', 'Row 1 · b']]);
});

test('setLine keeps an entry whose start did not move, even with new letters', () => {
  const { model } = imp();
  const next = run(model, 'setLine', 'rows', 0, ['x', 'y', 'c', 'd', 'e'], [0, 2]);
  assert.equal(next.rows[0].entries[1].clue, 'r1b');
  assert.deepEqual(next.orphans, []);
});

test('setLine on a band writes the letters in bandCells order', () => {
  const { model } = imp();
  const cells = Array.from({ length: 8 }, (_, i) => String.fromCharCode(97 + i));     // a..h around band B
  const next = run(model, 'setLine', 'bands', 1, cells, [0, 4]);
  bandCells(1, 5).forEach((id, i) => assert.equal(next.cells[id - 1], cells[i]));
  assert.deepEqual(next.bands[1].starts, [0, 4]);
});

test('resize 5 → 7: content stays top-left, a center-row break is mapped by column, band clues are orphaned', () => {
  const { model } = imp();
  const next = run(model, 'resize', 7);
  assert.equal(next.size, 7);
  assert.equal(next.cells.length, 49);
  assert.equal(next.cells[0], 'a');
  assert.equal(next.cells[2 * 7 + 1], model.cells[2 * 5 + 1]);
  assert.equal(next.rows.length, 7);
  assert.equal(next.bands.length, 3);
  // the 5×5's center row (index 2) broke before column 3 (0-based; index 2 of its 4
  // cells); in the 7×7 row 2 no longer skips a cell there, so the same column is index 3
  assert.deepEqual(next.rows[2].starts, [0, 3]);
  // bands: each kept band keeps only its first clue; the rest are orphaned
  assert.deepEqual(next.bands.map(c => c.starts), [[0], [0], [0]]);
  // row 4's break (OPQ | RS) is before column 4, which is the 7×7's center: it can't
  // survive
  assert.deepEqual(next.rows[3].starts, [0]);
  assert.ok(next.orphans.some(o => o.clue === 'r4b' && o.from === 'Row 4 · b'));
  const lost = mb.resizeLosses(model, 7);
  assert.deepEqual(lost, { rowClues: 1, bandClues: 3 + 3 });
  assert.equal(next.orphans.length, lost.rowClues + lost.bandClues);
});

test('resize 7 → 5: removed rows orphan their clues and the new center is empty', () => {
  let m = imp().model;
  m = run(m, 'resize', 7);
  m = run(m, 'setClue', 'rows', 6, 0, 'last row');
  m = run(m, 'setCell', 17, 'q');                                          // 7×7 cell (2, 2): the 5×5's center
  const next = run(m, 'resize', 5);
  assert.equal(next.rows.length, 5);
  assert.equal(next.cells[12], '');
  assert.ok(next.orphans.some(o => o.clue === 'last row' && o.from === 'Row 7 · a'));
  const lost = mb.resizeLosses(m, 5);
  assert.ok(lost.rowClues >= 1);
  assert.equal(next.orphans.length - m.orphans.length, lost.rowClues + lost.bandClues);
});

test('resize keeps circles still on the board and drops one on the new center', () => {
  let m = imp().model;
  m = run(m, 'toggleCircle', 2);
  const grown = run(m, 'resize', 7);
  assert.deepEqual(grown.circles, [2]);
  const sevenCircled = run(grown, 'toggleCircle', 25);                      // 7×7 cell (3, 3) is its center → no-op
  assert.deepEqual(sevenCircled.circles, [2]);
});

test('other commands: setClue, setDisplayAnswer, toggleCircle, setHeader, attach and discard orphans', () => {
  const { model } = imp();
  assert.equal(run(model, 'setClue', 'bands', 1, 3, 'new').bands[1].entries[3].clue, 'new');
  assert.equal(run(model, 'setDisplayAnswer', 'rows', 0, 0, 'A-B').rows[0].entries[0].displayAnswer, 'A-B');
  assert.deepEqual(run(run(model, 'toggleCircle', 6), 'toggleCircle', 6).circles, []);
  assert.deepEqual(run(model, 'toggleCircle', 13).circles, []);
  assert.equal(run(model, 'setHeader', 'author', 'Me').header.author, 'Me');
  const orphaned = run(model, 'toggleBreak', 'rows', 0, 2);
  const attached = run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 'bands', 1, 0);
  assert.equal(attached.bands[1].entries[0].clue, 'r1b');
  assert.equal(attached.orphans[0].clue, 'Ba');
  assert.deepEqual(run(orphaned, 'discardOrphan', orphaned.orphans[0].id).orphans, []);
  assert.deepEqual(run(orphaned, 'attachOrphan', orphaned.orphans[0].id, 'bands', 9, 0), orphaned);
});

test('completeness: title, empty cells (capped), entries without clues, then orphans', () => {
  const blank = mb.completeness(mb.newModel({ size: 5 })).map(d => d.message);
  assert.equal(blank[0], 'Give the puzzle a title.');
  assert.match(blank[1], /^Empty cells: \(1, 1\), \(1, 2\), .*, \(2, 5\), and 14 more\.$/);
  assert.equal(blank[2], 'Row 1 · a has no clue.');
  assert.ok(blank.includes('Band B · a has no clue.'));
  assert.deepEqual(mb.completeness(imp().model), []);
  const one = mb.completeness(run(imp().model, 'setCell', 1, ''))[0];
  assert.equal(one.message, 'Cell (1, 1) is empty.');
  const orphaned = run(imp().model, 'toggleBreak', 'rows', 0, 2);
  assert.match(mb.completeness(orphaned).pop().message, /^Unattached clue "r1b" \(from Row 1 · b\)/);
});

test('isModel: shape and soundness', () => {
  const { model } = imp();
  assert.equal(mb.isModel(model), true);
  assert.equal(mb.isModel({ ...model, cells: model.cells.slice(1) }), false);
  assert.equal(mb.isModel({ ...model, rows: model.rows.slice(1) }), false);
  assert.equal(mb.isModel({ ...model, size: 'x' }), false);
});

test('navigation helpers: advance, spatial moves, group steps, break at the caret', () => {
  const { model } = imp();
  assert.equal(mb.advance(model, 'rows', 5, 1), null);                     // the end of row 1: stops
  assert.equal(mb.advance(model, 'rows', 2, 1), 3);
  assert.equal(mb.advance(model, 'rows', 12, 1), 14);                      // skips the center
  assert.equal(mb.advance(model, 'rows', 3, -1), 2);
  assert.equal(mb.advance(model, 'bands', 5, 1), 10);                      // top-right corner → down the right side
  assert.equal(mb.advance(model, 'bands', 6, 1), 1);                       // the band's last cell wraps to its first
  assert.equal(mb.advance(model, 'bands', 1, -1), 6);
  assert.equal(mb.moveSpatial(model, 8, 1, 0), 18);                        // arrowTarget (layout.test.js), sized by the model
  assert.equal(mb.stepGroup(model, 'rows', 3, 1), 6);                      // the first cell of the next row
  assert.equal(mb.stepGroup(model, 'rows', 3, -1), 21);                    // wrapping to the last row
  assert.equal(mb.stepGroup(model, 'bands', 3, 1), 7);                     // band B starts at (2, 2)
  assert.deepEqual(mb.breakAtCaret(model, 'rows', 3), { command: ['toggleBreak', ['rows', 0, 2]] });
  assert.match(mb.breakAtCaret(model, 'rows', 1).message, /first entry always starts in its first cell/);
  assert.match(mb.breakAtCaret(model, 'bands', 1).message, /top-left corner/);
});

test('placeLabel: the columns a row entry spans, or the band sides an entry runs along', () => {
  const { model } = imp();
  assert.equal(mb.placeLabel(model, 'rows', 0, 1), 'columns 3–5');
  assert.equal(mb.placeLabel(model, 'rows', 2, 1), 'columns 4–5');
  assert.equal(mb.placeLabel(model, 'bands', 0, 0), 'top');
  assert.equal(mb.placeLabel(model, 'bands', 0, 1), 'right');
  assert.equal(mb.placeLabel(model, 'bands', 0, 2), 'bottom');
  assert.equal(mb.placeLabel(model, 'bands', 0, 3), 'left');
  const one = run(model, 'setLine', 'bands', 0, mb.pathIds(model, 'bands', 0).map(id => model.cells[id - 1]), [0, 3]);
  assert.equal(mb.placeLabel(one, 'bands', 0, 1), 'top → right → bottom → left');
});

test('entryOfCell and entryIds: which entry covers a cell, and the cells of an entry', () => {
  const { model } = imp();
  assert.deepEqual(mb.entryOfCell(model, 'rows', 14), { g: 2, j: 1 });
  assert.deepEqual(mb.entryOfCell(model, 'bands', 14), { g: 1, j: 1 });
  assert.deepEqual(mb.entryIds(model, 'bands', 1, 1), [14, 19]);
  assert.deepEqual(mb.entryIds(model, 'rows', 0, 1), [3, 4, 5]);
});

test('lineText: a row or band as text, an entry per part, split by " | "', () => {
  const { model } = imp();
  assert.equal(mb.lineText(model, 'rows', 0), 'AB | CDE');
  assert.equal(mb.lineText(model, 'rows', 2), 'KL | MN');
  assert.equal(mb.lineText(model, 'bands', 1), 'GHI | MR | QP | L');
});

test('parseLine: cells and starts for a good line', () => {
  const { model } = imp();
  assert.deepEqual(mb.parseLine(model, 'rows', 0, 'AB | CDE'), { cells: ['a', 'b', 'c', 'd', 'e'], starts: [0, 2] });
  // a bracketed group is one cell and _ an empty one: five cells fill the five-cell row
  assert.deepEqual(mb.parseLine(model, 'rows', 0, 'A[BC]D | E_'), { cells: ['a', 'bc', 'd', 'e', ''], starts: [0, 3] });
});

test('parseLine: every complaint, in the plan\'s words', () => {
  const { model } = imp();
  assert.match(mb.parseLine(model, 'rows', 0, 'AB | C[DE').error, /unclosed "\["/);
  const empty = /^Each \| needs letters on both sides\. Two in a row, or one at either end, would leave an empty entry\.$/;
  assert.match(mb.parseLine(model, 'rows', 0, 'AB || CDE').error, empty);
  assert.match(mb.parseLine(model, 'rows', 0, '| ABCDE').error, empty);
  assert.match(mb.parseLine(model, 'rows', 0, 'ABCDE |').error, empty);
  assert.equal(mb.parseLine(model, 'rows', 0, 'AB | CD').error, 'Row 1 has 5 cells, and this has 4.');
  assert.equal(mb.parseLine(model, 'bands', 1, 'GHI').error, 'Band B has 8 cells, and this has 3.');
  assert.equal(mb.parseLine(model, 'rows', 2, 'KL | MN').error, undefined);        // the center row has 4 cells
});

// ── robustness (cross-tool review of PR 3b) ─────────────────────────────────

test('stepBack: the previous id along the path, and nothing before a path\'s first cell', () => {
  const { model } = imp();
  assert.equal(mb.stepBack(model, 'rows', 3), 2);
  assert.equal(mb.stepBack(model, 'rows', 14), 12);               // skips the center
  assert.equal(mb.stepBack(model, 'rows', 1), null);
  assert.equal(mb.stepBack(model, 'bands', 10), 5);
  assert.equal(mb.stepBack(model, 'bands', 1), null);             // a band's first cell: it does not wrap to the last
});

test('resize ignores a size that is not a whole number from 3 up, or is the current size', () => {
  const { model } = imp();
  for (const bad of [NaN, 2, 4.5, '7', null, undefined, 5]) assert.deepEqual(run(model, 'resize', bad), model, String(bad));
});

test('setLine ignores a line that does not fit the row or band it is for', () => {
  const { model } = imp();
  const ok = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(run(model, 'setLine', 'rows', 9, ok, [0]), model);                       // no such row
  assert.deepEqual(run(model, 'setLine', 'nowhere', 0, ok, [0]), model);
  assert.deepEqual(run(model, 'setLine', 'rows', 0, ok.slice(1), [0]), model);              // too few cells
  assert.deepEqual(run(model, 'setLine', 'rows', 0, ok, [1, 3]), model);                    // must start at 0
  assert.deepEqual(run(model, 'setLine', 'rows', 0, ok, [0, 3, 3]), model);                 // strictly increasing
  assert.deepEqual(run(model, 'setLine', 'rows', 0, ok, [0, 5]), model);                    // inside the row
  assert.notDeepEqual(run(model, 'setLine', 'rows', 0, ok, [0, 3]), model);
});

test('isModel: circles are real ids (1 up, never the center) and the center cell is empty', () => {
  const { model } = imp();
  const bad = (patch) => assert.equal(mb.isModel({ ...model, ...patch }), false, JSON.stringify(patch).slice(0, 50));
  bad({ circles: [0] });
  bad({ circles: [13] });                                          // the 5×5's center
  bad({ circles: [26] });
  const cells = model.cells.slice(); cells[12] = 'x';
  bad({ cells });
  assert.equal(mb.isModel({ ...model, circles: [1, 25] }), true);
});

test('the line-field message for a first entry has one home', () => {
  assert.equal(mb.FIRST_ENTRY_MESSAGE.bands, mb.breakAtCaret(imp().model, 'bands', 1).message);
  assert.equal(mb.FIRST_ENTRY_MESSAGE.rows, mb.breakAtCaret(imp().model, 'rows', 1).message);
});

test('resize refuses a size above the size field\'s maximum', () => {
  const { model } = imp();
  assert.deepEqual(run(model, 'resize', 26), model);
  assert.deepEqual(run(model, 'resize', 30), model);
  assert.equal(run(model, 'resize', 25).size, 25);
});

test('parseLine: an empty line reports the cell count, not a complaint about |', () => {
  const { model } = imp();
  assert.equal(mb.parseLine(model, 'rows', 2, '').error, 'Row 3 has 4 cells, and this has 0.');
  assert.equal(mb.parseLine(model, 'bands', 0, '   ').error, 'Band A has 16 cells, and this has 0.');
});
