'use strict';
// The Marching Bands kind module (the contract is at the top of the Phase 2 plan).
//
// An N×N grid of cells (the center is a block when N is odd) with one cut per row, over
// the row's cells (skipping the center), and one cut per band, over bandCells(k, N): the
// clockwise path the validator and the engine already share, so there is one home for
// band geometry. Cell ids are 1-based, row-major, as the solver numbers them.
//
// Model:
//   { kind: 'marching-bands', header, emitSize, size: N, cells: string[] /* index = id - 1 */,
//     rows: Cut[], bands: Cut[], circles: number[] /* ids */, orphans: [], nextId }
// In commands and helpers `group` is 'rows' or 'bands' and `g` the row or band index.
const { bandCells, rowCells, bandIndexOf, centerN, arrowTarget, onBandBottomEdge } = require('../../../../marching-bands/src/layout.mjs');
const { sameCell } = require('../../../../shared/build/validateEntry');
const { StructureError } = require('../errors');
const { formatCell, formatSequence, parseSequence } = require('../cells');
const { ranges, entryAt, addBreak, removeBreak, orphanOf } = require('../starts');
const { newEntry, entryFromYaml, entryToYaml, circledPositions } = require('../entries');
const { headerFromYaml, headerToYaml, setHeaderField } = require('../header');
const { sanitizeCell, toggleSorted, cumulativeStarts, parseEntryCells, takeOrphan, displayPatch, isCut, isCells, isCircles, isModelBase } = require('../kindCommon');

const kind = 'marching-bands';
const sizeFields = [{ name: 'size', label: 'Grid size', min: 3, max: 25, default: 13 }];
const GROUPS = ['rows', 'bands'];
const BAND_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── geometry helpers ────────────────────────────────────────────────────────

const rowOf = (N, id) => Math.floor((id - 1) / N);
const colOf = (N, id) => (id - 1) % N;
const isCenter = (N, id) => N % 2 === 1 && id === centerN(N);

function pathIds(model, group, g) {
  return group === 'rows' ? rowCells(g, model.size) : bandCells(g, model.size);
}

const letterOf = (j) => String.fromCharCode(97 + j);
const groupName = (group, g) => (group === 'rows' ? `Row ${g + 1}` : `Band ${BAND_LETTERS[g]}`);
// The solver's clue labels: the row number or band letter, then a, b, …
const shortLabel = (group, g, j) => (group === 'rows' ? String(g + 1) : BAND_LETTERS[g]) + letterOf(j);
// Panel headings and orphan sources.
const entryName = (group, g, j) => `${groupName(group, g)} · ${letterOf(j)}`;

function groupOf(model, group, id) {
  const N = model.size;
  return group === 'rows' ? rowOf(N, id) : bandIndexOf(rowOf(N, id) + 1, colOf(N, id) + 1, N);
}

function entryOfCell(model, group, id) {
  const g = groupOf(model, group, id);
  return { g, j: entryAt(model[group][g].starts, pathIds(model, group, g).indexOf(id)) };
}

function entryIds(model, group, g, j) {
  const path = pathIds(model, group, g);
  const [s, e] = ranges(model[group][g].starts, path.length)[j];
  return path.slice(s, e);
}

// "columns 3–5" for a row entry; for a band entry the sides it runs along, in reading
// order.
function placeLabel(model, group, g, j) {
  const ids = entryIds(model, group, g, j);
  const N = model.size;
  if (group === 'rows') return `columns ${colOf(N, ids[0]) + 1}–${colOf(N, ids[ids.length - 1]) + 1}`;
  const n = N - 2 * g;
  const [s, e] = ranges(model.bands[g].starts, 4 * (n - 1))[j];
  const sides = [];
  for (let p = s; p < e; p++) {
    const side = p < n ? 'top' : p < 2 * n - 1 ? 'right' : p < 3 * n - 2 ? 'bottom' : 'left';
    if (sides[sides.length - 1] !== side) sides.push(side);
  }
  return sides.join(' → ');
}

