'use strict';
// The Crushword kind module (the contract is at the top of the Phase 2 plan).
//
// A rows × cols grid of cells and blocks; every slot (a run of two or more open cells,
// across or down) is an entry. Numbers are derived (`deriveSlots`) and shift whenever a
// block moves, so a clue belongs to its slot's direction and start cell, never to its
// number: the key is 'A r,c' or 'D r,c' (0-based). After a grid edit a clue stays with a
// slot that still starts at its cell; otherwise it goes to the orphan tray (spec §4.4).
//
// Model:
//   { kind: 'crushword', header, maxCellLetters: number|null, rows, cols,
//     blocks: boolean[] /* r*cols + c */, cells: string[] /* '' for blocks and empty cells */,
//     clues: { [slotKey]: Entry }, circles: string[] /* 'r,c', ascending */, orphans: [], nextId }
//
// The grid rules (numbering, unclued and uncrossed cells, symmetry, connectivity) are
// crushword/src/grid.mjs's, and the typing maps are typing.mjs's: the editor can't drift
// from the validator or the puzzle page.
const { deriveSlots, slotCells, uncluedCells, uncrossedCells, isSymmetric, isConnected } = require('../../../../crushword/src/grid.mjs');
const { buildEntryMaps } = require('../../../../crushword/src/typing.mjs');
const { DEFAULT_MAX_CELL_LETTERS, MIN_ANSWER_LETTERS } = require('../../../../crushword/src/validator');
const { StructureError } = require('../errors');
const { formatCell } = require('../cells');
const { orphanOf } = require('../starts');
const { newEntry, entryFromYaml, entryToYaml, circledPositions } = require('../entries');
const { headerFromYaml, headerToYaml, setHeaderField } = require('../header');
const { sanitizeCell, parseEntryCells, takeOrphan, displayPatch, isCell, isModelBase } = require('../kindCommon');

const kind = 'crushword';
// The bounds are the editor's, not format rules.
const sizeFields = [
  { name: 'rows', label: 'Rows', min: 3, max: 25, default: 15 },
  { name: 'cols', label: 'Columns', min: 3, max: 25, default: 15 },
];
const MAX_CELL_LETTERS_LIMIT = 9;

// ── grid helpers ────────────────────────────────────────────────────────────

const cellKey = (r, c) => `${r},${c}`;
const keyOf = (dir, r, c) => `${dir} ${r},${c}`;
const parseCell = (key) => key.split(',').map(Number);
const byCell = (a, b) => { const [ar, ac] = parseCell(a), [br, bc] = parseCell(b); return ar - br || ac - bc; };

function gridStrings(model) {
  const rows = [];
  for (let r = 0; r < model.rows; r++) {
    let line = '';
    for (let c = 0; c < model.cols; c++) line += model.blocks[r * model.cols + c] ? '#' : '.';
    rows.push(line);
  }
  return rows;
}

function slotsOfGrid(grid) {
  const { acrossSlots, downSlots } = deriveSlots(grid);
  const make = (dir, s) => ({
    key: keyOf(dir, s.r, s.c), dir, num: s.num, r: s.r, c: s.c, len: s.len,
    cells: slotCells(s, dir === 'A' ? 'across' : 'down').map(({ r, c }) => cellKey(r, c)),
  });
  return [...acrossSlots.map(s => make('A', s)), ...downSlots.map(s => make('D', s))];
}

// → [{ key, dir: 'A'|'D', num, r, c, len, cells: ['r,c', …] }], across slots then down,
// each by number.
const slots = (model) => slotsOfGrid(gridStrings(model));

// buildEntryMaps over the model's grid (1-based ids: r * cols + c + 1), for the editor's
// typing.
const entryMaps = (model) => buildEntryMaps(gridStrings(model));

const capOf = (model) => model.maxCellLetters ?? DEFAULT_MAX_CELL_LETTERS;
const mirror = (model, r, c) => [model.rows - 1 - r, model.cols - 1 - c];
const slotName = (slot) => `${slot.dir === 'A' ? 'Across' : 'Down'} ${slot.num}`;
const inGrid = (model, r, c) => Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < model.rows && c >= 0 && c < model.cols;
const cellAt = (model, key) => { const [r, c] = parseCell(key); return model.cells[r * model.cols + c]; };

