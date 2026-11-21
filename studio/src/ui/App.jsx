import { useReducer, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import core from '../core/index.js';
import { initialState, reduce, phaseForJump } from '../model/app.js';
import { newDoc, openText, puzzleText, previewText, toYamlMode, toStructuredMode } from '../model/doc.js';
import { STRUCTURED } from '../model/kinds/index.js';
import { parseDraft } from '../model/drafts.js';
import { routeOf, formatRoute, parseRoute, historyStep } from '../model/route.js';
import { Welcome } from './Welcome.jsx';
import { Toolbar } from './Toolbar.jsx';
import { YamlEditor } from './YamlEditor.jsx';
import { MuddledPanel } from './MuddledPanel.jsx';
import { StructuredShell } from './editors/StructuredShell.jsx';
import { Preview } from './Preview.jsx';
import { ExportPanel } from './ExportPanel.jsx';
import { TEMPLATES } from './templates.js';
import { loadIndex, saveDraft, loadDraft, deleteDraft } from './storage.js';

const CHECK_DELAY_MS = 300;
const SAVE_DELAY_MS = 1000;

const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const titleOf = (s) => s.check?.title
  ?? (s.doc.mode === 'muddled' ? s.doc.muddled.title : null)
  ?? (s.doc.mode === 'structured' ? s.doc.model.header.title || null : null)
  ?? s.doc.kind ?? 'Untitled';

const MISSING = 'That puzzle isn’t saved in this browser.';

// The actions that show `route` once the studio is on another screen: the saved puzzle
// with the route's view, or, when there is none (a muddled route is never saved, and a
// draft can be deleted), the start screen with a note.
function openActions(route) {
  if (route.screen === 'doc') {
    const found = loadDraft(route.id);
    if (found) return [{ type: 'OPEN_DOC', doc: found, view: route.view }];
  }
  return [{ type: 'SHOW_MESSAGE', text: MISSING }];
}

// The state to start in, read from the address. `fix` is true when the address has to be
// rewritten to the start screen's.
function bootState() {
  let s = initialState(loadIndex());
  const route = parseRoute(location.hash);
  if (!route) return { state: s, fix: true };
  if (route.screen === 'home') return { state: s, fix: false };
  for (const a of openActions(route)) s = reduce(s, a);
  return { state: s, fix: !s.doc };
}

export function App() {
  const [boot] = useState(bootState);
  const [state, dispatch] = useReducer(reduce, boot.state);
  const { doc } = state;
  const muddled = !!doc && doc.mode === 'muddled';

  const stateRef = useRef(state);
  stateRef.current = state;
  const inputRef = useRef(null);
  const focusRef = useRef(null);   // the open structured editor registers where diagnostics should jump
  const pendingJump = useRef(null);   // a problem jump waiting for its phase to render
  const [saveFailed, setSaveFailed] = useState(false);
  // The next address change rewrites the entry instead of adding one: at boot when the
  // address names nothing the studio can show, and where CLOSE_DOC will change the
  // address. The address layout effect consumes it, so it is never left set.
  const replaceNext = useRef(boot.fix);

  const text = useMemo(
    () => (doc ? puzzleText(doc) : null),
    [doc && doc.mode, doc && doc.yaml, doc && doc.muddled, doc && doc.model],
  );
  // The preview's text when `text` is null (see the header of model/placeholderClues.js).
  const placeholderText = useMemo(
    () => (doc && text === null ? previewText(doc) : null),
    [doc && doc.mode, doc && doc.model],
  );
  const hashedPreview = !!doc && doc.options.hashedPreview;
  const previewTheme = doc ? doc.options.previewTheme : null;

  // Diagnostics loop: validate and build the current text once typing pauses. The preview
  // always embeds the font, so the studio never touches the network; options.font only
  // applies to exports.
  useEffect(() => {
    if (text == null) return undefined;
    const timer = setTimeout(() => {
      const result = core.checkText(text, {
        font: 'embed', muddle: hashedPreview,
        // Only when chosen: validateBuildOptions rejects `theme: null`, and leaving it
        // out lets check.theme report the file's own.
        ...(previewTheme !== null && { theme: previewTheme }),
      });
      dispatch({ type: 'CHECK_RESULT', text, result });
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc?.id, text, hashedPreview, previewTheme]);

  // The check of the placeholder text, kept apart from the real one (see
  // model/placeholderClues.js).
  useEffect(() => {
    if (placeholderText == null) return undefined;
    const timer = setTimeout(() => {
      const result = core.checkText(placeholderText, {
        font: 'embed', muddle: hashedPreview,
        ...(previewTheme !== null && { theme: previewTheme }),
      });
      dispatch({ type: 'PREVIEW_RESULT', text: placeholderText, result });
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc?.id, placeholderText, hashedPreview, previewTheme]);

  // Autosave: a draft is written once edits pause, and straight away when the document is
  // left (flushDraft), so an edit made just before leaving isn't lost.
  // Whether there is something to write is read from state, not from a flag set in an
  // effect: Back can come before the effects of the last edit have run.
  // A draft opened from storage starts as saved: re-saving it untouched would only
  // rewrite its index title before the first check result has named it.
  const savedDoc = useRef(boot.state.doc);
  function flushDraft() {
    const s = stateRef.current;
    if (!s.doc || s.doc.mode === 'muddled' || s.doc === savedDoc.current) return;
    savedDoc.current = s.doc;
    setSaveFailed(!saveDraft(s.doc, titleOf(s)));
    dispatch({ type: 'DRAFTS_CHANGED', drafts: loadIndex() });
  }
  useEffect(() => {
    if (!doc || doc.mode === 'muddled') return undefined;
    const timer = setTimeout(flushDraft, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc]);
  useEffect(() => {
    window.addEventListener('pagehide', flushDraft);
    return () => window.removeEventListener('pagehide', flushDraft);
  }, []);

  // The address: derived from state; location.hash writes history and hashchange reads
  // it, and never pushState, which throws on file://. An address for nothing the studio
  // can show is rewritten to the start screen's (`replaceNext`, set at boot).
  // A layout effect, so the address is current as soon as the screen is: a Back right
  // after a click must step from where the click went.
  const address = formatRoute(routeOf(state));
  useLayoutEffect(() => {
    const forced = replaceNext.current;
    replaceNext.current = false;
    if (address === location.hash) return;
    const step = forced ? 'replace' : historyStep(parseRoute(location.hash), routeOf(stateRef.current));
    if (step === 'push') location.hash = address;
    else if (step === 'replace') location.replace(address);
  }, [address]);
  useEffect(() => {
    // The start screen, with `message` if there is one. The address is rewritten rather
    // than added to: the entry it replaces is one the studio can't show.
    function homeInPlace(message) {
      flushDraft();
      const hadDoc = !!stateRef.current.doc;   // read before dispatching: stateRef updates on render
      dispatch({ type: 'CLOSE_DOC' });
      if (message) dispatch({ type: 'SHOW_MESSAGE', text: message });
      if (hadDoc) replaceNext.current = true;
      else location.replace('#/');
    }
    function onHashChange() {
      const route = parseRoute(location.hash);
      const cur = stateRef.current;
      const here = routeOf(cur);
      if (!route) { homeInPlace(null); return; }
      if (formatRoute(route) === formatRoute(here)) return;
      if (route.screen === 'home') { flushDraft(); dispatch({ type: 'CLOSE_DOC' }); return; }
      if (route.screen === 'doc' && here.screen === 'doc' && route.id === here.id) {
        // A YAML doc has no clues phase. When the address names the other mode, only the
        // view is applied: the doc stays as it is, and the address is corrected to it.
        const view = route.view === 'clues' && cur.doc.mode === 'yaml' ? 'board' : route.view;
        dispatch({ type: 'SET_VIEW', view });
        const shown = formatRoute({ ...here, view });
        if (shown === formatRoute(here)) location.replace(shown);
        return;
      }
      flushDraft();
      const [first] = openActions(route);
      if (first.type === 'OPEN_DOC') { savedDoc.current = first.doc; dispatch(first); }
      else homeInPlace(first.text);
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // A problem jump opens the phase that shows the problem, then focuses it there: after
  // the phase has rendered when the view changes, straight away when it doesn't.
  function jumpTo(target) {
    const view = doc.mode === 'structured' ? phaseForJump(target, state.view) : state.view;
    if (view === state.view) { focusRef.current?.(target); return; }
    pendingJump.current = target;
    dispatch({ type: 'SET_VIEW', view });
  }
  useEffect(() => {
    const target = pendingJump.current;
    pendingJump.current = null;
    if (target) focusRef.current?.(target);
  }, [state.view]);

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
    const { doc: opened, notice } = openText(TEMPLATES[kind], { id: newId(), now: Date.now() });
    openDoc(opened, notice);
  }
  function goHome() {
    flushDraft();
    dispatch({ type: 'CLOSE_DOC' });
  }
  function openDraft(id) {
    const found = loadDraft(id);
    if (found) { openDoc(found); savedDoc.current = found; }
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
  const pickFile = () => inputRef.current.click();

  return (
    <div id="studio">
      {doc ? (
        <Toolbar state={state} dispatch={dispatch} title={titleOf(state)} saveFailed={saveFailed}
          onHome={goHome}
          onEditYaml={editAsYaml} canYaml={state.completeness.length === 0}
          onReturn={backToEditor} canReturn={Object.hasOwn(STRUCTURED, doc.kind)}
          onJump={jumpTo} />
      ) : (
        <header id="toolbar">
          <span class="slot l" aria-hidden="true"></span>
          <span class="brand">Varietypack Studio</span>
          <div class="top-end">
            <button type="button" id="btn-open" class="btn" onClick={pickFile}>Open a file…</button>
          </div>
          <span class="slot r" aria-hidden="true"></span>
        </header>
      )}
      <input id="open-input" type="file" accept=".yaml,.yml,.json" hidden onChange={onFileChosen} ref={inputRef} />
      {state.message && (
        <div id="message" role="status">
          <span>{state.message}</span>
          <button type="button" id="message-close" class="btn quiet" onClick={() => dispatch({ type: 'CLEAR_MESSAGE' })}>Dismiss</button>
        </div>
      )}
      <div class={'body' + (muddled ? ' muddled' : '')}>
        {!doc && (
          <Welcome drafts={state.drafts} onNew={openExample} onCreate={createStructured} onExample={openExample}
            onOpenDraft={openDraft} onDeleteDraft={removeDraft} />
        )}
        {doc && !muddled && (
          <section id="edit-view" class="pane-scroll" hidden={state.view === 'test'}>
            {doc.mode === 'structured'
              ? <StructuredShell key={doc.id} state={state} dispatch={dispatch} focusRef={focusRef} />
              : (
                <YamlEditor value={doc.yaml} onInput={t => dispatch({ type: 'SET_YAML', text: t, now: Date.now() })} />
              )}
          </section>
        )}
        {muddled && (
          <MuddledPanel doc={doc} check={state.check}
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