// ── navigation helpers the editor uses (ids are 1-based) ────────────────────

// The next id along the group's path: a row stops at its ends (null), a band wraps.
function advance(model, group, id, step) {
  const g = groupOf(model, group, id);
  const path = pathIds(model, group, g);
  const at = path.indexOf(id) + step;
  if (group === 'rows') return at >= 0 && at < path.length ? path[at] : null;
  return path[(at + path.length) % path.length];
}

// The previous id along the group's path; null before its first cell (a band does not
// wrap backwards: Backspace there would erase the band's last cell).
function stepBack(model, group, id) {
  const path = pathIds(model, group, groupOf(model, group, id));
  const at = path.indexOf(id) - 1;
  return at >= 0 ? path[at] : null;
}

// One step on the grid, jumping over the center block; null at the edge.
function moveSpatial(model, id, dr, dc) {
  return arrowTarget(id, dr, dc, model.size);
}

// The first cell of the next (dir 1) or previous (-1) row or band, wrapping.
function stepGroup(model, group, id, dir) {
  const n = model[group].length;
  return pathIds(model, group, (groupOf(model, group, id) + dir + n) % n)[0];
}

// Why a row's or band's first entry can't be split off its start.
const FIRST_ENTRY_MESSAGE = {
  rows: 'A row’s first entry always starts in its first cell.',
  bands: 'A band’s first entry always starts at its top-left corner.',
};

// The break that makes an entry start before the caret's cell, or why it can't be one.
function breakAtCaret(model, group, id) {
  const g = groupOf(model, group, id);
  const i = pathIds(model, group, g).indexOf(id);
  if (i === 0) return { message: FIRST_ENTRY_MESSAGE[group] };
  return { command: ['toggleBreak', [group, g, i]] };
}

// ── the line field: a whole row or band as text, with | between entries ─────

function lineText(model, group, g) {
  return model[group][g].entries
    .map((_, j) => formatSequence(entryIds(model, group, g, j).map(id => model.cells[id - 1])))
    .join(' | ');
}

// → { cells, starts } for the row or band `g`, or { error } in words for the person
// typing.
function parseLine(model, group, g, text) {
  const want = pathIds(model, group, g).length;
  if (!text.trim()) return { error: `${groupName(group, g)} has ${want} cells, and this has 0.` };
  const parts = [];
  for (const raw of text.split('|')) {
    const r = parseSequence(raw);
    if (r.error) return { error: r.error };
    parts.push(r.cells);
  }
  if (parts.some(p => !p.length)) {
    return { error: 'Each | needs letters on both sides. Two in a row, or one at either end, would leave an empty entry.' };
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total !== want) return { error: `${groupName(group, g)} has ${want} cells, and this has ${total}.` };
  return { cells: parts.flat(), starts: cumulativeStarts(parts).starts };
}

// ── new, import, export ─────────────────────────────────────────────────────

function blankCuts(N, nextId) {
  let n = nextId;
  const cut = () => ({ starts: [0], entries: [newEntry(`e${n++}`)] });
  const rows = Array.from({ length: N }, cut);
  const bands = Array.from({ length: Math.floor(N / 2) }, cut);
  return { rows, bands, nextId: n };
}

function newModel({ size }) {
  const { rows, bands, nextId } = blankCuts(size, 1);
  return {
    kind, header: { title: '', extra: {} }, emitSize: true, size,
    cells: new Array(size * size).fill(''), rows, bands, circles: [], orphans: [], nextId,
  };
}

