import { useEffect, useRef, useState } from 'preact/hooks';
import { VALID_THEMES } from '../../../shared/build/themeRegistry.js';
import { previewHtml, previewIsStale, usesPlaceholders } from '../model/app.js';
import { previewTheme } from '../model/exporters.js';
import { solveTimeFromMessage, formatSolveTime } from '../model/solve.js';
import { LatchKey } from './Latch.jsx';

// The Test-solve view: the real built page in a sandboxed frame. The frame has no
// allow-same-origin, so the engines' storage throws (and they carry on without saving)
// and the preview can't reach the studio's drafts.
export function Preview({ state, dispatch }) {
  const { doc, check } = state;
  const muddled = doc.mode === 'muddled';
  const html = previewHtml(state);
  const frameRef = useRef(null);
  const [solvedMs, setSolvedMs] = useState(null);

  // A rebuilt page is a new solve.
  useEffect(() => { setSolvedMs(null); }, [html]);

  useEffect(() => {
    function onMessage(e) {
      // A sandboxed frame's origin is "null", so trust the source window, not the origin.
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const ms = solveTimeFromMessage(e.data);
      if (ms !== null) setSolvedMs(ms);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const setOption = (key, value) => dispatch({ type: 'SET_OPTION', key, value, now: Date.now() });

  return (
    <>
      <div class="pv-bar">
        <span class="legend">Puzzle page</span>
        <label class="theme-pick"><span class="legend">Theme</span>
          <select id="opt-theme" class="readout" value={previewTheme(doc, check)}
            onChange={e => setOption('previewTheme', e.currentTarget.value)}>
            {VALID_THEMES.map(t => <option value={t} key={t}>{t}</option>)}
          </select>
        </label>
        <LatchKey id="opt-hashed" checked={muddled || doc.options.hashedPreview} disabled={muddled}
          onChange={v => setOption('hashedPreview', v)}>Answers hidden</LatchKey>
        <LatchKey id="opt-phone" checked={doc.options.phoneWidth}
          onChange={v => setOption('phoneWidth', v)}>Phone width</LatchKey>
        <span class="pv-end">
          <span id="preview-placeholders" class="status" hidden={!usesPlaceholders(state)}>Empty clues show placeholder text here</span>
          {previewIsStale(state) && (
            <span id="preview-stale" class="status"><span class="led red lit" aria-hidden="true"></span>Out of date: fix the problems to rebuild</span>
          )}
          {solvedMs !== null && (
            <span id="preview-solved" class="status"><span class="led green lit" aria-hidden="true"></span>Test-solved in {formatSolveTime(solvedMs)}</span>
          )}
        </span>
      </div>
      <div class="pv-stage">
        {/* Keyed by its page: a new page in an existing frame is a navigation, which the
            browser adds to the session history (Back would step through it), where a new
            frame's first page replaces nothing. Both reload it, so a test-solve is lost
            either way. */}
        <iframe id="preview" key={html ?? ''} ref={frameRef} title="Puzzle preview" sandbox="allow-scripts"
          srcdoc={html ?? ''} class={doc.options.phoneWidth ? 'phone' : ''} />
        {!html && <p class="pv-empty">Nothing to preview yet. Fix the problems to build the puzzle page.</p>}
      </div>
    </>
  );
}
