import { problemsLabel } from '../model/app.js';
import { canUndo, canRedo } from '../model/history.js';
import { Diagnostics } from './Diagnostics.jsx';
import { usePopover } from './usePopover.js';

const EDIT_YAML_BLOCKED = 'Resolve the puzzle’s problems (finish the cells and clues) before editing it as YAML.';

export function Toolbar({ state, dispatch, title, saveFailed, onHome, onJump, onEditYaml, canYaml, onReturn, canReturn }) {
  const { doc, check, view, history, completeness } = state;
  const structured = doc.mode === 'structured';
  const muddled = doc.mode === 'muddled';
  const label = problemsLabel(state);
  const resetKey = `${doc.id}:${view}`;
  const problems = usePopover(resetKey);
  const yaml = doc.mode === 'yaml';
  const steps = yaml
    ? [['board', 'YAML'], ['test', 'Test-solve']]
    : [['board', 'Board'], ['clues', 'Clues'], ['test', 'Test-solve']];

  return (
    <header id="toolbar">
      <span class="slot l" aria-hidden="true"></span>
      <button type="button" id="btn-home" class="btn quiet" aria-label="Back to the start screen" onClick={onHome}>‹ Studio</button>
      {muddled && (
        <div class="doc">
          <span id="doc-title">{title}</span>
          <span id="doc-meta">Answers hidden</span>
        </div>
      )}
      {!muddled && (
        <span id="save-status" class={saveFailed ? 'failed' : ''}>
          {saveFailed ? 'Not saved: browser storage is unavailable' : 'Saved in this browser'}
        </span>
      )}
      {!muddled && (
        <div class="top-mid">
          <nav id="phase-steps" aria-label="Steps">
            {steps.map(([v, text]) => (
              <button type="button" key={v} class="btn step" data-view={v}
                aria-current={view === v ? 'step' : undefined}
                onClick={() => dispatch({ type: 'SET_VIEW', view: v })}>{text}</button>
            ))}
          </nav>
          <span class="anchor" ref={problems.ref}>
            <button type="button" id="problems-chip" class={label.tone}
              aria-expanded={problems.open} onClick={problems.toggle}>{label.text}</button>
            {problems.open && (
              <Diagnostics check={label.tone === 'busy' ? null : check} completeness={structured ? completeness : []}
                onJump={t => { problems.close(); onJump(t); }} />
            )}
          </span>
        </div>
      )}
      <div class="top-end">
        {structured && (
          <>
            <button type="button" id="btn-undo" class="btn" disabled={!canUndo(history)}
              onClick={() => dispatch({ type: 'UNDO', now: Date.now() })}><span aria-hidden="true">↶</span> <span class="btn-word">Undo</span></button>
            <button type="button" id="btn-redo" class="btn" disabled={!canRedo(history)}
              onClick={() => dispatch({ type: 'REDO', now: Date.now() })}><span aria-hidden="true">↷</span> <span class="btn-word">Redo</span></button>
          </>
        )}
        {structured && (
          // aria-disabled, not disabled: Firefox shows no tooltip on a disabled button,
          // so the reason is the title and, for touch (no hover), a message on click.
          <button type="button" id="btn-edit-yaml" class="btn" aria-disabled={canYaml ? undefined : 'true'}
            title={canYaml ? undefined : EDIT_YAML_BLOCKED}
            onClick={canYaml ? onEditYaml : () => dispatch({ type: 'SHOW_MESSAGE', text: EDIT_YAML_BLOCKED })}>Edit as YAML</button>
        )}
        {yaml && canReturn && (
          <button type="button" id="btn-back-to-editor" class="btn" onClick={onReturn}>Back to the editor</button>
        )}
        <button type="button" id="btn-export" class="btn red"
          onClick={() => dispatch({ type: 'SHOW_DIALOG', name: 'export' })}>Export…</button>
      </div>
      <span class="slot r" aria-hidden="true"></span>
    </header>
  );
}
