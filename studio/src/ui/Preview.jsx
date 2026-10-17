import { useEffect, useRef, useState } from 'preact/hooks';
import { VALID_THEMES } from '../../../shared/build/themeRegistry.js';
import { previewHtml, previewIsStale } from '../model/app.js';
import { solveTimeFromMessage, formatSolveTime } from '../model/solve.js';

const DEFAULT_THEME = 'broadsheet';

// The Test-solve view: the real built page in a sandboxed frame. The frame has no
// allow-same-origin, so the engines' storage throws (and they carry on without saving)
// and the preview can't reach the studio's drafts; see spec §7.
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

  const theme = muddled ? (doc.muddled.theme ?? DEFAULT_THEME) : (check?.theme ?? DEFAULT_THEME);
  const setOption = (key, value) => dispatch({ type: 'SET_OPTION', key, value, now: Date.now() });

  return (
    <>
      <div class="pv-bar">
        <span class="lbl">Puzzle page</span>
        <label class="check">Theme{' '}
          <select id="opt-theme" value={theme} disabled={!muddled}
            title={muddled ? undefined : 'Set `theme:` in the YAML to change it'}
            onChange={e => dispatch({ type: 'SET_MUDDLED_THEME', theme: e.currentTarget.value, now: Date.now() })}>
            {VALID_THEMES.map(t => <option value={t} key={t}>{t}</option>)}
          </select>
        </label>
        <label class={'check' + (muddled ? ' off' : '')}>
          <input type="checkbox" id="opt-hashed" checked={muddled || doc.options.hashedPreview} disabled={muddled}
            onChange={e => setOption('hashedPreview', e.currentTarget.checked)} /> Answers hidden
        </label>
        <label class="check">
          <input type="checkbox" id="opt-phone" checked={doc.options.phoneWidth}
            onChange={e => setOption('phoneWidth', e.currentTarget.checked)} /> Phone width
        </label>
        <span class="pv-end">
          {previewIsStale(state) && <span id="preview-stale" class="badge stale">Out of date: fix the problems to rebuild</span>}
          {solvedMs !== null && <span id="preview-solved" class="badge solved">Test-solved in {formatSolveTime(solvedMs)}</span>}
        </span>
      </div>
      <div class="pv-stage">
        <iframe id="preview" ref={frameRef} title="Puzzle preview" sandbox="allow-scripts"
          srcdoc={html ?? ''} class={doc.options.phoneWidth ? 'phone' : ''} />
        {!html && <p class="pv-empty">Nothing to preview yet. Fix the problems to build the puzzle page.</p>}
      </div>
    </>
  );
}
