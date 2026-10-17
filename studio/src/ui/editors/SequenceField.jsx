import { formatSequence, parseSequence } from '../../model/cells.js';
import { useKeyedDraft } from './useKeyedDraft.js';

// The whole cell sequence as one editable string. Edits apply on Enter or blur; an
// invalid string shows its error and changes nothing.
export function SequenceField({ cells, onApply, label = 'All letters, from cell 1' }) {
  const shown = formatSequence(cells);
  const draft = useKeyedDraft(shown);

  function apply() {
    if (draft.value === null) return;
    const parsed = parseSequence(draft.value);
    if (parsed.error) { draft.fail(parsed.error); return; }
    draft.clear();
    onApply(parsed.cells);
  }

  return (
    <div class="seq">
      <label for="sequence-field">{label}</label>
      <div class="seq-row">
        <input id="sequence-field" value={draft.value ?? shown} spellcheck={false} autocomplete="off"
          onInput={e => draft.set(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
          onBlur={apply} />
        <button type="button" class="btn" onClick={apply}>Apply</button>
      </div>
      <p class="hint">Edit and press Enter. <code>[HAR]</code> is one multi-letter cell and <code>_</code> an empty one. Splits move with the letters around them.</p>
      {draft.error && <p id="sequence-error" class="err">{draft.error}</p>}
    </div>
  );
}
