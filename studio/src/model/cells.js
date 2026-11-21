'use strict';
// Cells: lowercase strings, '' for empty, two or more letters for a rebus cell.
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

// Whether the spelled cells `a` are the cells `b`. readsBackward(i) is true where
// position i reads its cell against the direction it is written, so a rebus there may be
// spelled backward (sameCell); each kind module's readsBackward says where that is.
function sameCells(a, b, readsBackward = () => false) {
  return a.length === b.length && a.every((c, i) => sameCell(c, b[i], readsBackward(i)));
}

module.exports = { formatCell, formatAnswer, sameCells };
