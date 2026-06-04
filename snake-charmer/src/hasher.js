'use strict';

const sha256hex      = require('../../shared/sha256hex');
const { processEntries } = require('../../shared/build/builderUtils');

function preparePuzzle(puzzle) {
  const loops  = puzzle.loops ?? 2;
  const hashed = puzzle.hashed ?? false;

  const processed = processEntries(puzzle.entries);
  const entries   = processed.map(({ _norm, ...e }) => e);

  const result = {
    title: puzzle.title, kind: puzzle.kind, author: puzzle.author, date: puzzle.date,
    loops, hashed, entries,
    ...(puzzle.instructions !== undefined ? { instructions: puzzle.instructions } : {}),
  };

  if (puzzle.boardHash !== undefined) {
    result.boardHash = puzzle.boardHash;
  } else {
    const concat   = processed.map(e => e._norm).join('');
    const ringSize = concat.length / loops;
    const ring     = concat.slice(0, ringSize);
    if (hashed) {
      result.boardHash = sha256hex(ring);
    } else {
      result.letters = ring.split('');
    }
  }

  return result;
}

module.exports = { preparePuzzle };
