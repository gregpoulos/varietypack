'use strict';

const sha256hex = require('../../shared/sha256hex');
const { processEntries, entryLength } = require('../../shared/build/builderUtils');
const { centerFlatIndex } = require('./layout');

function deriveN(puzzle) {
  return puzzle.rows[0].entries.reduce((sum, e) => sum + entryLength(e), 0);
}

function preparePuzzle(puzzle) {
  const hashed = puzzle.hashed ?? false;
  const N      = deriveN(puzzle);
  const isOddN = N % 2 === 1;
  const centerIdx = isOddN ? centerFlatIndex(N) : -1;

  const rows  = puzzle.rows.map(row   => ({ entries: processEntries(row.entries)  }));
  const bands = puzzle.bands.map(band => ({ entries: processEntries(band.entries) }));

  const prepared = {
    title:  puzzle.title,
    kind:   'marching-bands',
    hashed,
    size:   N,
    rows:   rows.map(row   => ({ entries: row.entries.map(({ _norm, ...e }) => e)  })),
    bands:  bands.map(band => ({ entries: band.entries.map(({ _norm, ...e }) => e) })),
    ...(puzzle.author       !== undefined ? { author:       puzzle.author       } : {}),
    ...(puzzle.date         !== undefined ? { date:         puzzle.date         } : {}),
    ...(puzzle.instructions !== undefined ? { instructions: puzzle.instructions } : {}),
  };

  if (puzzle.boardHash !== undefined) {
    prepared.boardHash = puzzle.boardHash;
  } else {
    const letters = new Array(N * N).fill(null);
    for (let r = 0; r < N; r++) {
      const rowLetters = rows[r].entries.flatMap(e => e._norm.split(''));
      let letterIdx = 0;
      for (let c = 0; c < N; c++) {
        const flatIdx = r * N + c;
        if (flatIdx === centerIdx) continue;
        letters[flatIdx] = rowLetters[letterIdx++];
      }
    }
    const boardStr = letters.filter(l => l !== null).join('');
    prepared.boardHash = sha256hex(boardStr);
    if (!hashed) prepared.letters = letters;
  }

  return prepared;
}

module.exports = { preparePuzzle };