// Every check the editor shows on the grid, from the validator's own rules.
function gridChecks(model) {
  const grid = gridStrings(model);
  const all = slotsOfGrid(grid);
  const cap = capOf(model);
  const short = all.filter(s => {
    const cells = s.cells.map(k => cellAt(model, k));
    return cells.every(c => c !== '') && cells.join('').length < MIN_ANSWER_LETTERS;
  }).map(s => s.key);
  const overfull = [];
  for (let r = 0; r < model.rows; r++) {
    for (let c = 0; c < model.cols; c++) if (model.cells[r * model.cols + c].length > cap) overfull.push(cellKey(r, c));
  }
  return {
    noEntry: uncluedCells(grid).map(({ r, c }) => cellKey(r, c)),
    uncrossed: uncrossedCells(grid).map(({ r, c, dir }) => ({ cell: cellKey(r, c), dir })),
    overfull,
    short,
    missing: [['A', 'across'], ['D', 'down']].filter(([d]) => !all.some(s => s.dir === d)).map(([d]) => d),
    symmetric: isSymmetric(grid),
    connected: isConnected(grid),
  };
}

// ── re-keying clues after a grid edit ───────────────────────────────────────

// `base` is `old` with new blocks/cells/size applied. Every slot key that existed keeps
// its entry; a new key gets an empty one; a key that's gone orphans a non-empty clue,
// labeled from the OLD numbering.
function rekey(old, base) {
  let nextId = old.nextId;
  const clues = {};
  for (const s of slots(base)) clues[s.key] = old.clues[s.key] ?? newEntry(`e${nextId++}`);
  const orphans = [];
  for (const s of slots(old)) {
    if (s.key in clues) continue;
    const o = orphanOf(old.clues[s.key], slotName(s));
    if (o) orphans.push(o);
  }
  return { ...base, clues, orphans: [...old.orphans, ...orphans], nextId };
}

// ── resizing ────────────────────────────────────────────────────────────────

// Rows and columns are added or removed at the bottom and right; new cells are open and
// empty.
function resized(model, R2, C2) {
  const blocks = new Array(R2 * C2).fill(false);
  const cells = new Array(R2 * C2).fill('');
  for (let r = 0; r < Math.min(model.rows, R2); r++) {
    for (let c = 0; c < Math.min(model.cols, C2); c++) {
      blocks[r * C2 + c] = model.blocks[r * model.cols + c];
      cells[r * C2 + c] = model.cells[r * model.cols + c];
    }
  }
  const circles = model.circles.filter(k => { const [r, c] = parseCell(k); return r < R2 && c < C2; });
  return rekey(model, { ...model, rows: R2, cols: C2, blocks, cells, circles });
}

// How many clues resize(R2, C2) would move to Unattached clues, counted from its result.
const resizeLosses = (model, R2, C2) => resized(model, R2, C2).orphans.length - model.orphans.length;

// ── new, import, export ─────────────────────────────────────────────────────

function newModel({ rows, cols }) {
  const base = {
    kind, header: { title: '', extra: {} }, maxCellLetters: null, rows, cols,
    blocks: new Array(rows * cols).fill(false), cells: new Array(rows * cols).fill(''),
    clues: {}, circles: [], orphans: [], nextId: 1,
  };
  return rekey(base, base);
}

