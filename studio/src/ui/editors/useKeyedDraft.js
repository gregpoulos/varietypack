import { useState } from 'preact/hooks';

// An unapplied edit in a text field, tied to the text it was typed over. The draft (and
// an error about it) is visible only while `key` is unchanged: another row, an undo, or a
// click that edits a cell changes the key and drops it, so applying it later can't
// overwrite newer edits. That's derived at render, not reset in an effect: an effect runs
// after paint and would wipe what was typed in the gap.
//   → { value (the draft or null), error (message or null), set(text), fail(message), clear() }
export function useKeyedDraft(key) {
  const [draft, setDraft] = useState(null);       // { key, value }
  const [error, setError] = useState(null);       // { key, message }
  return {
    value: draft && draft.key === key ? draft.value : null,
    error: error && error.key === key ? error.message : null,
    set: (value) => setDraft({ key, value }),
    fail: (message) => setError({ key, message }),
    clear: () => { setDraft(null); setError(null); },
  };
}
