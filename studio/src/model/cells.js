'use strict';
// Cells: lowercase strings, '' for empty, two or more letters for a rebus cell. Parsing
// reuses the build path's own bracket grammar (parseAnswerCells), so the studio never
// re-implements it.
const { parseAnswerCells } = require('../../../shared/build/cells');
const { sameCell } = require('../../../shared/build/validateEntry');

function formatCell(cell) {
  if (cell === '') return '·';
  return cell.length > 1 ? `[${cell.toUpperCase()}]` : cell.toUpperCase();
}

function formatAnswer(cells) {
  return cells.map(c => {
    if (c === '') throw new Error('cannot format an answer with an empty cell');
    return formatCell(c);
  }).join('');
}

function formatSequence(cells) {
  return cells.map(c => (c === '' ? '_' : formatCell(c))).join('');
}

// → { cells, error }. `_` is one empty cell; everything else follows parseAnswerCells.
function parseSequence(text) {
  const cells = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    let segment;
    if (ch === '_') {
      cells.push('');
      i++;
      continue;
    }
    if (ch === '[') {
      const end = text.indexOf(']', i + 1);
      segment = end === -1 ? text.slice(i) : text.slice(i, end + 1);
      i = end === -1 ? text.length : end + 1;
    } else {
      segment = ch;
      i++;
    }
    const parsed = parseAnswerCells(segment);
    if (parsed.error) return { cells: null, error: parsed.error };
    cells.push(...parsed.cells);
  }
  return { cells, error: null };
}

// Whether the spelled cells `a` are the cells `b`. readsBackward(i) is true where
// position i reads its cell against the direction it is written, so a rebus there may be
// spelled backward (sameCell); each kind module's readsBackward says where that is.
function sameCells(a, b, readsBackward = () => false) {
  return a.length === b.length && a.every((c, i) => sameCell(c, b[i], readsBackward(i)));
}

// The edit that turns oldCells into newCells: common prefix, then common suffix limited
// so the two can't overlap.
function diffCells(oldCells, newCells) {
  const limit = Math.min(oldCells.length, newCells.length);
  let p = 0;
  while (p < limit && oldCells[p] === newCells[p]) p++;
  let s = 0;
  while (s < limit - p && oldCells[oldCells.length - 1 - s] === newCells[newCells.length - 1 - s]) s++;
  return { start: p, removed: oldCells.length - p - s, inserted: newCells.length - p - s };
}

module.exports = { formatCell, formatAnswer, formatSequence, parseSequence, sameCells, diffCells };
