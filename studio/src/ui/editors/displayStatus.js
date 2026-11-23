import { sameCells } from '../../model/cells.js';
import { parseAnswerCells } from '../../../../shared/build/cells.js';

// The selected row's spaced-answer field (ClueList's `display` and `displayStatus`): the
// entry's text, and the note under it saying whether it still matches the entry's
// `cells`. readsBackward: the kind module's, for where a rebus may be spelled backward.
export function spacedAnswer(entry, cells, readsBackward) {
  const display = entry.displayAnswer ?? '';
  return { display, displayStatus: displayStatusFor(display, cells, readsBackward) };
}

function displayStatusFor(shown, cells, readsBackward) {
  if (!shown) return { text: 'Optional: spacing and punctuation, like JOAN OF ARC.' };
  if (sameCells(parseAnswerCells(shown).cells || [], cells, readsBackward)) return { text: 'Matches the cells.' };
  return { text: 'Doesn’t match the cells, so the plain letters will be used.', warn: true };
}
