'use strict';
// The Snake Charmer kind module (the contract is at the top of the Phase 2 plan).
//
// The snake is ONE ring of N cells traversed twice, with a SINGLE list of entry starts
// over the two laps (positions 0..2N-1, starts[0] === 0): every Snake Charmer puzzle in
// the repo has an entry that crosses the lap boundary, so this is never two lists that
// each sum to N (spec §4.1). Ring cell of position p is p % N; the same cell on the other
// lap is twin(p) = (p + N) % 2N.
//
// Model:
//   { kind: 'snake-charmer', header, shape: string|null, loops: number|null,
//     ring: string[], cut: { starts, entries }, circles: number[] /* ring indices */,
//     orphans: [], nextId }
const { findCoincidentStarts } = require('../../../../snake-charmer/src/validator');
const { SHAPE_NAMES } = require('../../../../snake-charmer/src/layout');
const { StructureError } = require('../errors');
const { formatCell, diffCells } = require('../cells');
const { ranges, entryAt, addBreak, removeBreak, reanchor } = require('../starts');
const { newEntry, entryFromYaml, entryToYaml, circledPositions } = require('../entries');
const { headerFromYaml, headerToYaml, setHeaderField } = require('../header');
const { runsLabel, sanitizeCell, toggleSorted, remapCircles, cumulativeStarts, parseEntryCells, takeOrphan, displayPatch, isCut, isCells, isCircles, isModelBase } = require('../kindCommon');

const kind = 'snake-charmer';
const sizeFields = [{ name: 'cells', label: 'Cells per lap', min: 8, max: 120, step: 2, default: 48 }];

// ── helpers ─────────────────────────────────────────────────────────────────

const ringSize = (model) => model.ring.length;
const total = (model) => 2 * ringSize(model);
const lapOf = (model, p) => (p < ringSize(model) ? 1 : 2);

// The same ring cell on the other lap.
function twin(model, p) {
  return (p + ringSize(model)) % total(model);
}

function entryRange(model, j) {
  return ranges(model.cut.starts, total(model))[j];
}

// Entry j's positions [s, e) over 2N.
function positionsOf(model, j) {
  const [s, e] = entryRange(model, j);
  const out = [];
  for (let p = s; p < e; p++) out.push(p);
  return out;
}

function entryAtPosition(model, p) {
  return entryAt(model.cut.starts, p);
}

// 'ring cells 45–3': 1-based ring numbers of the first and last cell, wrapping.
function ringLabel(model, j) {
  const N = ringSize(model);
  const [s, e] = entryRange(model, j);
  const a = (s % N) + 1;
  const b = ((e - 1) % N) + 1;
  return e - s === 1 ? `ring cell ${a}` : `ring cells ${a}–${b}`;
}

// 'lap 1', 'lap 2', 'laps 1–2', or 'both laps' for an entry longer than the ring.
function lapsLabel(model, j) {
  const [s, e] = entryRange(model, j);
  if (e - s > ringSize(model)) return 'both laps';
  const a = lapOf(model, s);
  return a === lapOf(model, e - 1) ? `lap ${a}` : 'laps 1–2';
}

// Ring cells where more than one entry starts (the validator warns about these). One home
// for the rule: the validator's own findCoincidentStarts.
function coincidentStarts(model) {
  const lengths = ranges(model.cut.starts, total(model)).map(([s, e]) => e - s);
  return findCoincidentStarts(lengths, 2);
}

// One step through positions 0..2N-1, wrapping at both ends.
function stepPosition(model, p, step) {
  const T = total(model);
  return (((p + step) % T) + T) % T;
}

// Tab (direction 1) / Shift+Tab (-1): the position where the next or previous entry
// starts.
function entryStartPosition(model, p, direction) {
  const { starts } = model.cut;
  if (direction > 0) return starts.find(s => s > p) ?? starts[0];
  return [...starts].reverse().find(s => s < p) ?? starts[starts.length - 1];
}

// The break that starts an entry at the caret's position, or why it can't.
function breakAtCaret(model, p) {
  if (p <= 0) return { message: 'Entry 1 always starts at the first cell of lap 1.' };
  return { index: p };
}

// ── new, import, export ─────────────────────────────────────────────────────

function newModel({ cells, shape = null }) {
  return {
    kind,
    header: { title: '', extra: {} },
    shape,
    loops: null,
    ring: new Array(cells).fill(''),
    cut: { starts: [0], entries: [newEntry('e1')] },
    circles: [],
    orphans: [],
    nextId: 2,
  };
}

