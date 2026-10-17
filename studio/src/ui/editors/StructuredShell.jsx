import { useState } from 'preact/hooks';
import { EDITORS } from './index.js';
import { HeaderForm } from './HeaderForm.jsx';

// The Edit view of a structured document: the Editor / YAML switch, the kind's editor,
// and last the header form, away from the editing controls. Key it by document id so a
// new document starts on the Selected entry view.
export function StructuredShell({ state, dispatch, focusRef, onEditYaml }) {
  const { doc, completeness } = state;
  const { Editor, Settings } = EDITORS[doc.kind];
  const [clueView, setClueView] = useState('selected');
  const canYaml = completeness.length === 0;
  return (
    <div class="ed structured">
      <div class="ed-head">
        <span id="mode-switch" class="seg small" role="group" aria-label="Editing mode">
          <button type="button" class="seg-btn" aria-pressed="true">Editor</button>
          <button type="button" id="btn-edit-yaml" class="seg-btn" aria-pressed="false" disabled={!canYaml}
            title={canYaml ? undefined : 'The YAML can only show a complete puzzle: finish the cells and clues first.'}
            onClick={onEditYaml}>YAML</button>
        </span>
        <p class="ed-hint">Changes save as you go.</p>
      </div>
      <Editor state={state} dispatch={dispatch} model={doc.model} clueView={clueView} setClueView={setClueView} focusRef={focusRef} />
      <HeaderForm model={doc.model} dispatch={dispatch} Settings={Settings} />
    </div>
  );
}
