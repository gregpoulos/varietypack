import { useState, useEffect } from 'preact/hooks';
import { problemsLabel } from '../model/app.js';
import { canUndo, canRedo } from '../model/history.js';
import { Diagnostics } from './Diagnostics.jsx';
import { kindName } from './kinds.js';

export function Toolbar({ state, dispatch, title, saveFailed, onHome, onOpen, onSaveDraft, onJump }) {
  const { doc, check, view, history, completeness } = state;
  const structured = doc.mode === 'structured';
  const muddled = doc.mode === 'muddled';
  const label = problemsLabel(state);
  const [pop, setPop] = useState(null);

  // Close a popover on an outside press or Escape.
  useEffect(() => {
    if (!pop) return undefined;
    const away = e => { if (!e.target.closest('.pop, [data-pop]')) setPop(null); };
    const esc = e => { if (e.key === 'Escape') setPop(null); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [pop]);

  const toggle = name => setPop(p => (p === name ? null : name));
  const menu = fn => () => { setPop(null); fn(); };

  return (
    <header id="toolbar">
      <button type="button" id="btn-home" class="home" aria-label="Back to the start screen" onClick={onHome}>‹ Studio</button>
      <div class="doc">
        <span id="doc-title">{title}</span>
        <span id="doc-meta">{muddled ? 'Muddled file · answers hidden' : kindName(doc.kind)}</span>
      </div>
      {!muddled && (
        <span id="save-status" class={saveFailed ? 'failed' : ''}>
          {saveFailed ? 'Not saved: browser storage is unavailable' : 'Saved in this browser'}
        </span>
      )}
      {!muddled && (
        <div class="top-mid">
          <span id="view-switch" class="seg" role="group" aria-label="View">
            <button type="button" class="seg-btn" data-view="edit" aria-pressed={view === 'edit'}
              onClick={() => dispatch({ type: 'SET_VIEW', view: 'edit' })}>Edit</button>
            <button type="button" class="seg-btn" data-view="test" aria-pressed={view === 'test'}
              onClick={() => dispatch({ type: 'SET_VIEW', view: 'test' })}>Test-solve</button>
          </span>
          <span class="anchor">
            <button type="button" id="problems-chip" class={label.tone} data-pop="problems"
              aria-expanded={pop === 'problems'} onClick={() => toggle('problems')}>{label.text}</button>
            {pop === 'problems' && (
              <Diagnostics check={label.tone === 'busy' ? null : check} completeness={structured ? completeness : []}
                onJump={t => { setPop(null); onJump(t); }} />
            )}
          </span>
        </div>
      )}
      <div class="top-end">
        {structured && (
          <>
            <button type="button" id="btn-undo" class="btn ghost" aria-label="Undo" disabled={!canUndo(history)}
              onClick={() => dispatch({ type: 'UNDO', now: Date.now() })}>↶</button>
            <button type="button" id="btn-redo" class="btn ghost" aria-label="Redo" disabled={!canRedo(history)}
              onClick={() => dispatch({ type: 'REDO', now: Date.now() })}>↷</button>
          </>
        )}
        <span class="anchor">
          <button type="button" id="btn-more" class="btn" data-pop="more" aria-label="More"
            aria-expanded={pop === 'more'} onClick={() => toggle('more')}>⋯</button>
          {pop === 'more' && (
            <div class="pop right">
              <button type="button" id="btn-new" class="menu-item" onClick={menu(onHome)}>
                New puzzle…<small>Back to the start screen’s kinds and examples</small>
              </button>
              <button type="button" id="btn-open" class="menu-item" onClick={menu(onOpen)}>Open a file…</button>
              {!muddled && (
                <button type="button" id="btn-save-draft" class="menu-item" onClick={menu(onSaveDraft)}>
                  Download draft file<small>Keeps a copy you can open again, problems and all</small>
                </button>
              )}
            </div>
          )}
        </span>
        <button type="button" id="btn-export" class="btn primary"
          onClick={() => dispatch({ type: 'SHOW_DIALOG', name: 'export' })}>Export…</button>
      </div>
    </header>
  );
}