function fromYaml(puzzle) {
  if (puzzle.title !== undefined && typeof puzzle.title !== 'string') throw new StructureError('the title must be text (put numbers in quotes)');
  if (puzzle.loops !== undefined && puzzle.loops !== 2) throw new StructureError('only two-loop puzzles are supported');
  if (puzzle.shape !== undefined && !SHAPE_NAMES.includes(puzzle.shape)) {
    throw new StructureError(`unknown shape ${JSON.stringify(puzzle.shape)}; expected one of: ${SHAPE_NAMES.join(', ')}`);
  }
  const lists = parseEntryCells(puzzle.entries, 'entries');
  const all = lists.flat();
  if (all.length === 0) throw new StructureError('the puzzle has no cells');
  if (all.length % 2) {
    throw new StructureError(`the entries cover an odd number of cells (${all.length}); two loops need an even total`);
  }
  const N = all.length / 2;
  const ring = all.slice(0, N);

  const { starts } = cumulativeStarts(lists);

  const warnings = [];
  for (let k = 0; k < N; k++) {                      // lap 1 wins a conflict
    if (all[N + k] !== ring[k]) {
      warnings.push(`Ring cell ${k + 1}: kept "${formatCell(ring[k])}" from entry ${entryAt(starts, k) + 1} (lap 1), discarded "${formatCell(all[N + k])}" from entry ${entryAt(starts, N + k) + 1} (lap 2)`);
    }
  }

  // Circles: the union over every circled position, as ring cells; each ring cell is
  // covered at positions k and N + k, and any covering entry that didn't list it is
  // reported.
  const listed = new Set();                          // global positions the YAML circled
  puzzle.entries.forEach((e, j) => {
    for (const p of (e.styles && Array.isArray(e.styles.circle) ? e.styles.circle : [])) {
      if (Number.isInteger(p) && p >= 0 && p < lists[j].length) listed.add(starts[j] + p);
    }
  });
  const circles = [...new Set([...listed].map(q => q % N))].sort((a, b) => a - b);
  for (const k of circles) {
    for (const q of [k, N + k]) {
      if (!listed.has(q)) warnings.push(`Completed the circle on ring cell ${k + 1} (added to entry ${entryAt(starts, q) + 1})`);
    }
  }

  const model = {
    kind,
    header: headerFromYaml(puzzle, ['entries', 'loops', 'shape']),
    shape: puzzle.shape ?? null,
    loops: puzzle.loops ?? null,
    ring,
    cut: { starts, entries: puzzle.entries.map((e, j) => entryFromYaml(e, `e${j + 1}`, lists[j])) },
    circles,
    orphans: [],
    nextId: puzzle.entries.length + 1,
  };
  return { model, warnings };
}

function toYaml(model) {
  const N = ringSize(model);
  const entries = model.cut.entries.map((entry, j) => {
    const positions = positionsOf(model, j);
    return entryToYaml(entry, positions.map(p => model.ring[p % N]), circledPositions(positions.map(p => p % N), model.circles));
  });
  return {
    kind,
    ...headerToYaml(model.header),
    ...(model.loops !== null ? { loops: model.loops } : {}),
    ...(model.shape ? { shape: model.shape } : {}),
    entries,
  };
}

// ── completeness (spec §6 layer 1) ──────────────────────────────────────────

function completeness(model) {
  const out = [];
  const err = (message, target) => out.push({ level: 'error', message, target });
  if (!model.header.title.trim()) err('Give the puzzle a title.', { header: 'title' });
  const empty = [];
  model.ring.forEach((c, k) => { if (c === '') empty.push(k); });
  if (empty.length) {
    err(empty.length === 1 ? `Ring cell ${empty[0] + 1} is empty.` : `Ring cells ${runsLabel(empty)} are empty.`, { cells: empty });
  }
  model.cut.entries.forEach((entry, j) => {
    if (!entry.clue.trim()) err(`Entry ${j + 1} (${ringLabel(model, j)}) has no clue.`, { entry: j });
  });
  for (const o of model.orphans) err(`Unattached clue "${o.clue}" (from ${o.from}). Attach or discard it.`, { orphan: o.id });
  return out;
}

// ── commands ────────────────────────────────────────────────────────────────

