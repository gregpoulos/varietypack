'use strict';
// Placeholder clues for entries that have none yet. One generator serves two uses that
// must show the same text: the Test-solve preview (which builds a copy of the puzzle
// with the gaps filled, so an unfinished puzzle can still be test-solved) and the Clues
// phase's "Fill empty clues" command (which writes them into the document, as one undo
// step).
//
// Preview only. The preview copy (`previewText` in doc.js, checked separately by App.jsx
// into `state.previewCheck`) must never reach `puzzleText`, completeness, `canExport`,
// the YAML, a draft or an export: the document keeps its real, empty clues, so the
// problems still show. A YAML-mode document gets no placeholders.
//
// Each kind module supplies `mapEntries(model, fn)`: a copy of the model with every entry
// (not the loose-clue tray) replaced by `fn(entry)`, visited in a fixed order. That order
// is an entry's index, so the same position always gets the same text.

// About clue length, so a preview wraps and scrolls as a real clue would.
const PHRASES = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco',
  'Duis aute irure dolor in reprehenderit in voluptate velit',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa',
  'Nemo enim ipsam voluptatem quia voluptas sit aspernatur',
  'Neque porro quisquam est, qui dolorem ipsum quia dolor sit',
  'At vero eos et accusamus et iusto odio dignissimos ducimus',
];

const placeholderClue = (index) => PHRASES[index % PHRASES.length];

const isEmpty = (entry) => !entry.clue.trim();

// The model with every empty clue filled; the same object when none is empty.
function fillEmptyClues(model, mapEntries) {
  let index = 0;
  let changed = false;
  const next = mapEntries(model, (entry) => {
    const i = index++;
    if (!isEmpty(entry)) return entry;
    changed = true;
    return { ...entry, clue: placeholderClue(i) };
  });
  return changed ? next : model;
}

// How many entries have no clue.
function emptyClueCount(model, mapEntries) {
  let n = 0;
  mapEntries(model, (entry) => { if (isEmpty(entry)) n++; return entry; });
  return n;
}

module.exports = { placeholderClue, fillEmptyClues, emptyClueCount };