function fromYaml(puzzle) {
  if (puzzle.title !== undefined && typeof puzzle.title !== 'string') throw new StructureError('the title must be text (put numbers in quotes)');
  if (!Array.isArray(puzzle.rows) || !Array.isArray(puzzle.bands)) throw new StructureError('"rows" and "bands" must be lists');
  if (puzzle.rows.length === 0) throw new StructureError('the puzzle has no rows');
  const rowLists = puzzle.rows.map((row, r) => parseEntryCells(row && row.entries, `rows[${r}].entries`));
  const bandLists = puzzle.bands.map((band, k) => parseEntryCells(band && band.entries, `bands[${k}].entries`));
  const sum = (lists) => lists.reduce((n, cells) => n + cells.length, 0);
  const N = sum(rowLists[0]);
  if (N < 3) throw new StructureError(`the grid must be at least 3 × 3, but row 1 has ${N} cells`);
  if (puzzle.rows.length !== N) throw new StructureError(`row 1 has ${N} cells, so there should be ${N} rows, but there are ${puzzle.rows.length}`);
  if (puzzle.bands.length !== Math.floor(N / 2)) throw new StructureError(`a ${N} × ${N} grid has ${Math.floor(N / 2)} bands, but there are ${puzzle.bands.length}`);
  if (puzzle.size !== undefined && puzzle.size !== N) throw new StructureError(`size is ${puzzle.size}, but the rows make a ${N} × ${N} grid`);
  rowLists.forEach((lists, r) => {
    const want = N - (N % 2 === 1 && r === (N - 1) / 2 ? 1 : 0);
    if (sum(lists) !== want) throw new StructureError(`${groupName('rows', r)} has ${sum(lists)} cells, but should have ${want}`);
  });
  bandLists.forEach((lists, k) => {
    const want = 4 * (N - 1 - 2 * k);
    if (sum(lists) !== want) throw new StructureError(`${groupName('bands', k)} has ${sum(lists)} cells, but should have ${want}`);
  });
  const flat = (entryLists) => entryLists.flat();

  // Rows write the cells; a band that disagrees is reported, and the row's letter wins. A
  // band's bottom edge reads its row backward, so a rebus spelled backward there agrees.
  const cells = new Array(N * N).fill('');
  rowLists.forEach((entryCells, r) => {
    const all = flat(entryCells);
    rowCells(r, N).forEach((id, i) => { cells[id - 1] = all[i]; });
  });
  const rowStarts = rowLists.map(l => cumulativeStarts(l).starts);
  const bandStarts = bandLists.map(l => cumulativeStarts(l).starts);
  const warnings = [];
  const covering = (starts, g, pos) => entryAt(starts[g], pos);
  bandLists.forEach((entryCells, k) => {
    const all = flat(entryCells);
    bandCells(k, N).forEach((id, i) => {
      if (sameCell(all[i], cells[id - 1], onBandBottomEdge(k, id, N))) return;
      const r = rowOf(N, id), c = colOf(N, id);
      const jr = covering(rowStarts, r, rowCells(r, N).indexOf(id));
      warnings.push(`Cell (${r + 1}, ${c + 1}): kept "${formatCell(cells[id - 1])}" from ${entryName('rows', r, jr)}, discarded "${formatCell(all[i])}" from ${entryName('bands', k, covering(bandStarts, k, i))}`);
    });
  });

  let n = 1;
  const makeCuts = (group, yamlGroups, lists, starts) => yamlGroups.map((g, i) => ({
    starts: starts[i],
    entries: g.entries.map((e, j) => entryFromYaml(e, `e${n++}`, lists[i][j])),
  }));
  // Each entry against the cells it covers in the model, so a band entry that spells a
  // rebus backward keeps that spelling as its display answer.
  const bandModel = bandLists.map((lists, k) => {
    const path = bandCells(k, N).map(id => cells[id - 1]);
    return lists.map((l, j) => path.slice(bandStarts[k][j], bandStarts[k][j] + l.length));
  });
  const rows = makeCuts('rows', puzzle.rows, rowLists, rowStarts);
  const bands = makeCuts('bands', puzzle.bands, bandModel, bandStarts);
  const model0 = { size: N, rows, bands };

  // Circles: the union over every entry, as ids; each non-center cell is covered by one
  // row entry and one band entry, and any that didn't list it is reported.
  const listed = new Set();
  const circleIds = new Set();
  GROUPS.forEach(group => (puzzle[group] || []).forEach((cut, g) => cut.entries.forEach((e, j) => {
    const ids = entryIds(model0, group, g, j);
    for (const p of (e.styles && Array.isArray(e.styles.circle) ? e.styles.circle : [])) {
      if (!Number.isInteger(p) || p < 0 || p >= ids.length) continue;
      circleIds.add(ids[p]);
      listed.add(`${group}:${ids[p]}`);
    }
  })));
  const circles = [...circleIds].sort((a, b) => a - b);
  for (const id of circles) {
    for (const group of GROUPS) {
      if (listed.has(`${group}:${id}`)) continue;
      const { g, j } = entryOfCell(model0, group, id);
      warnings.push(`Completed the circle on cell (${rowOf(N, id) + 1}, ${colOf(N, id) + 1}) (added to ${entryName(group, g, j)})`);
    }
  }

  return {
    model: {
      kind, header: headerFromYaml(puzzle, ['rows', 'bands', 'size']), emitSize: puzzle.size !== undefined,
      size: N, cells, rows, bands, circles, orphans: [], nextId: n,
    },
    warnings,
  };
}

