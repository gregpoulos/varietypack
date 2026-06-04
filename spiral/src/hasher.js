'use strict';

const sha256hex  = require('../../shared/sha256hex');
const { processEntries } = require('../../shared/build/builderUtils');

function preparePuzzle(puzzle) {
  const hashed = puzzle.hashed ?? false;

  const inward  = processEntries(puzzle.inward);
  const outward = processEntries(puzzle.outward);

  const prepared = {
    title:   puzzle.title,
    author:  puzzle.author,
    date:    puzzle.date,
    hashed,
    inward:  inward.map(({ _norm, ...e }) => e),
    outward: outward.map(({ _norm, ...e }) => e),
    ...(puzzle.instructions !== undefined ? { instructions: puzzle.instructions } : {}),
  };

  if (puzzle.boardHash !== undefined) {
    prepared.boardHash = puzzle.boardHash;
  } else if (hashed) {
    prepared.boardHash = sha256hex(inward.map(e => e._norm).join(''));
  } else {
    prepared.letters = inward.flatMap(e => e._norm.split(''));
  }

  return prepared;
}

module.exports = { preparePuzzle };
