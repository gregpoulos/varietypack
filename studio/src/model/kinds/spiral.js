'use strict';
// The Spiral kind module: the reference implementation of the kind-module contract
// (.superpowers/plans/2026-10-05-studio/phase-2-spiral-editor.md, "The kind-module
// contract"). Pure and CommonJS.
//
// Model:
//   { kind: 'spiral', header, cells: string[],          // inward order: index 0 is cell 1 (outermost)
//     cuts: { inward: Cut, outward: Cut },               // outward starts index the REVERSED sequence
//     circles: number[],                                 // inward indices, ascending
//     orphans: [], nextId }
// An outward entry [s, e) covers cell indices T-1-s down to T-e.
const { StructureError } = require('../errors');
const { sameCell } = require('../../../../shared/build/validateEntry');
const { formatCell, diffCells } = require('../cells');
const { ranges, entryAt, addBreak, removeBreak, reanchor } = require('../starts');
const { newEntry, entryFromYaml, entryToYaml, circledPositions } = require('../entries');
const { headerFromYaml, headerToYaml, setHeaderField } = require('../header');
const { runsLabel, sanitizeCell, toggleSorted, remapCircles, cumulativeStarts, parseEntryCells, takeOrphan, displayPatch, isCut, isCells, isCircles, isModelBase } = require('../kindCommon');

const kind = 'spiral';
const sizeFields = [{ name: 'cells', label: 'Cells', min: 40, max: 200, default: 78 }];
const CUTS = ['inward', 'outward'];

// ── helpers ─────────────────────────────────────────────────────────────────

const total = (model) => model.cells.length;

// The cell indices an entry covers, in its reading order.
function cutIndices(model, cutName, j) {
  const T = total(model);
  const [s, e] = ranges(model.cuts[cutName].starts, T)[j];
  const out = [];
  if (cutName === 'inward') for (let i = s; i < e; i++) out.push(i);
  else for (let k = s; k < e; k++) out.push(T - 1 - k);
  return out;
}

// Gap g sits between cells g-1 and g (1 <= g < T), expressed in a cut's own coordinates.
function gapToCutIndex(model, cutName, gap) {
  return cutName === 'inward' ? gap : total(model) - gap;
}

function entryLabel(cutName, j) {
  return `${cutName} ${j + 1}`;
}

// Which entry of a cut covers a cell.
function entryAtCell(model, cutName, i) {
  const k = cutName === 'inward' ? i : total(model) - 1 - i;      // reading position
  return entryAt(model.cuts[cutName].starts, k);
}

// The first cell of an entry in its reading order.
function entryFirstCell(model, cutName, j) {
  return cutIndices(model, cutName, j)[0];
}

// One step along a cut's reading order (inward ascends, outward descends); stops at the
// ends.
function stepRead(model, cutName, caret, step) {
  const delta = cutName === 'inward' ? step : -step;
  return Math.min(Math.max(caret + delta, 0), total(model) - 1);
}

// Tab (direction 1) or Shift+Tab (-1): the cell where the next or previous entry of the
// cut starts, wrapping around.
function entryStart(model, cutName, caret, direction) {
  const T = total(model);
  const { starts } = model.cuts[cutName];
  const r = cutName === 'inward' ? caret : T - 1 - caret;       // reading position
  let target;
  if (direction > 0) target = starts.find(s => s > r) ?? starts[0];
  else target = [...starts].reverse().find(s => s < r) ?? starts[starts.length - 1];
  return cutName === 'inward' ? target : T - 1 - target;
}

// The break that makes an entry of the cut start at the caret's cell: { index } in the
// cut's own coordinates, or { message } when the cell always starts an entry.
function breakAtCaret(model, cutName, caret) {
  const T = total(model);
  const gap = cutName === 'inward' ? caret : caret + 1;          // outward reads toward cell 1
  if (gap >= 1 && gap < T) return { index: gapToCutIndex(model, cutName, gap) };
  return { message: cutName === 'inward' ? 'Cell 1 always starts an inward entry.' : `Cell ${T} always starts an outward entry.` };
}

// ── new, import, export ─────────────────────────────────────────────────────

function newModel({ cells }) {
  return {
    kind,
    header: { title: '', extra: {} },
    cells: new Array(cells).fill(''),
    cuts: {
      inward: { starts: [0], entries: [newEntry('e1')] },
      outward: { starts: [0], entries: [newEntry('e2')] },
    },
    circles: [],
    orphans: [],
    nextId: 3,
  };
}

