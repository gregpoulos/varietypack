'use strict';

const { processEntries, prepareCommon } = require('../../shared/build/builderUtils');

function preparePuzzle(puzzle) {
  const loops = puzzle.loops ?? 2;

  const processed = processEntries(puzzle.entries);
  const entries    = processed.map(({ _cells, ...e }) => e);

  return {
    ...prepareCommon(puzzle, 'snake-charmer', () => {
      // All slicing happens in CELL space. Slicing a joined string would cut a
      // multi-letter cell in half once the delimiter lands.
      const cells    = processed.flatMap(e => e._cells);
      const ringSize = cells.length / loops;
      const ring     = cells.slice(0, ringSize);
      return { boardCells: ring, letters: ring };
    }),
    loops,
    entries,
  };
}

module.exports = { preparePuzzle };
