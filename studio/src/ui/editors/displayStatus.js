import { sameCells } from '../../model/cells.js';
import { parseAnswerCells } from '../../../../shared/build/cells.js';

// The selected row's display-text field (ClueList's `display` and `displayStatus`): the
// entry's text, and, only when it no longer matches the entry's `cells`, a warning
// under it (null otherwise: a match needs no note). readsBackward: the kind module's,
// for where a rebus may be spelled backward.
export function displayTextOf(entry, cells, readsBackward) {
  const display = entry.displayText ?? '';
  return { display, displayStatus: displayStatusFor(display, cells, readsBackward) };
}

function displayStatusFor(shown, cells, readsBackward) {
  if (!shown || sameCells(parseAnswerCells(shown).cells || [], cells, readsBackward)) return null;
  return { text: 'Doesn’t match the cells, so the plain letters will be used.', warn: true };
}
