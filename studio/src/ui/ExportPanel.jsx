import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { VALID_THEMES } from '../../../shared/build/themeRegistry.js';
import { canExport } from '../model/app.js';
import { puzzleText } from '../model/doc.js';
import { exportFileName } from '../model/filenames.js';
import { buildExport, yamlSaves, previewTheme, themeHasFont, themeApplies } from '../model/exporters.js';
import { download } from './download.js';
import { Latch } from './Latch.jsx';

function kb(bytes) {
  return bytes < 1000 ? `${bytes} B` : `${Math.round(bytes / 1000)} KB`;
}

// Any valid ISO time will do: only the file's size is wanted from this one.
const SIZING_TIME = '2000-01-01T00:00:00.000Z';

// What a button would save: its file name and size, or null when it can't be built.
function describe(target, doc, title, opts) {
  try {
    const out = buildExport(target, doc, { ...opts, savedAtIso: SIZING_TIME });
    return { name: exportFileName(title, out.type), size: new Blob([out.text]).size };
  } catch { return null; }
}

// A modal <dialog>: Escape or Close hide it. Its theme and Hide answers start from the
// preview's each time it opens (the panel mounts per opening) and never change the
// preview. Downloading a page, or a hidden-answers YAML, needs a clean check of the
// current text (canExport), and being modal, the dialog keeps the text from changing
// under it; plain YAML and drafts always save.
export function ExportPanel({ state, dispatch, title }) {
  const { doc, check } = state;
  const ref = useRef(null);
  const muddled = doc.mode === 'muddled';
  // Seeded once at mount. Accepted edge: a YAML-mode file whose theme: is known only from
  // the check falls back to the default if Export opens before the first check lands.
  const [theme, setTheme] = useState(() => previewTheme(doc, check));
  const [hide, setHide] = useState(() => muddled || !!doc.options.hashedPreview);
  const valid = canExport(state);
  const font = doc.options.font;
  const saves = yamlSaves(doc);
  // The check for the text as it is now, or null while one is pending.
  const current = check && state.checkedText === puzzleText(doc) ? check : null;
  // Hide answers counts as off while it is disabled, but its latch keeps its position.
  const hideAnswers = muddled || (valid && hide);
  const opts = { font, theme, hideAnswers };

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const pageInfo = useMemo(() => (valid ? describe('page', doc, title, opts) : null),
    [valid, doc, title, font, theme, hideAnswers]);
  const yamlInfo = useMemo(() => describe('yaml', doc, title, opts),
    [doc, title, font, theme, hideAnswers]);

  const pageReason = saves === 'draft' ? 'Finish the puzzle first.'
    : !current ? ''
    : current.parseError ? 'Fix the YAML error first.'
    : current.errors.length ? `Fix ${current.errors.length} problem${current.errors.length === 1 ? '' : 's'} first.`
    : '';
  const hideReason = muddled ? 'This file already has its answers hidden.' : '';
  // Hide answers is offered only for a puzzle that can have them hidden: its row is
  // gone for a draft or a current check with errors, and merely disabled while pending.
  const hideUnavailable = !muddled && (saves === 'draft' || (!!current && !valid));
  // From the text itself, so it is right while a check is pending.
  const themeLocked = !themeApplies(doc);
  const themeReason = themeLocked && saves !== 'draft' ? 'The YAML doesn’t parse, so it saves as typed.' : '';

  function onDownload(target) {
    try {
      const out = buildExport(target, doc, { ...opts, savedAtIso: new Date().toISOString() });
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
      <span class="slot l" aria-hidden="true"></span>
      <span class="slot r" aria-hidden="true"></span>
      <div class="sheet-head">
        <h2 id="export-title" class="legend">Export</h2>
        <button type="button" id="export-close" class="btn" onClick={() => ref.current.close()}>Close</button>
      </div>
      <fieldset id="export-file" class="engraved">
        <legend>File</legend>
        <div class="form">
          <label class="legend" for="export-theme">Theme</label>
          <div>
            <select id="export-theme" class="readout" value={theme} disabled={themeLocked}
              aria-describedby={themeReason ? 'export-theme-reason' : undefined}
              onChange={e => setTheme(e.currentTarget.value)}>
              {VALID_THEMES.map(t => <option value={t} key={t}>{t}</option>)}
            </select>
            {themeReason && <p id="export-theme-reason" class="note-line">{themeReason}</p>}
          </div>
          {/* One wrapper carries `hidden`; display: contents puts its three children in
              the form's grid. */}
          <div class="export-hide" hidden={hideUnavailable}>
            <span class="legend" id="export-answers-label">Answers</span>
            <div>
              <Latch id="export-answers" label="Answers" value={(muddled || hide) ? 'hidden' : 'shown'}
                disabled={muddled || !valid} describedBy="export-answers-note"
                options={[{ value: 'shown', text: 'Shown', led: 'amber' }, { value: 'hidden', text: 'Hidden', led: 'amber' }]}
                onChange={v => setHide(v === 'hidden')} />
              <p id="export-answers-note" class="note-line">
                {hideReason || 'Solvers can still check their answers, but can’t read them in the file.'}
              </p>
            </div>
          </div>
          {themeHasFont(theme) && (
            <>
              <span class="legend" id="export-font-label">Font</span>
              <div>
                <Latch id="export-font" label="Font" value={font} describedBy="export-font-note"
                  options={[{ value: 'embed', text: 'Built in', led: 'amber' }, { value: 'link', text: 'Google Fonts', led: 'amber' }]}
                  onChange={v => { if (v !== font) dispatch({ type: 'SET_OPTION', key: 'font', value: v, now: Date.now() }); }} />
                <p id="export-font-note" class="note-line">
                  Built in: works offline. Google Fonts: loaded when the page opens. This depends on where the page will live, not on the puzzle, so it isn’t part of the puzzle file.
                </p>
              </div>
            </>
          )}
        </div>
      </fieldset>
      <fieldset id="export-download" class="engraved">
        <legend>Download</legend>
        <div class="dl">
          <button type="button" id="export-page" class="btn red" disabled={!valid}
            onClick={() => onDownload('page')}>Download web page</button>
          <p id="export-page-note">
            {pageInfo ? <span class="tape tag"><code>{pageInfo.name}</code> <span class="size">{kb(pageInfo.size)}</span></span> : pageReason}
          </p>
          <button type="button" id="export-yaml" class="btn" onClick={() => onDownload('yaml')}>
            {saves === 'draft' ? 'Download draft' : 'Download YAML'}</button>
          <p id="export-yaml-note">
            {saves === 'draft' && 'Saves a draft you can reopen in the studio. '}
            {yamlInfo && <span class="tape tag"><code>{yamlInfo.name}</code> <span class="size">{kb(yamlInfo.size)}</span></span>}
            {saves !== 'draft' && !hideAnswers && !muddled && current && (current.parseError || current.errors.length > 0)
              && ' Saved as it stands, problems included.'}
          </p>
        </div>
      </fieldset>
    </dialog>
  );
}
