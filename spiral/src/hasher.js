'use strict';

const { processEntries, prepareCommon } = require('../../shared/build/builderUtils');

function preparePuzzle(puzzle) {
  const inward  = processEntries(puzzle.inward);
  const outward = processEntries(puzzle.outward);

  return {
    ...prepareCommon(puzzle, 'spiral', () => {
      const cells = inward.flatMap(e => e._cells);
      return { boardCells: cells, letters: cells };
    }),
    inward:  inward.map(({ _cells, ...e }) => e),
    outward: outward.map(({ _cells, ...e }) => e),
  };
}

module.exports = { preparePuzzle };