// Which of an entry's positions read their cell backward: a band's, along its bottom
// edge.
function readsBackward(model, group, g, ids) {
  return (i) => group === 'bands' && onBandBottomEdge(g, ids[i], model.size);
}

function toYaml(model) {
  const groupYaml = (group) => model[group].map((cut, g) => ({
    entries: cut.entries.map((entry, j) => {
      const ids = entryIds(model, group, g, j);
      return entryToYaml(entry, ids.map(id => model.cells[id - 1]), circledPositions(ids, model.circles), readsBackward(model, group, g, ids));
    }),
  }));
  return {
    kind, ...headerToYaml(model.header), ...(model.emitSize ? { size: model.size } : {}),
    rows: groupYaml('rows'), bands: groupYaml('bands'),
  };
}

// ── completeness (spec §6 layer 1) ──────────────────────────────────────────

const MAX_LISTED = 10;

function completeness(model) {
  const N = model.size;
  const out = [];
  const err = (message, target) => out.push({ level: 'error', message, target });
  if (!model.header.title.trim()) err('Give the puzzle a title.', { header: 'title' });
  const empty = [];
  model.cells.forEach((c, i) => { if (c === '' && !isCenter(N, i + 1)) empty.push(i + 1); });
  if (empty.length === 1) {
    err(`Cell (${rowOf(N, empty[0]) + 1}, ${colOf(N, empty[0]) + 1}) is empty.`, { cells: empty });
  } else if (empty.length) {
    const shown = empty.slice(0, MAX_LISTED).map(id => `(${rowOf(N, id) + 1}, ${colOf(N, id) + 1})`).join(', ');
    err(`Empty cells: ${shown}${empty.length > MAX_LISTED ? `, and ${empty.length - MAX_LISTED} more` : ''}.`, { cells: empty });
  }
  GROUPS.forEach(group => model[group].forEach((cut, g) => cut.entries.forEach((entry, j) => {
    if (!entry.clue.trim()) err(`${entryName(group, g, j)} has no clue.`, { group, g, entry: j });
  })));
  for (const o of model.orphans) err(`Unattached clue "${o.clue}" (from ${o.from}). Attach or discard it.`, { orphan: o.id });
  return out;
}

// ── resizing ────────────────────────────────────────────────────────────────

