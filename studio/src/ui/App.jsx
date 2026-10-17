import { useReducer, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import core from '../core/index.js';
import { initialState, reduce } from '../model/app.js';
import { newDoc, openText, puzzleText, toYamlMode, toStructuredMode } from '../model/doc.js';
import { STRUCTURED } from '../model/kinds/index.js';
import { serializeDraft, parseDraft } from '../model/drafts.js';
import { exportFileName } from '../model/filenames.js';
import { Welcome } from './Welcome.jsx';
import { Toolbar } from './Toolbar.jsx';
import { YamlEditor } from './YamlEditor.jsx';
import { MuddledPanel } from './MuddledPanel.jsx';
import { StructuredShell } from './editors/StructuredShell.jsx';
import { Preview } from './Preview.jsx';
import { ExportPanel } from './ExportPanel.jsx';
import { TEMPLATES } from './templates.js';
import { loadIndex, saveDraft, loadDraft, deleteDraft } from './storage.js';
import { download } from './download.js';

const CHECK_DELAY_MS = 300;
const SAVE_DELAY_MS = 1000;

const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const titleOf = (s) => s.check?.title
  ?? (s.doc.mode === 'muddled' ? s.doc.muddled.title : null)
  ?? (s.doc.mode === 'structured' ? s.doc.model.header.title || null : null)
  ?? s.doc.kind ?? 'Untitled';

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState(loadIndex()));
  const { doc } = state;
  const muddled = !!doc && doc.mode === 'muddled';

  const stateRef = useRef(state);
  stateRef.current = state;
  const inputRef = useRef(null);
  const focusRef = useRef(null);   // the open structured editor registers where diagnostics should jump
  const [saveFailed, setSaveFailed] = useState(false);

  const text = useMemo(
    () => (doc ? puzzleText(doc) : null),
    [doc && doc.mode, doc && doc.yaml, doc && doc.muddled, doc && doc.model],
  );
  const hashedPreview = !!doc && doc.options.hashedPreview;

  // Diagnostics loop: validate and build the current text once typing pauses. The preview
  // always embeds the font, so the studio never touches the network; options.font only
  // applies to exports.
  useEffect(() => {
    if (text == null) return undefined;
    const timer = setTimeout(() => {
      const result = core.checkText(text, { font: 'embed', muddle: hashedPreview });
      dispatch({ type: 'CHECK_RESULT', text, result });
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, hashedPreview]);

  // Autosave: a draft is written once edits pause, and straight away when the document is
  // left (flushDraft), so an edit made just before leaving isn't lost.
  const pendingSave = useRef(false);
  function flushDraft() {
    if (!pendingSave.current) return;
    pendingSave.current = false;
    const s = stateRef.current;
    if (!s.doc || s.doc.mode === 'muddled') return;
    setSaveFailed(!saveDraft(s.doc, titleOf(s)));
    dispatch({ type: 'DRAFTS_CHANGED', drafts: loadIndex() });
  }
  useEffect(() => {
    if (!doc || doc.mode === 'muddled') return undefined;
    pendingSave.current = true;
    const timer = setTimeout(flushDraft, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc]);
  useEffect(() => {
    window.addEventListener('pagehide', flushDraft);
    return () => window.removeEventListener('pagehide', flushDraft);
  }, []);

  function openDoc(next, message) {
    flushDraft();
    dispatch({ type: 'OPEN_DOC', doc: next, message });
  }
  function createStructured(kind, size) {
    openDoc(newDoc({ id: newId(), now: Date.now(), kind, size }));
  }
  function editAsYaml() {
    try {
      dispatch({ type: 'SWITCH_MODE', doc: toYamlMode(doc) });
    } catch (err) {
      dispatch({ type: 'SHOW_MESSAGE', text: err.message });
    }
  }
  function backToEditor() {
    try {
      const { doc: next, notice } = toStructuredMode(doc);
      dispatch({ type: 'SWITCH_MODE', doc: next, message: notice });
    } catch (err) {
      dispatch({ type: 'SHOW_MESSAGE', text: `Can’t open the editor: ${err.message}` });
    }
  }
  function openExample(kind) {
    openDoc(newDoc({ id: newId(), now: Date.now(), kind, yaml: TEMPLATES[kind] }));
  }
  function goHome() {
    flushDraft();
    dispatch({ type: 'CLOSE_DOC' });
  }
  function openDraft(id) {
    const found = loadDraft(id);
    if (found) openDoc(found);
    else dispatch({ type: 'SHOW_MESSAGE', text: 'That draft couldn’t be opened.' });
  }
  function removeDraft(id) {
    deleteDraft(id);
    dispatch({ type: 'DRAFTS_CHANGED', drafts: loadIndex() });
  }
  async function onFileChosen(e) {
    const file = e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!file) return;
    try {
      const body = await file.text();
      // A draft file gets a fresh id, so opening an old copy never overwrites the
      // browser's newer draft.
      if (/\.json$/i.test(file.name)) {
        openDoc({ ...parseDraft(body), id: newId() });
      } else {
        const { doc: opened, notice } = openText(body, { id: newId(), now: Date.now() });
        openDoc(opened, notice);
      }
    } catch (err) {
      dispatch({ type: 'SHOW_MESSAGE', text: `Couldn’t open ${file.name}: ${err.message}` });
    }
  }
  function saveDraftFile() {
    download(exportFileName(titleOf(state), 'draft'), serializeDraft(doc, new Date().toISOString()), 'application/json');
  }
  const pickFile = () => inputRef.current.click();

  return (
    <div id="studio">
      {doc ? (
        <Toolbar state={state} dispatch={dispatch} title={titleOf(state)} saveFailed={saveFailed}
          onHome={goHome} onOpen={pickFile} onSaveDraft={saveDraftFile}
          onJump={target => focusRef.current && focusRef.current(target)} />
      ) : (
        <header id="toolbar">
          <span class="brand">Varietypack Studio</span>
          <div class="top-end">
            <button type="button" id="btn-open" class="btn" onClick={pickFile}>Open a file…</button>
          </div>
        </header>
      )}
      <input id="open-input" type="file" accept=".yaml,.yml,.json" hidden onChange={onFileChosen} ref={inputRef} />
      {state.message && (
        <div id="message" role="status">
          <span>{state.message}</span>
          <button type="button" id="message-close" class="btn ghost" onClick={() => dispatch({ type: 'CLEAR_MESSAGE' })}>Dismiss</button>
        </div>
      )}
      <div class={'body' + (muddled ? ' muddled' : '')}>
        {!doc && (
          <Welcome drafts={state.drafts} onNew={openExample} onCreate={createStructured} onExample={openExample}
            onOpenDraft={openDraft} onDeleteDraft={removeDraft} />
        )}
        {doc && !muddled && (
          <section id="edit-view" class="pane-scroll" hidden={state.view !== 'edit'}>
            {doc.mode === 'structured'
              ? <StructuredShell key={doc.id} state={state} dispatch={dispatch} focusRef={focusRef} onEditYaml={editAsYaml} />
              : (
                <YamlEditor value={doc.yaml} onInput={t => dispatch({ type: 'SET_YAML', text: t, now: Date.now() })}
                  canReturn={Object.hasOwn(STRUCTURED, doc.kind)} onReturn={backToEditor} />
              )}
          </section>
        )}
        {muddled && (
          <MuddledPanel doc={doc} check={state.check}
            onTheme={theme => dispatch({ type: 'SET_MUDDLED_THEME', theme, now: Date.now() })}
            onExport={() => dispatch({ type: 'SHOW_DIALOG', name: 'export' })} />
        )}
        {doc && (
          // Always mounted, and hidden rather than removed while Edit shows: an unmounted
          // frame reloads, which would lose a test-solve in progress.
          <section id="test-view" class="pane-preview" hidden={!muddled && state.view !== 'test'}>
            <Preview state={state} dispatch={dispatch} />
          </section>
        )}
      </div>
      {doc && state.dialog === 'export' && <ExportPanel state={state} dispatch={dispatch} title={titleOf(state)} />}
    </div>
  );
}