function fromYaml(puzzle) {
  if (puzzle.title !== undefined && typeof puzzle.title !== 'string') throw new StructureError('the title must be text (put numbers in quotes)');
  const inLists = parseEntryCells(puzzle.inward, 'inward');
  const outLists = parseEntryCells(puzzle.outward, 'outward');
  const inward = cumulativeStarts(inLists);
  const outward = cumulativeStarts(outLists);
  if (inward.total !== outward.total) {
    throw new StructureError(`inward and outward cover different numbers of cells (${inward.total} vs ${outward.total})`);
  }
  const T = inward.total;
  if (T === 0) throw new StructureError('the puzzle has no cells');
  const cells = inLists.flat();
  const outReading = outLists.flat();      // reading order: reading position k is cell T-1-k
  const warnings = [];

  // Inward letters win a conflict (spec §4.3). Outward reads each cell backward, so a
  // rebus it spells backward is no conflict.
  for (let i = 0; i < T; i++) {
    const theirs = outReading[T - 1 - i];
    if (!sameCell(theirs, cells[i], true)) {
      const a = entryAt(inward.starts, i) + 1;
      const b = entryAt(outward.starts, T - 1 - i) + 1;
      warnings.push(`Cell ${i + 1}: kept "${formatCell(cells[i])}" from inward ${a}, discarded "${formatCell(theirs)}" from outward ${b}`);
    }
  }

  // Each entry against the cells it covers in the model, so an outward entry that spells
  // a rebus backward keeps that spelling as its display answer.
  const outCells = [...cells].reverse();
  const outModel = outLists.map((l, j) => outCells.slice(outward.starts[j], outward.starts[j] + l.length));
  const cuts = {
    inward: { starts: inward.starts, entries: puzzle.inward.map((e, j) => entryFromYaml(e, `e${j + 1}`, inLists[j])) },
    outward: { starts: outward.starts, entries: puzzle.outward.map((e, j) => entryFromYaml(e, `e${puzzle.inward.length + j + 1}`, outModel[j])) },
  };

  // Circles: the union over every entry, as inward indices; completing the ones a
  // covering entry didn't list is reported.
  const listed = { inward: new Set(), outward: new Set() };   // `${j}:${p}` that the YAML listed
  const circleSet = new Set();
  const model0 = { cells, cuts };
  CUTS.forEach(cutName => {
    (puzzle[cutName] || []).forEach((e, j) => {
      const idx = cutIndices(model0, cutName, j);
      for (const p of (e.styles && Array.isArray(e.styles.circle) ? e.styles.circle : [])) {
        if (!Number.isInteger(p) || p < 0 || p >= idx.length) continue;
        circleSet.add(idx[p]);
        listed[cutName].add(`${j}:${p}`);
      }
    });
  });
  const circles = [...circleSet].sort((a, b) => a - b);
  for (const i of circles) {
    for (const cutName of CUTS) {
      const j = entryAt(cuts[cutName].starts, cutName === 'inward' ? i : T - 1 - i);
      const p = cutIndices(model0, cutName, j).indexOf(i);
      if (!listed[cutName].has(`${j}:${p}`)) {
        warnings.push(`Completed the circle on cell ${i + 1} (added to ${entryLabel(cutName, j)})`);
      }
    }
  }

  const model = {
    kind,
    header: headerFromYaml(puzzle, ['inward', 'outward']),
    cells,
    cuts,
    circles,
    orphans: [],
    nextId: puzzle.inward.length + puzzle.outward.length + 1,
  };
  return { model, warnings };
}

// Which of a cut's entry positions read their cell backward: all of outward's.
function readsBackward(cutName) {
  return () => cutName === 'outward';
}

function toYaml(model) {
  const entriesFor = (cutName) => model.cuts[cutName].entries.map((entry, j) => {
    const idx = cutIndices(model, cutName, j);
    return entryToYaml(entry, idx.map(i => model.cells[i]), circledPositions(idx, model.circles), readsBackward(cutName));
  });
  return { kind, ...headerToYaml(model.header), inward: entriesFor('inward'), outward: entriesFor('outward') };
}

// ── completeness (spec §6 layer 1) ──────────────────────────────────────────

const capital = (s) => s[0].toUpperCase() + s.slice(1);

function completeness(model) {
  const out = [];
  const err = (message, target) => out.push({ level: 'error', message, target });
  if (!model.header.title.trim()) err('Give the puzzle a title.', { header: 'title' });
  const empty = [];
  model.cells.forEach((c, i) => { if (c === '') empty.push(i); });
  if (empty.length) {
    err(empty.length === 1 ? `Cell ${empty[0] + 1} is empty.` : `Cells ${runsLabel(empty)} are empty.`, { cells: empty });
  }
  for (const cutName of CUTS) {
    model.cuts[cutName].entries.forEach((entry, j) => {
      if (entry.clue.trim()) return;
      const nums = cutIndices(model, cutName, j).map(i => i + 1);
      const lo = Math.min(...nums), hi = Math.max(...nums);
      err(`${capital(entryLabel(cutName, j))} (${lo === hi ? `cell ${lo}` : `cells ${lo}–${hi}`}) has no clue.`, { cut: cutName, entry: j });
    });
  }
  for (const o of model.orphans) {
    err(`Unattached clue "${o.clue}" (from ${o.from}). Attach or discard it.`, { orphan: o.id });
  }
  return out;
}

// ── commands ────────────────────────────────────────────────────────────────