// Keeps the top-left letters and the row splits that still fit. Every band's path changes
// with N, so each band goes back to one entry (its first); the rest become orphans.
function resized(model, N2) {
  const N1 = model.size;
  let nextId = model.nextId;
  const orphans = [];
  const orphan = (entry, label) => { const o = orphanOf(entry, label); if (o) orphans.push(o); };
  const onBoard = (r, c) => r < N2 && c < N2 && !isCenter(N2, r * N2 + c + 1);

  const cells = new Array(N2 * N2).fill('');
  for (let r = 0; r < Math.min(N1, N2); r++) {
    for (let c = 0; c < Math.min(N1, N2); c++) {
      if (onBoard(r, c)) cells[r * N2 + c] = model.cells[r * N1 + c];
    }
  }

  const rows = [];
  for (let r = 0; r < N2; r++) {
    if (r >= N1) { rows.push({ starts: [0], entries: [newEntry(`e${nextId++}`)] }); continue; }
    const cut = model.rows[r];
    const oldIds = rowCells(r, N1);
    const newIds = rowCells(r, N2);
    const starts = [0];
    const entries = [cut.entries[0]];
    for (let j = 1; j < cut.starts.length; j++) {
      const col = colOf(N1, oldIds[cut.starts[j]]);                    // by column: the center moves with N
      const p = onBoard(r, col) ? newIds.indexOf(r * N2 + col + 1) : -1;
      if (p > starts[starts.length - 1]) { starts.push(p); entries.push(cut.entries[j]); }
      else orphan(cut.entries[j], entryName('rows', r, j));
    }
    rows.push({ starts, entries });
  }
  for (let r = N2; r < N1; r++) model.rows[r].entries.forEach((e, j) => orphan(e, entryName('rows', r, j)));

  const bands = [];
  const nBands = Math.floor(N2 / 2);
  for (let k = 0; k < nBands; k++) {
    if (k >= model.bands.length) { bands.push({ starts: [0], entries: [newEntry(`e${nextId++}`)] }); continue; }
    model.bands[k].entries.forEach((e, j) => { if (j > 0) orphan(e, entryName('bands', k, j)); });
    bands.push({ starts: [0], entries: [model.bands[k].entries[0]] });
  }
  for (let k = nBands; k < model.bands.length; k++) model.bands[k].entries.forEach((e, j) => orphan(e, entryName('bands', k, j)));

  const circles = [];
  for (const id of model.circles) {
    const r = rowOf(N1, id), c = colOf(N1, id);
    if (onBoard(r, c)) circles.push(r * N2 + c + 1);
  }
  return {
    ...model, size: N2, cells, rows, bands, circles: circles.sort((a, b) => a - b),
    orphans: [...model.orphans, ...orphans], nextId,
  };
}

// How many clues resize(N2) would move to Unattached clues, counted from its result.
function resizeLosses(model, N2) {
  const lost = resized(model, N2).orphans.slice(model.orphans.length);
  const rowClues = lost.filter(o => o.from.startsWith('Row')).length;
  return { rowClues, bandClues: lost.length - rowClues };
}

// ── commands ────────────────────────────────────────────────────────────────

const withCut = (model, group, g, cut) => ({ ...model, [group]: model[group].map((c, k) => (k === g ? cut : c)) });
const withEntry = (model, group, g, j, patch) => {
  const cut = model[group][g];
  return withCut(model, group, g, { ...cut, entries: cut.entries.map((e, k) => (k === j ? patch(e) : e)) });
};
const hasEntry = (model, group, g, j) => !!(model[group] && model[group][g] && model[group][g].entries[j]);

