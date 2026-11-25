'use strict';
// What every structured kind module needs and would otherwise repeat: label formatting,
// the cell and circle housekeeping, parsing a list of entries into cells, the orphan
// swap, the completeness problems every kind reports, and the commands every kind has in
// the same form. Kind modules keep what is genuinely theirs (geometry, coordinates,
// labels).
const { parseAnswerCells } = require('../../../shared/build/cells');
const { normalize } = require('../../../shared/normalize.mjs');
const { StructureError } = require('./errors');
const { setHeaderField } = require('./header');
const { fillEmptyClues } = require('./placeholderClues');

// 1-based, runs compressed: [2,3,4,8] → '3–5, 9'.
function runsLabel(indices) {
  const runs = [];
  for (let k = 0; k < indices.length; k++) {
    let end = k;
    while (end + 1 < indices.length && indices[end + 1] === indices[end] + 1) end++;
    runs.push(end > k ? `${indices[k] + 1}–${indices[end] + 1}` : `${indices[k] + 1}`);
    k = end;
  }
  return runs.join(', ');
}

// A typed cell is lowercase letters only, normalized as the build path does.
const sanitizeCell = (content) => normalize(String(content));

// A new sorted list with `i` added, or removed if it was there.
function toggleSorted(list, i) {
  return list.includes(i) ? list.filter(x => x !== i) : [...list, i].sort((a, b) => a - b);
}

// Circles (cell indices) after an edit {start, removed, inserted} to the cells: those
// before it stay, those after it shift, and one inside the replaced span survives only if
// a letter was swapped in place (same size). Anything past the new end goes.
function remapCircles(circles, d, newTotal) {
  const out = [];
  for (const c of circles) {
    if (c < d.start) out.push(c);
    else if (c >= d.start + d.removed) out.push(c - d.removed + d.inserted);
    else if (d.removed === d.inserted) out.push(c);
  }
  return out.filter(c => c < newTotal);
}

function cumulativeStarts(lists) {
  const starts = [];
  let at = 0;
  for (const cells of lists) { starts.push(at); at += cells.length; }
  return { starts, total: at };
}

function assertTitle(puzzle) {
  if (puzzle.title !== undefined && typeof puzzle.title !== 'string') throw new StructureError('the title must be text (put numbers in quotes)');
}

// The positions an entry lists under styles.circle; a bad list is the validator's to
// report, so it counts as none here.
const listedCircles = (entry) => (entry.styles && Array.isArray(entry.styles.circle) ? entry.styles.circle : []);

// Each entry's cells. Anything that can't be represented throws a StructureError, so the
// file opens in YAML mode with the validator's view instead of crashing the editor.
function parseEntryCells(entries, listName) {
  if (!Array.isArray(entries)) throw new StructureError(`"${listName}" must be a list`);
  return entries.map(entry => {
    if (!entry || typeof entry !== 'object') throw new StructureError('every entry must have a clue and an answer');
    if (entry.answer === undefined) throw new StructureError('entries without answers can’t be edited on the board');
    if (typeof entry.answer !== 'string') throw new StructureError('every answer must be text');
    if (entry.clue !== undefined && typeof entry.clue !== 'string') throw new StructureError('every clue must be text (put numbers in quotes)');
    const parsed = parseAnswerCells(entry.answer);
    if (parsed.error) throw new StructureError(parsed.error);
    if (!parsed.cells.length) throw new StructureError('every answer needs at least one letter');
    return parsed.cells;
  });
}

// Attaching an orphan to an entry: the orphan is used up, and a clue the entry already
// had becomes a new orphan (a swap). → { clue, orphans, nextId } or null if there's no
// such orphan.
function takeOrphan({ orphans, nextId }, orphanId, target, label) {
  const orphan = orphans.find(o => o.id === orphanId);
  if (!orphan) return null;
  const rest = orphans.filter(o => o.id !== orphanId);
  if (target.clue.trim()) {
    rest.push({ id: `e${nextId}`, clue: target.clue, from: label });
    nextId++;
  }
  return { clue: orphan.clue, orphans: rest, nextId };
}

// A completeness item. Every one blocks export.
const problem = (message, target) => ({ level: 'error', message, target });

// The problems every kind reports: the title, first in its list, and the loose clues,
// last.
const titleProblems = (model) => (model.header.title.trim() ? [] : [problem('Give the puzzle a title.', { header: 'title' })]);
const orphanProblems = (model) => model.orphans.map(o => problem(`Unattached clue "${o.clue}" (from ${o.from}). Attach or discard it.`, { orphan: o.id }));

// A grid's empty cells as one problem: a lone cell by its place, else the first few and a
// count. place(cell) names a cell as "(row, column)".
const MAX_LISTED = 10;
function emptyCellsProblems(cells, place) {
  if (!cells.length) return [];
  if (cells.length === 1) return [problem(`Cell ${place(cells[0])} is empty.`, { cells })];
  const more = cells.length > MAX_LISTED ? `, and ${cells.length - MAX_LISTED} more` : '';
  return [problem(`Empty cells: ${cells.slice(0, MAX_LISTED).map(place).join(', ')}${more}.`, { cells })];
}

// The commands every kind has in the same form; mapEntries is the kind's own.
function commonCommands(mapEntries) {
  return {
    setHeader: (model, field, value) => ({ ...model, header: setHeaderField(model.header, field, value) }),
    discardOrphan: (model, orphanId) => ({ ...model, orphans: model.orphans.filter(o => o.id !== orphanId) }),
    fillEmptyClues: (model) => fillEmptyClues(model, mapEntries),
  };
}

// Sets an entry's "display text"; a blank text removes it.
function displayPatch(entry, text) {
  const { displayText, ...rest } = entry;
  return text === '' ? rest : { ...rest, displayText: text };
}

// One cut is sound when its starts are strictly increasing from 0 and below the total,
// with exactly one entry (an object with a string id and clue) per start.
function isCut(cut, total) {
  return !!(cut && Array.isArray(cut.starts) && Array.isArray(cut.entries)
    && cut.starts.length === cut.entries.length && cut.starts.length > 0
    && cut.starts[0] === 0
    && cut.starts.every((s, i) => Number.isInteger(s) && s < total && (i === 0 || s > cut.starts[i - 1]))
    && cut.entries.every(e => e && typeof e === 'object' && typeof e.id === 'string' && typeof e.clue === 'string'));
}

// A normalized cell: what sanitizeCell can produce (empty for a cell not filled yet).
const isCell = (c) => typeof c === 'string' && /^[a-z0-9]*$/.test(c);
const isCells = (cells) => Array.isArray(cells) && cells.every(isCell);
const isCircles = (circles, total) => Array.isArray(circles) && circles.every(c => Number.isInteger(c) && c >= 0 && c < total);

// The part of the model-shape check every kind shares.
function isModelBase(m, kind) {
  return !!(m && typeof m === 'object' && m.kind === kind
    && m.header && typeof m.header.title === 'string'
    && Array.isArray(m.circles) && Array.isArray(m.orphans) && Number.isInteger(m.nextId));
}

module.exports = {
  runsLabel, sanitizeCell, toggleSorted, remapCircles, cumulativeStarts, assertTitle, listedCircles,
  parseEntryCells, takeOrphan, problem, titleProblems, orphanProblems, emptyCellsProblems, commonCommands,
  displayPatch, isCut, isCell, isCells, isCircles, isModelBase,
};