function fromYaml(puzzle) {
  if (puzzle.title !== undefined && typeof puzzle.title !== 'string') throw new StructureError('the title must be text (put numbers in quotes)');
  const g = puzzle.grid;
  if (!Array.isArray(g) || !g.length || g.some(row => typeof row !== 'string' || !/^[.#]+$/.test(row) || row.length !== g[0].length)) {
    throw new StructureError('"grid" must be a list of equal-length rows of "." and "#"');
  }
  if (!g.some(row => row.includes('.'))) throw new StructureError('the grid has no open cell');
  const maxCellLetters = puzzle.maxCellLetters ?? null;
  if (maxCellLetters !== null && !(Number.isInteger(maxCellLetters) && maxCellLetters >= 1)) throw new StructureError('maxCellLetters must be a positive whole number');
  const rows = g.length, cols = g[0].length;
  const all = slotsOfGrid(g);

  const lists = {};
  for (const [dir, name] of [['A', 'across'], ['D', 'down']]) {
    const group = puzzle[name];
    if (!group || typeof group !== 'object' || Array.isArray(group)) throw new StructureError(`"${name}" must be keyed by clue number`);
    const mine = all.filter(s => s.dir === dir);
    const want = mine.map(s => String(s.num));
    const bad = Object.keys(group).find(k => !want.includes(k)) ?? want.find(k => !(k in group));
    if (bad !== undefined) {
      throw new StructureError(`${name} ${bad in group ? `has ${bad}, which the grid doesn't number` : `is missing ${bad}, which the grid numbers`}`);
    }
    const parsed = parseEntryCells(mine.map(s => group[s.num]), name);
    parsed.forEach((cs, i) => {
      if (cs.length !== mine[i].len) throw new StructureError(`${name} ${mine[i].num} has ${cs.length} cells, but its slot has ${mine[i].len}`);
    });
    lists[dir] = parsed;
  }
  const slotsOf = (dir) => all.filter(s => s.dir === dir);
  const entryCells = new Map();      // slot key → that entry's cells
  for (const dir of ['A', 'D']) slotsOf(dir).forEach((s, i) => entryCells.set(s.key, lists[dir][i]));

  const cells = new Array(rows * cols).fill('');
  const warnings = [];
  const acrossOf = new Map();
  for (const s of slotsOf('A')) s.cells.forEach((k, i) => { cells[parseCell(k)[0] * cols + parseCell(k)[1]] = entryCells.get(s.key)[i]; acrossOf.set(k, s); });
  for (const s of slotsOf('D')) {
    s.cells.forEach((k, i) => {
      const [r, c] = parseCell(k);
      const letter = entryCells.get(s.key)[i];
      const across = acrossOf.get(k);
      if (!across) { cells[r * cols + c] = letter; return; }
      const kept = cells[r * cols + c];
      if (kept !== letter) warnings.push(`Cell (${r + 1}, ${c + 1}): kept "${formatCell(kept)}" from across ${across.num}, discarded "${formatCell(letter)}" from down ${s.num}`);
    });
  }

  // Circles: the union over every entry; each entry that covers a circled cell and didn't
  // list it is reported.
  const listed = new Set();
  const circleKeys = new Set();
  for (const s of all) {
    const entry = puzzle[s.dir === 'A' ? 'across' : 'down'][s.num];
    const list = entry.styles && Array.isArray(entry.styles.circle) ? entry.styles.circle : [];
    for (const p of list) {
      if (!Number.isInteger(p) || p < 0 || p >= s.len) continue;
      circleKeys.add(s.cells[p]);
      listed.add(`${s.key}:${s.cells[p]}`);
    }
  }
  const circles = [...circleKeys].sort(byCell);
  for (const k of circles) {
    for (const s of all) {
      if (s.cells.includes(k) && !listed.has(`${s.key}:${k}`)) {
        const [r, c] = parseCell(k);
        warnings.push(`Completed the circle on cell (${r + 1}, ${c + 1}) (added to ${slotName(s)})`);
      }
    }
  }

  let n = 1;
  const clues = {};
  for (const s of all) clues[s.key] = entryFromYaml(puzzle[s.dir === 'A' ? 'across' : 'down'][s.num], `e${n++}`, entryCells.get(s.key));

  return {
    model: {
      kind, header: headerFromYaml(puzzle, ['grid', 'across', 'down', 'maxCellLetters']), maxCellLetters,
      rows, cols, blocks: g.flatMap(row => [...row].map(ch => ch === '#')), cells, clues, circles, orphans: [], nextId: n,
    },
    warnings,
  };
}

function toYaml(model) {
  const out = { across: {}, down: {} };
  for (const s of slots(model)) {
    out[s.dir === 'A' ? 'across' : 'down'][s.num] = entryToYaml(model.clues[s.key], s.cells.map(k => cellAt(model, k)), circledPositions(s.cells, model.circles));
  }
  return {
    kind, ...headerToYaml(model.header),
    ...(model.maxCellLetters !== null ? { maxCellLetters: model.maxCellLetters } : {}),
    grid: gridStrings(model), across: out.across, down: out.down,
  };
}

// ── completeness (spec §6 layer 1) ──────────────────────────────────────────

const MAX_LISTED = 10;
const place = (key) => { const [r, c] = parseCell(key); return `(${r + 1}, ${c + 1})`; };

function completeness(model) {
  const out = [];
  const err = (message, target) => out.push({ level: 'error', message, target });
  const checks = gridChecks(model);
  if (!model.header.title.trim()) err('Give the puzzle a title.', { header: 'title' });
  // A cell in no entry gets its own, more precise message below.
  const noEntry = new Set(checks.noEntry);
  const empty = [];
  for (let r = 0; r < model.rows; r++) {
    for (let c = 0; c < model.cols; c++) {
      if (!model.blocks[r * model.cols + c] && model.cells[r * model.cols + c] === '' && !noEntry.has(cellKey(r, c))) empty.push(cellKey(r, c));
    }
  }
  if (empty.length === 1) err(`Cell ${place(empty[0])} is empty.`, { cells: empty });
  else if (empty.length) {
    err(`Empty cells: ${empty.slice(0, MAX_LISTED).map(place).join(', ')}${empty.length > MAX_LISTED ? `, and ${empty.length - MAX_LISTED} more` : ''}.`, { cells: empty });
  }
  for (const k of checks.noEntry) err(`Cell ${place(k)} is open but in no entry — block it or open a neighbor.`, { cells: [k] });
  for (const s of slots(model)) {
    if (!model.clues[s.key].clue.trim()) err(`${slotName(s)} has no clue.`, { key: s.key });
  }
  const cap = capOf(model);
  for (const k of checks.overfull) err(`Cell ${place(k)} holds ${cellAt(model, k).length} letters; the limit is ${cap}.`, { cells: [k] });
  for (const o of model.orphans) err(`Unattached clue "${o.clue}" (from ${o.from}). Attach or discard it.`, { orphan: o.id });
  return out;
}

// ── commands ────────────────────────────────────────────────────────────────

const withClue = (model, key, patch) => ({ ...model, clues: { ...model.clues, [key]: patch(model.clues[key]) } });
const hasSlot = (model, key) => Object.hasOwn(model.clues, key);
const sortCircles = (list) => [...list].sort(byCell);

const commands = {
  // Not truncated: an over-full cell is flagged by gridChecks instead.
  setCell(model, r, c, content) {
    if (!inGrid(model, r, c) || model.blocks[r * model.cols + c]) return model;
    const value = sanitizeCell(content);
    if (model.cells[r * model.cols + c] === value) return model;
    const cells = model.cells.slice();
    cells[r * model.cols + c] = value;
    return { ...model, cells };
  },

  // The Letters field: the UI has checked the count and the cap.
  setSlotCells(model, key, newCells) {
    const slot = slots(model).find(s => s.key === key);
    if (!slot || !Array.isArray(newCells) || newCells.length !== slot.len) return model;
    const cells = model.cells.slice();
    slot.cells.forEach((k, i) => { const [r, c] = parseCell(k); cells[r * model.cols + c] = sanitizeCell(newCells[i]); });
    return { ...model, cells };
  },

  toggleBlock(model, r, c, symmetric) {
    if (!inGrid(model, r, c)) return model;
    const target = !model.blocks[r * model.cols + c];
    const blocks = model.blocks.slice();
    const cells = model.cells.slice();
    const set = (rr, cc) => { blocks[rr * model.cols + cc] = target; if (target) cells[rr * model.cols + cc] = ''; };
    set(r, c);
    if (symmetric) { const [mr, mc] = mirror(model, r, c); if (blocks[mr * model.cols + mc] !== target) set(mr, mc); }
    if (blocks.every(Boolean)) return model;
    const circles = model.circles.filter(k => { const [rr, cc] = parseCell(k); return !blocks[rr * model.cols + cc]; });
    return rekey(model, { ...model, blocks, cells, circles });
  },

  // A size the editor can draw: whole numbers within the size fields' ranges, and not the
  // size it already is.
  resize(model, R2, C2) {
    const ok = (n, f) => Number.isInteger(n) && n >= f.min && n <= f.max;
    if (!ok(R2, sizeFields[0]) || !ok(C2, sizeFields[1]) || (R2 === model.rows && C2 === model.cols)) return model;
    return resized(model, R2, C2);
  },

  setClue: (model, key, text) => (hasSlot(model, key) ? withClue(model, key, e => ({ ...e, clue: text })) : model),

  setDisplayAnswer: (model, key, text) => (hasSlot(model, key) ? withClue(model, key, e => displayPatch(e, text)) : model),

  toggleCircle(model, r, c) {
    if (!inGrid(model, r, c) || model.blocks[r * model.cols + c]) return model;
    const k = cellKey(r, c);
    return { ...model, circles: model.circles.includes(k) ? model.circles.filter(x => x !== k) : sortCircles([...model.circles, k]) };
  },

  // Lowering it flags cells; it doesn't trim them.
  setMaxCellLetters(model, n) {
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= MAX_CELL_LETTERS_LIMIT)) return model;
    return { ...model, maxCellLetters: n };
  },

  setHeader: (model, field, value) => ({ ...model, header: setHeaderField(model.header, field, value) }),

  attachOrphan(model, orphanId, key) {
    if (!hasSlot(model, key)) return model;                     // the slot went away since it was picked
    const slot = slots(model).find(s => s.key === key);
    const taken = takeOrphan(model, orphanId, model.clues[key], slotName(slot));
    if (!taken) return model;
    return { ...withClue(model, key, e => ({ ...e, clue: taken.clue })), orphans: taken.orphans, nextId: taken.nextId };
  },

  discardOrphan: (model, orphanId) => ({ ...model, orphans: model.orphans.filter(o => o.id !== orphanId) }),
};

// Enough shape that the editor can open a model (a draft, say) without crashing.
function isModel(m) {
  if (!isModelBase(m, kind) || !Number.isInteger(m.rows) || !Number.isInteger(m.cols) || m.rows < 1 || m.cols < 1) return false;
  const total = m.rows * m.cols;
  if (!(m.maxCellLetters === null || (Number.isInteger(m.maxCellLetters) && m.maxCellLetters >= 1))) return false;
  if (!Array.isArray(m.blocks) || m.blocks.length !== total || !m.blocks.every(b => typeof b === 'boolean')) return false;
  if (!Array.isArray(m.cells) || m.cells.length !== total || !m.cells.every((c, i) => isCell(c) && !(m.blocks[i] && c !== ''))) return false;
  if (!m.circles.every(k => typeof k === 'string' && /^\d+,\d+$/.test(k) && inGrid(m, ...parseCell(k)) && !m.blocks[parseCell(k)[0] * m.cols + parseCell(k)[1]])) return false;
  if (!m.clues || typeof m.clues !== 'object' || Array.isArray(m.clues)) return false;
  const keys = slots(m).map(s => s.key).sort();
  const have = Object.keys(m.clues).sort();
  return keys.length === have.length && keys.every((k, i) => k === have[i])
    && have.every(k => m.clues[k] && typeof m.clues[k].id === 'string' && typeof m.clues[k].clue === 'string');
}

module.exports = {
  kind, sizeFields, isModel, newModel, fromYaml, toYaml, completeness, commands,
  gridStrings, slots, entryMaps, capOf, mirror, gridChecks, resizeLosses, slotName, MIN_ANSWER_LETTERS,
};
