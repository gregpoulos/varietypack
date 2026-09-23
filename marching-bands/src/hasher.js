'use strict';

const { processEntries, entryLength, prepareCommon } = require('../../shared/build/builderUtils');
const { centerFlatIndex } = require('./layout');

function deriveN(puzzle) {
  return puzzle.rows[0].entries.reduce((sum, e) => sum + entryLength(e), 0);
}

function preparePuzzle(puzzle) {
  const N      = deriveN(puzzle);
  const isOddN = N % 2 === 1;
  const centerIdx = isOddN ? centerFlatIndex(N) : -1;

  const rows  = puzzle.rows.map(row   => ({ entries: processEntries(row.entries)  }));
  const bands = puzzle.bands.map(band => ({ entries: processEntries(band.entries) }));

  return {
    ...prepareCommon(puzzle, 'marching-bands', () => {
      const letters = new Array(N * N).fill(null);
      for (let r = 0; r < N; r++) {
        const rowCells = rows[r].entries.flatMap(e => e._cells);
        let cellIdx = 0;
        for (let c = 0; c < N; c++) {
          const flatIdx = r * N + c;
          if (flatIdx === centerIdx) continue;
          letters[flatIdx] = rowCells[cellIdx++];
        }
      }
      return { boardCells: letters.filter(l => l !== null), letters };
    }),
    size:  N,
    rows:  rows.map(row   => ({ entries: row.entries.map(({ _cells, ...e }) => e)  })),
    bands: bands.map(band => ({ entries: band.entries.map(({ _cells, ...e }) => e) })),
  };
}

module.exports = { preparePuzzle };
