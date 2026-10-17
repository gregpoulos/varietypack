import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import core from '../core/index.js';
import { canExport } from '../model/app.js';
import { puzzleText } from '../model/doc.js';
import { exportFileName } from '../model/filenames.js';
import { exportList, buildExport, themeOf, themeHasFont } from '../model/exporters.js';
import { download } from './download.js';
import { EmbedDialog } from './EmbedDialog.jsx';

function kb(bytes) {
  return bytes < 1000 ? `${bytes} B` : `${Math.round(bytes / 1000)} KB`;
}

function blockedText(check) {
  if (!check) return 'Still checking the puzzle. This takes a moment.';
  const lead = check.parseError
    ? 'Fix the YAML error first; nothing exports until it’s fixed.'
    : `Fix the ${check.errors.length} problem${check.errors.length === 1 ? '' : 's'} first; nothing exports until they’re fixed. Warnings don’t block export.`;
  return `${lead} Your work is safe: drafts save as you go, and Download draft file in the ⋯ menu keeps a copy.`;
}

// A modal <dialog>: Escape or Close hide it, and every download is refused unless the
// real validator reports no errors (spec §6 and §8).
export function ExportPanel({ state, dispatch, title }) {
  const { doc, check } = state;
  const ref = useRef(null);
  const [embedOpen, setEmbedOpen] = useState(false);
  const muddled = doc.mode === 'muddled';
  const can = canExport(state);
  const font = doc.options.font;
  const theme = themeOf(doc, check);
  const files = exportList(doc);
  // The check for the text as it is now, or null while one is pending.
  const current = check && state.checkedText === puzzleText(doc) ? check : null;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Each size comes from the same call its button makes.
  const sizes = useMemo(() => {
    if (!can) return {};
    const out = {};
    for (const f of files.filter(x => !x.dialog)) {
      try { out[f.id] = new Blob([buildExport(f.id, doc, { font }).text]).size; } catch { /* shown without a size */ }
    }
    return out;
  }, [can, font, doc]);

  function onDownload(file) {
    if (file.dialog) { setEmbedOpen(true); return; }
    // The debounced check may be behind the editor, so check the current text again.
    const fresh = core.checkText(puzzleText(doc), { font: 'embed' });
    if (fresh.parseError || fresh.errors.length) {
      dispatch({ type: 'SHOW_MESSAGE', text: 'Export stopped: the puzzle has problems. Fix them first.' });
      dispatch({ type: 'HIDE_DIALOG' });
      return;
    }
    try {
      const out = buildExport(file.id, doc, { font });
      download(exportFileName(title, out.type), out.text, out.mime);
    } catch (err) {
      dispatch({ type: 'SHOW_MESSAGE', text: `Export failed: ${err.message}` });
      dispatch({ type: 'HIDE_DIALOG' });
    }
  }

  return (
    <dialog id="export-panel" ref={ref} aria-labelledby="export-title"
      onClose={() => dispatch({ type: 'HIDE_DIALOG' })}
      onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <div class="sheet-head">
        <div>
          <h2 id="export-title">Export</h2>
          <p>Theme: {theme}. {muddled
            ? 'Change it beside the preview.'
            : 'It’s saved with the puzzle: set it with the theme: line in the YAML.'}</p>
        </div>
        <button type="button" id="export-close" class="btn" onClick={() => ref.current.close()}>Close</button>
      </div>
      {!can && <div id="export-blocked">{blockedText(current)}</div>}
      <ul class="files">
        {files.map(f => (
          <li class={'export-file' + (f.best ? ' best' : '')} key={f.id}>
            <h3>{f.name} {f.best && <span class="best-tag">Best for sharing</span>}</h3>
            <p>
              <code>{exportFileName(title, f.type)}</code>{' '}
              {sizes[f.id] != null && <span class="size">{kb(sizes[f.id])}</span>}
              <br />{f.desc}
            </p>
            <button type="button" id={`export-${f.id}`} class={'btn' + (f.best ? ' primary' : '')}
              disabled={!can} onClick={() => onDownload(f)}>{f.dialog ? 'Set up…' : 'Download'}</button>
          </li>
        ))}
      </ul>
      {themeHasFont(theme) && (
        <fieldset id="export-font">
          <legend>Font</legend>
          <label><input type="radio" name="export-font" value="embed" checked={font === 'embed'}
            onChange={() => dispatch({ type: 'SET_OPTION', key: 'font', value: 'embed', now: Date.now() })} />
            <span><b>Built into the page.</b> Works offline.</span></label>
          <label><input type="radio" name="export-font" value="link" checked={font === 'link'}
            onChange={() => dispatch({ type: 'SET_OPTION', key: 'font', value: 'link', now: Date.now() })} />
            <span><b>Loaded from Google Fonts</b> when the page opens.</span></label>
          <p>This depends on where the page will live, not on the puzzle, so it isn’t part of the puzzle file.</p>
        </fieldset>
      )}
      {embedOpen && <EmbedDialog doc={doc} font={font} title={title} dispatch={dispatch} onClose={() => setEmbedOpen(false)} />}
    </dialog>
  );
}
