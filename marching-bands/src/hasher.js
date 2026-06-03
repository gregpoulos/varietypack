'use strict';

const normalize = require('../../shared/normalize');
const sha256hex = require('../../shared/sha256hex');
const { processEntries } = require('../../shared/build/builderUtils');
const { centerFlatIndex } = require('./layout');

function deriveN(puzzle) {
  return puzzle.rows[0].entries.reduce((sum, e) => sum + normalize(e.answer).length, 0);
}

function preparePuzzle(puzzle) {
  const hashed = puzzle.hashed ?? false;
  const N = deriveN(puzzle);
  const isOddN = N % 2 === 1;
  const centerIdx = isOddN ? centerFlatIndex(N) : -1; // 0-indexed

  const rows = puzzle.rows.map(row => ({ entries: processEntries(row.entries) }));
  const bands = puzzle.bands.map(band => ({ entries: processEntries(band.entries) }));

  // Build letters array (N*N elements, row-major, null at center for odd N)
  const letters = new Array(N * N).fill(null);
  for (let r = 0; r < N; r++) {
    const rowLetters = rows[r].entries.flatMap(e => e._norm.split(''));
    let letterIdx = 0;
    for (let c = 0; c < N; c++) {
      const flatIdx = r * N + c;
      if (flatIdx === centerIdx) continue; // skip center
      letters[flatIdx] = rowLetters[letterIdx++];
    }
  }

  const prepared = {
    title:  puzzle.title,
    kind:   'marching-bands',
    hashed,
    size:   N,
    rows:   rows.map(row => ({ entries: row.entries.map(({ _norm, ...e }) => e) })),
    bands:  bands.map(band => ({ entries: band.entries.map(({ _norm, ...e }) => e) })),
    ...(puzzle.author       !== undefined ? { author:       puzzle.author       } : {}),
    ...(puzzle.date         !== undefined ? { date:         puzzle.date         } : {}),
    ...(puzzle.instructions !== undefined ? { instructions: puzzle.instructions } : {}),
  };

  if (hashed) {
    // Hash all letters in row-major order, skipping center (null entries)
    const hashInput = letters.filter(l => l !== null).join('');
    prepared.boardHash = sha256hex(hashInput);
  } else {
    prepared.letters = letters;
  }

  return prepared;
}

module.exports = { preparePuzzle };
