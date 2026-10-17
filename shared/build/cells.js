'use strict';
// Answers into cells: the bracket notation that validators, prepare steps, the muddler
// and the studio's editors all read an answer with.

const { normalize, foldLetters } = require('../normalize.mjs');

// An error naming the first letter or number in `answer` that doesn't fold to plain
// A–Z or 0–9 (æ, ß, Greek, ½ → 1⁄2), which normalize would drop or split; null when
// there is none. Accented letters fold, so they pass.
function untypableLetterError(answer) {
  for (const ch of answer) {
    if (/[\p{L}\p{N}]/u.test(ch) && /[^a-z0-9]/i.test(foldLetters(ch))) {
      return `letter "${ch}" can't be typed as A–Z or 0–9; spell it out (brackets put several in one cell)`;
    }
  }
  return null;
}

// Parses an answer string into normalized per-cell strings using bracket notation. The
// answer is checked and then folded (foldLetters: É → E, ﬁ → fi, full-width ［ → [), so
// every letter left is a–z or 0–9: each bare one is one cell, a [...] group is exactly
// one cell, and any other bare character (space, hyphen, apostrophe) is dropped. A
// bracketed group with no letters is an error — the author explicitly marked a cell
// there. Returns { cells, error }; exactly one is non-null.
function parseAnswerCells(answer) {
  if (typeof answer !== 'string') {
    throw new TypeError(`parseAnswerCells: answer must be a string, got ${JSON.stringify(answer)}`);
  }
  const untypable = untypableLetterError(answer);
  if (untypable) return { cells: null, error: untypable };
  const text = foldLetters(answer);
  const cells = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '[') {
      const end = text.indexOf(']', i + 1);
      if (end === -1) return { cells: null, error: 'unclosed "[" in answer' };
      const inner = text.slice(i + 1, end);
      if (inner.includes('[')) return { cells: null, error: 'nested "[" in answer' };
      const norm = normalize(inner);
      if (!norm) return { cells: null, error: `bracketed group "[${inner}]" contains no letters` };
      cells.push(norm);
      i = end + 1;
    } else if (ch === ']') {
      return { cells: null, error: 'unmatched "]" in answer' };
    } else {
      const norm = normalize(ch);
      if (norm) cells.push(norm);
      i++;
    }
  }
  return { cells, error: null };
}

// parseAnswerCells for callers past validation, where an invalid answer is a bug: throws
// with the parser's reason rather than returning null — strictly better than silently
// hashing an empty board.
function cellsOrThrow(answer) {
  const { cells, error } = parseAnswerCells(answer);
  if (error) throw new Error(`invalid answer ${JSON.stringify(answer)}: ${error}`);
  return cells;
}

// What a muddled entry's `length:` means: a cell count, which a rebus cell makes smaller
// than the letter count. Keyed on `answer` presence, not `length`, so it agrees with
// processEntries when a stray `length` accompanies an `answer`.
function entryCellCount(entry) {
  if (entry.answer === undefined) return entry.length;
  return cellsOrThrow(entry.answer).length;
}

module.exports = { parseAnswerCells, cellsOrThrow, entryCellCount };
