'use strict';

const { entryCellCount } = require('../../shared/build/cells');
const { processEntries, prepareCommon } = require('../../shared/build/prepare');
const { rowCells } = require('./layout.mjs');

function deriveN(puzzle) {
  return puzzle.rows[0].entries.reduce((sum, e) => sum + entryCellCount(e), 0);
}

function preparePuzzle(puzzle) {
  const N = deriveN(puzzle);

  const rows  = puzzle.rows.map(row   => ({ entries: processEntries(row.entries)  }));
  const bands = puzzle.bands.map(band => ({ entries: processEntries(band.entries) }));

  return {
    ...prepareCommon(puzzle, 'marching-bands', () => {
      const letters = new Array(N * N).fill(null);
      for (let r = 0; r < N; r++) {
        const cells = rows[r].entries.flatMap(e => e._cells);
        rowCells(r, N).forEach((id, i) => { letters[id - 1] = cells[i]; });
      }
      return { boardCells: letters.filter(l => l !== null), letters };
    }),
    size:  N,
    rows:  rows.map(row   => ({ entries: row.entries.map(({ _cells, ...e }) => e)  })),
    bands: bands.map(band => ({ entries: band.entries.map(({ _cells, ...e }) => e) })),
  };
}

module.exports = { preparePuzzle };
