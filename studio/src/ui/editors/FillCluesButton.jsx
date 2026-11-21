import { STRUCTURED } from '../../model/kinds/index.js';
import { emptyClueCount } from '../../model/placeholderClues.js';

// The Clues phase's "Fill empty clues": writes placeholder text into every entry that has
// no clue, as one undo step. The same text the Test-solve preview shows for such entries.
// Disabled when nothing is empty.
export function FillCluesButton({ model, dispatch }) {
  const empty = emptyClueCount(model, STRUCTURED[model.kind].mapEntries);
  return (
    <button type="button" id="btn-fill-clues" class="btn" disabled={empty === 0}
      title="Write placeholder text into every empty clue"
      onClick={() => dispatch({ type: 'MODEL_COMMAND', name: 'fillEmptyClues', args: [], now: Date.now() })}>Fill empty clues</button>
  );
}
