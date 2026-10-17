import { useKeyedDraft } from './useKeyedDraft.js';

// One row or band as editable text, with | between entries. `apply(text)` returns an
// error message to show, or null once it has applied the line.
//
// `idPrefix` names its elements (#line-field by default; Crushword's Letters field uses
// 'letters').
//
// Unlike SequenceField it applies only on Enter or the Apply button, not on blur:
// rewriting a whole row or band can orphan clues, and clicking away shouldn't do that.
export function LineField({ label, hint, text, apply, idPrefix = 'line' }) {
  const draft = useKeyedDraft(`${label}\n${text}`);

  function submit() {
    if (draft.value === null) return;
    const problem = apply(draft.value);
    if (problem) draft.fail(problem);
    else draft.clear();
  }

  return (
    <div class="seq">
      <label id={`${idPrefix}-label`} for={`${idPrefix}-field`}>{label}</label>
      <div class="seq-row">
        <input id={`${idPrefix}-field`} value={draft.value ?? text} spellcheck={false} autocomplete="off"
          onInput={e => draft.set(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }} />
        <button type="button" id={`${idPrefix}-apply`} class="btn" onClick={submit}>Apply</button>
      </div>
      <p class="hint">{hint}</p>
      {draft.error && <p id={`${idPrefix}-error`} class="err">{draft.error}</p>}
    </div>
  );
}
