'use strict';
// The part of every tool's prepare step that is the same for all four: entries into the
// shape prepare works from, and the header fields with the board hash.

const { sha256hex } = require('../sha256hex.mjs');
const { joinCells } = require('../boardString.mjs');
const { cellsOrThrow } = require('./cells');
const { renderClueMarkdown, renderInstructionsMarkdown } = require('./renderMarkdown');

// Normalizes a list of YAML entries into the shape every prepare step needs:
// { clue, length, _cells } plus styles, passed through on presence (`!== undefined`).
// `_cells` is for hashing/letters and must be stripped before it reaches PUZZLE_DATA.
// clue is rendered as inline markdown here — the one place every tool's entries funnel
// through — and a muddled entry still has clue text, so this runs unconditionally.
function processEntries(entries) {
  return entries.map(entry => {
    let cells, length;
    if (entry.answer === undefined) {
      cells = null;
      length = entry.length;
    } else {
      cells = cellsOrThrow(entry.answer);
      length = cells.length;
    }
    const out = { clue: renderClueMarkdown(entry.clue), length, _cells: cells };
    if (entry.styles !== undefined) out.styles = entry.styles;
    return out;
  });
}

// The tool-independent part of every tool's preparePuzzle(): the header fields, boardHash
// and letters. `computeBoard` is the tool's part — a function returning { boardCells,
// letters } built from its entries' _cells:
//   boardCells  the board's cells in the tool's canonical order, joined (joinCells) and
//               hashed into boardHash, which every build carries
//   letters     PUZZLE_DATA.letters, the answer key a plain (not hashed) build ships. It
//               can hold positions boardCells leaves out: Marching Bands' odd-size grid
//               has a null center in letters and none in the hash.
// A muddled puzzle already has its boardHash and no answers (every _cells is null), so
// the hash passes through and computeBoard is never called. That is why it is a function,
// not a value: building the board up front would read those nulls.
function prepareCommon(puzzle, kind, computeBoard) {
  const hashed = puzzle.hashed ?? false;
  const prepared = {
    title:  puzzle.title,
    kind,
    author: puzzle.author,
    date:   puzzle.date,
    hashed,
  };
  // Block-level markdown: blank-line paragraphs become separate <p>s.
  if (puzzle.instructions !== undefined) prepared.instructions = renderInstructionsMarkdown(puzzle.instructions);

  if (puzzle.boardHash !== undefined) {
    prepared.boardHash = puzzle.boardHash;
    return prepared;
  }

  const { boardCells, letters } = computeBoard();
  prepared.boardHash = sha256hex(joinCells(boardCells));
  if (!hashed) prepared.letters = letters;
  return prepared;
}

module.exports = { processEntries, prepareCommon };