const commands = {
  setCell(model, id, content) {
    if (!(id >= 1 && id <= model.cells.length) || isCenter(model.size, id)) return model;
    const value = sanitizeCell(content);
    if (model.cells[id - 1] === value) return model;
    const cells = model.cells.slice();
    cells[id - 1] = value;
    return { ...model, cells };
  },

  // `i` indexes the row's or band's path; 0 is the fixed start of the first entry.
  toggleBreak(model, group, g, i) {
    const cut = model[group] && model[group][g];
    if (!cut || !(i > 0 && i < pathIds(model, group, g).length)) return model;
    if (cut.starts.includes(i)) {
      const r = removeBreak(cut, i, entryName(group, g, cut.starts.indexOf(i)));
      const next = withCut(model, group, g, r.cut);
      return { ...next, orphans: r.orphan ? [...model.orphans, r.orphan] : model.orphans };
    }
    return { ...withCut(model, group, g, addBreak(cut, i, newEntry(`e${model.nextId}`))), nextId: model.nextId + 1 };
  },

  // Rewrites one row or band from the line field: the cells go along its path (so the
  // crossing cut sees them), an entry whose start is still a start keeps its clue, the
  // rest are orphaned.
  setLine(model, group, g, newCells, starts) {
    if (!model[group] || !model[group][g]) return model;
    const path = pathIds(model, group, g);
    const sound = Array.isArray(newCells) && newCells.length === path.length && Array.isArray(starts) && starts[0] === 0
      && starts.every((s, i) => Number.isInteger(s) && s < path.length && (i === 0 || s > starts[i - 1]));
    if (!sound) return model;
    const cells = model.cells.slice();
    path.forEach((id, p) => { cells[id - 1] = newCells[p]; });
    const cut = model[group][g];
    const byStart = new Map(cut.starts.map((s, j) => [s, cut.entries[j]]));
    const orphans = [];
    cut.entries.forEach((e, j) => {
      if (!starts.includes(cut.starts[j])) { const o = orphanOf(e, entryName(group, g, j)); if (o) orphans.push(o); }
    });
    let nextId = model.nextId;
    const entries = starts.map(s => byStart.get(s) || newEntry(`e${nextId++}`));
    return { ...withCut(model, group, g, { starts, entries }), cells, nextId, orphans: [...model.orphans, ...orphans] };
  },

  // A size the editor can draw: a whole number within the size field's range, and not the
  // size it already is.
  resize: (model, N2) => (Number.isInteger(N2) && N2 >= sizeFields[0].min && N2 <= sizeFields[0].max && N2 !== model.size ? resized(model, N2) : model),

  setClue: (model, group, g, j, text) => (hasEntry(model, group, g, j) ? withEntry(model, group, g, j, e => ({ ...e, clue: text })) : model),

  setDisplayAnswer: (model, group, g, j, text) => (hasEntry(model, group, g, j) ? withEntry(model, group, g, j, e => displayPatch(e, text)) : model),

  toggleCircle(model, id) {
    if (!(id >= 1 && id <= model.cells.length) || isCenter(model.size, id)) return model;
    return { ...model, circles: toggleSorted(model.circles, id) };
  },

  setHeader: (model, field, value) => ({ ...model, header: setHeaderField(model.header, field, value) }),

  attachOrphan(model, orphanId, group, g, j) {
    if (!hasEntry(model, group, g, j)) return model;           // the entry went away since it was picked
    const taken = takeOrphan(model, orphanId, model[group][g].entries[j], entryName(group, g, j));
    if (!taken) return model;
    return { ...withEntry(model, group, g, j, e => ({ ...e, clue: taken.clue })), orphans: taken.orphans, nextId: taken.nextId };
  },

  discardOrphan: (model, orphanId) => ({ ...model, orphans: model.orphans.filter(o => o.id !== orphanId) }),
};

// Enough shape that the editor can open a model (a draft, say) without crashing.
function isModel(m) {
  if (!isModelBase(m, kind) || !Number.isInteger(m.size) || m.size < 3 || typeof m.emitSize !== 'boolean') return false;
  const N = m.size;
  const center = N % 2 ? centerN(N) : 0;
  return isCells(m.cells) && m.cells.length === N * N && (center === 0 || m.cells[center - 1] === '')
    && isCircles(m.circles, N * N + 1) && m.circles.every(id => id >= 1 && id !== center)   // ids are 1-based
    && Array.isArray(m.rows) && m.rows.length === N && m.rows.every((c, r) => isCut(c, rowCells(r, N).length))
    && Array.isArray(m.bands) && m.bands.length === Math.floor(N / 2) && m.bands.every((c, k) => isCut(c, bandCells(k, N).length));
}

module.exports = {
  kind, sizeFields, isModel, newModel, fromYaml, toYaml, completeness, commands,
  pathIds, isCenter, rowOf, colOf, groupOf, shortLabel, entryName, groupName, entryOfCell, entryIds, placeLabel, readsBackward,
  advance, stepBack, moveSpatial, stepGroup, breakAtCaret, FIRST_ENTRY_MESSAGE, resizeLosses, lineText, parseLine,
};
