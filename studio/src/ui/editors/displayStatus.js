import { sameCells } from '../../model/cells.js';
import { parseAnswerCells } from '../../../../shared/build/cells.js';

// The note under the "Answer with spacing" field: whether what's typed still matches the
// cells. readsBackward: the kind module's, for where a rebus may be spelled backward.
export function displayStatusFor(shown, cells, readsBackward) {
  if (!shown) return { text: 'Optional: spacing and punctuation, like TRACEY EMIN.' };
  if (sameCells(parseAnswerCells(shown).cells || [], cells, readsBackward)) return { text: 'Matches the cells.' };
  return { text: 'Doesn’t match the cells, so the plain letters will be used.', warn: true };
}