// Applies a known ring edit {start, removed, inserted} (in ring coordinates) to both
// laps: lap 2 first (it sits higher up, so lap 1's coordinates stay valid), then lap 1.
function applyRingEdit(model, newRing, d) {
  const N = ringSize(model);
  const original = new Map(model.cut.entries.map((e, i) => [e.id, i]));
  const labeler = (cut) => (j) => `entry ${original.get(cut.entries[j].id) + 1}`;
  const lap2 = reanchor(model.cut,
    { start: N + d.start, removed: d.removed, inserted: d.inserted },
    2 * N - d.removed + d.inserted, labeler(model.cut));
  const lap1 = reanchor(lap2.cut,
    { start: d.start, removed: d.removed, inserted: d.inserted },
    2 * newRing.length, labeler(lap2.cut));
  return {
    ...model,
    ring: newRing,
    cut: lap1.cut,
    circles: remapCircles(model.circles, d, newRing.length),
    orphans: [...model.orphans, ...lap2.orphans, ...lap1.orphans],
  };
}

function setRing(model, newRing) {
  if (!newRing.length) return model;                  // a puzzle never has no cells
  const d = diffCells(model.ring, newRing);
  if (d.removed === 0 && d.inserted === 0) return model;
  return applyRingEdit(model, newRing, d);
}

const withEntry = (model, j, patch) => ({
  ...model,
  cut: { ...model.cut, entries: model.cut.entries.map((e, k) => (k === j ? patch(e) : e)) },
});

const hasEntry = (model, j) => !!model.cut.entries[j];

const commands = {
  setCell(model, k, content) {
    if (!(k >= 0 && k < ringSize(model))) return model;
    const value = sanitizeCell(content);
    if (model.ring[k] === value) return model;
    const ring = model.ring.slice();
    ring[k] = value;
    return { ...model, ring };
  },

  setRing,

  // These know where the edit is, so they don't diff the letters.
  insertCell(model, k) {
    const at = Math.max(0, Math.min(k, ringSize(model)));
    const ring = model.ring.slice();
    ring.splice(at, 0, '');
    return applyRingEdit(model, ring, { start: at, removed: 0, inserted: 1 });
  },

  deleteCell(model, k) {
    if (!(k >= 0 && k < ringSize(model)) || ringSize(model) <= 1) return model;
    return applyRingEdit(model, model.ring.filter((_, i) => i !== k), { start: k, removed: 1, inserted: 0 });
  },

  // `p` is a position over the single cut, in [1, 2N).
  toggleBreak(model, p) {
    if (!(p > 0 && p < total(model))) return model;
    const { cut } = model;
    if (cut.starts.includes(p)) {
      const r = removeBreak(cut, p, `entry ${cut.starts.indexOf(p) + 1}`);
      return { ...model, cut: r.cut, orphans: r.orphan ? [...model.orphans, r.orphan] : model.orphans };
    }
    return { ...model, cut: addBreak(cut, p, newEntry(`e${model.nextId}`)), nextId: model.nextId + 1 };
  },

  setClue: (model, j, text) => (hasEntry(model, j) ? withEntry(model, j, e => ({ ...e, clue: text })) : model),

  setDisplayAnswer: (model, j, text) => (hasEntry(model, j) ? withEntry(model, j, e => displayPatch(e, text)) : model),

  toggleCircle(model, k) {
    if (!(k >= 0 && k < ringSize(model))) return model;
    return { ...model, circles: toggleSorted(model.circles, k) };
  },

  setShape: (model, shape) => ({ ...model, shape: shape || null }),

  setHeader: (model, field, value) => ({ ...model, header: setHeaderField(model.header, field, value) }),

  attachOrphan(model, orphanId, j) {
    if (!hasEntry(model, j)) return model;   // the entry went away since it was picked
    const taken = takeOrphan(model, orphanId, model.cut.entries[j], `entry ${j + 1}`);
    if (!taken) return model;
    return { ...withEntry(model, j, e => ({ ...e, clue: taken.clue })), orphans: taken.orphans, nextId: taken.nextId };
  },

  discardOrphan: (model, orphanId) => ({ ...model, orphans: model.orphans.filter(o => o.id !== orphanId) }),
};

// Enough shape that the editor can open a model (a draft, say) without crashing.
function isModel(m) {
  return isModelBase(m, kind)
    && isCells(m.ring) && m.ring.length > 0 && isCircles(m.circles, m.ring.length)
    && isCut(m.cut, 2 * m.ring.length)
    && (m.shape === null || SHAPE_NAMES.includes(m.shape)) && (m.loops === null || m.loops === 2);
}

module.exports = {
  kind, sizeFields, isModel, newModel, fromYaml, toYaml, completeness, commands,
  twin, positionsOf, ringLabel, lapsLabel, lapOf, entryAtPosition, coincidentStarts,
  stepPosition, entryStartPosition, breakAtCaret,
};