const withEntry = (model, cutName, j, patch) => {
  const cut = model.cuts[cutName];
  return {
    ...model,
    cuts: { ...model.cuts, [cutName]: { ...cut, entries: cut.entries.map((e, k) => (k === j ? patch(e) : e)) } },
  };
};

const hasEntry = (model, cutName, j) => !!(model.cuts[cutName] && model.cuts[cutName].entries[j]);

// Applies a known edit {start, removed, inserted} (in inward coordinates) that turns
// model.cells into newCells: moves both cuts' breaks and the circles with it.
function applyEdit(model, newCells, d) {
  const T = total(model);
  const newTotal = newCells.length;
  const outEdit = { start: T - (d.start + d.removed), removed: d.removed, inserted: d.inserted };
  const inward = reanchor(model.cuts.inward, d, newTotal, j => entryLabel('inward', j));
  const outward = reanchor(model.cuts.outward, outEdit, newTotal, j => entryLabel('outward', j));
  return {
    ...model,
    cells: newCells,
    cuts: { inward: inward.cut, outward: outward.cut },
    circles: remapCircles(model.circles, d, newTotal),
    orphans: [...model.orphans, ...inward.orphans, ...outward.orphans],
  };
}

// The edit is recovered by diffing the cells (prefix/suffix). A puzzle never has no
// cells.
function setSequence(model, newCells) {
  if (!newCells.length) return model;
  const d = diffCells(model.cells, newCells);
  if (d.removed === 0 && d.inserted === 0) return model;
  return applyEdit(model, newCells, d);
}

const commands = {
  setCell(model, i, content) {
    if (!(i >= 0 && i < total(model))) return model;
    const value = sanitizeCell(content);
    if (model.cells[i] === value) return model;
    const cells = model.cells.slice();
    cells[i] = value;
    return { ...model, cells };
  },

  setSequence,

  // These know where the edit is, so they don't diff the letters (which can't tell which
  // of two equal neighbors was inserted or removed).
  insertCell(model, i) {
    const at = Math.max(0, Math.min(i, total(model)));
    const cells = model.cells.slice();
    cells.splice(at, 0, '');
    return applyEdit(model, cells, { start: at, removed: 0, inserted: 1 });
  },

  deleteCell(model, i) {
    if (!(i >= 0 && i < total(model)) || total(model) <= 1) return model;
    return applyEdit(model, model.cells.filter((_, k) => k !== i), { start: i, removed: 1, inserted: 0 });
  },

  // `index` is in the cut's own coordinates (see gapToCutIndex).
  toggleBreak(model, cutName, index) {
    if (!(index > 0 && index < total(model))) return model;
    const cut = model.cuts[cutName];
    if (cut.starts.includes(index)) {
      const j = cut.starts.indexOf(index);
      const r = removeBreak(cut, index, entryLabel(cutName, j));
      return {
        ...model,
        cuts: { ...model.cuts, [cutName]: r.cut },
        orphans: r.orphan ? [...model.orphans, r.orphan] : model.orphans,
      };
    }
    return {
      ...model,
      cuts: { ...model.cuts, [cutName]: addBreak(cut, index, newEntry(`e${model.nextId}`)) },
      nextId: model.nextId + 1,
    };
  },

  setClue: (model, cutName, j, text) => (hasEntry(model, cutName, j) ? withEntry(model, cutName, j, e => ({ ...e, clue: text })) : model),

  setDisplayAnswer: (model, cutName, j, text) => (hasEntry(model, cutName, j) ? withEntry(model, cutName, j, e => displayPatch(e, text)) : model),

  toggleCircle(model, i) {
    if (!(i >= 0 && i < total(model))) return model;
    return { ...model, circles: toggleSorted(model.circles, i) };
  },

  setHeader: (model, field, value) => ({ ...model, header: setHeaderField(model.header, field, value) }),

  attachOrphan(model, orphanId, cutName, j) {
    if (!hasEntry(model, cutName, j)) return model;   // the entry went away since it was picked
    const taken = takeOrphan(model, orphanId, model.cuts[cutName].entries[j], entryLabel(cutName, j));
    if (!taken) return model;
    return { ...withEntry(model, cutName, j, e => ({ ...e, clue: taken.clue })), orphans: taken.orphans, nextId: taken.nextId };
  },

  discardOrphan: (model, orphanId) => ({ ...model, orphans: model.orphans.filter(o => o.id !== orphanId) }),
};

// Enough shape that the editor can open a model (a draft, say) without crashing.
function isModel(m) {
  return isModelBase(m, kind)
    && isCells(m.cells) && m.cells.length > 0 && isCircles(m.circles, m.cells.length)
    && !!m.cuts && isCut(m.cuts.inward, m.cells.length) && isCut(m.cuts.outward, m.cells.length);
}

module.exports = {
  kind, sizeFields, isModel, newModel, fromYaml, toYaml, completeness, commands,
  cutIndices, gapToCutIndex, entryLabel, readsBackward,
  entryAtCell, entryFirstCell, stepRead, entryStart, breakAtCaret,
};
