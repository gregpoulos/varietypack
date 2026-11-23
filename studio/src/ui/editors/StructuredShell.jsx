import { useEffect } from 'preact/hooks';
import { EDITORS } from './index.js';
import { PuzzleBox } from './PuzzleBox.jsx';
import { GridSettings } from './GridSettings.jsx';
import { FillCluesButton } from './FillCluesButton.jsx';
import { focusBoardOnOpen as focusBoard } from './useBoardInput.js';
import { undoRedoKeys } from './useBoardEditing.js';
import { isTouchFirst } from '../../../../shared/engine-phone.mjs';
import { PopoverScope } from '../usePopover.js';

// A document opened into the Board phase starts with the board focused, so the author can
// press arrows at once. Never over a field being typed in or an open dialog, and never on
// a touch device, where focus would raise the soft keyboard.
function maybeFocusBoard(view, dialog) {
  if (view !== 'board' || dialog) return;
  if (isTouchFirst()) return;
  const a = document.activeElement;
  if (a && a.matches('input, textarea, select, [contenteditable]')) return;
  focusBoard();
}

// The Edit view of a structured document: the kind's editor, given the Puzzle box to head
// its side column.
// Key it by document id so a new document gets a fresh editor (caret and UI state).
export function StructuredShell({ state, dispatch, focusRef }) {
  const { doc, view } = state;
  const { Editor, Settings } = EDITORS[doc.kind];
  const settings = Settings ? <GridSettings Settings={Settings} model={doc.model} dispatch={dispatch} /> : null;
  // Once per document: the shell is keyed by doc id, so this runs on open only.
  useEffect(() => maybeFocusBoard(view, state.dialog), []);
  const fillClues = <FillCluesButton model={doc.model} dispatch={dispatch} />;
  const header = <PuzzleBox model={doc.model} dispatch={dispatch} />;
  // Ctrl+Z and redo step the document's history from every field in the editor, never
  // the browser's own text undo, whose input event would commit its result as a new step
  // and clear redo.
  return (
    <PopoverScope.Provider value={`${doc.id}:${view}`}>
      <div class="ed structured" onKeyDown={undoRedoKeys(dispatch)}>
        <Editor state={state} dispatch={dispatch} model={doc.model} phase={view === 'clues' ? 'clues' : 'board'} focusRef={focusRef} settings={settings} fillClues={fillClues} header={header} />
      </div>
    </PopoverScope.Provider>
  );
}
