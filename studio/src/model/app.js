'use strict';
// App state and its reducer. Every piece of state that matters lives here, so it can be
// tested under node:test; components only render state and dispatch actions.
//
//   { doc, check, checkedText, lastGoodHtml, view: 'board'|'clues'|'test', dialog: null|'export',
//     drafts, message,
//     previewCheck,   // the build of the placeholder-filled preview text: { text, result } | null
//     history,        // structured docs only: undo/redo over the model (history.js)
//     completeness }  // structured docs only: the kind's completeness diagnostics
//
// `view` is the workspace phase: 'board' and 'clues' are the two phases of editing (a
// YAML doc has only 'board', its text); 'test' is the test-solve preview.
const doc = require('./doc');
const { STRUCTURED } = require('./kinds');
const { createHistory, commit, undo, redo } = require('./history');

function initialState(drafts = []) {
  return { doc: null, check: null, checkedText: null, lastGoodHtml: null,
           view: 'board', dialog: null, drafts, message: null, history: null, completeness: [], previewCheck: null };
}

const NO_CHECK = { check: null, checkedText: null, lastGoodHtml: null, previewCheck: null };

// History and completeness for a freshly opened or converted document.
function modelState(d) {
  if (!d || d.mode !== 'structured') return { history: null, completeness: [] };
  return { history: createHistory(d.model), completeness: STRUCTURED[d.kind].completeness(d.model) };
}

// Replaces the model after a command, undo or redo.
function withModel(state, history, now) {
  const model = history.present;
  return {
    ...state,
    history,
    doc: { ...state.doc, model, updatedAt: now ?? state.doc.updatedAt },
    completeness: STRUCTURED[state.doc.kind].completeness(model),
  };
}

// The phase an opened doc lands on: the action's, else the board. A YAML doc has no
// clues phase.
function openView(action) {
  const view = action.view ?? 'board';
  return view === 'clues' && action.doc?.mode === 'yaml' ? 'board' : view;
}

// The editing phase a diagnostics jump target lives in. A header field is on whichever
// phase is showing (the board unless the clues phase is); a missing clue or an orphan is
// on the clues phase; a cell is on the board.
function phaseForJump(target, view) {
  if (target.header) return view === 'clues' ? 'clues' : 'board';
  if (target.cells) return 'board';
  return 'clues';
}

function reduce(state, action) {
  switch (action.type) {
    case 'OPEN_DOC':
      return { ...state, doc: action.doc, ...NO_CHECK, ...modelState(action.doc), view: openView(action), dialog: null, message: action.message ?? null };
    case 'CLOSE_DOC':
      return { ...state, doc: null, ...NO_CHECK, ...modelState(null), dialog: null };
    case 'SWITCH_MODE':
      // The check and the last good page stay: they describe the text, and the
      // diagnostics effect is keyed on the text (and doc id), which a switch usually
      // leaves as it was, so a dropped check would never be redone. checkIsCurrent
      // still rejects them when the text did change.
      return { ...state, doc: action.doc, ...modelState(action.doc), view: 'board', dialog: null, message: action.message ?? null };
    case 'MODEL_COMMAND': {
      if (!state.doc || state.doc.mode !== 'structured') return state;
      const kind = STRUCTURED[state.doc.kind];
      const next = kind.commands[action.name](state.history.present, ...(action.args || []));
      if (next === state.history.present) return state;
      return withModel(state, commit(state.history, next, { key: action.key ?? null }), action.now);
    }
    case 'UNDO':
      return state.history ? withModel(state, undo(state.history), action.now) : state;
    case 'REDO':
      return state.history ? withModel(state, redo(state.history), action.now) : state;
    case 'SET_VIEW':
      return { ...state, view: action.view, dialog: null };
    case 'SET_YAML':
      return state.doc ? { ...state, doc: doc.setYaml(state.doc, action.text, action.now) } : state;
    case 'SET_OPTION':
      return state.doc ? { ...state, doc: doc.setOption(state.doc, action.key, action.value, action.now) } : state;
    case 'SET_UI':
      return state.doc ? { ...state, doc: doc.setUi(state.doc, action.key, action.value, action.now) } : state;
    case 'CHECK_RESULT': {
      // A result for text that has since changed is stale; drop it.
      if (!state.doc || action.text !== doc.puzzleText(state.doc)) return state;
      const { result } = action;
      const next = { ...state, check: result, checkedText: action.text };
      if (result.html) next.lastGoodHtml = result.html;
      // Detecting the kind isn't an edit, so updatedAt stays put.
      if (result.kind && result.kind !== state.doc.kind) next.doc = { ...state.doc, kind: result.kind };
      return next;
    }
    case 'PREVIEW_RESULT': {
      // The build of the placeholder text (doc.previewText); a stale one is dropped.
      if (!state.doc || action.text !== doc.previewText(state.doc)) return state;
      const next = { ...state, previewCheck: { text: action.text, result: action.result } };
      if (action.result.html) next.lastGoodHtml = action.result.html;
      return next;
    }
    case 'SHOW_DIALOG':
      return { ...state, dialog: action.name };
    case 'HIDE_DIALOG':
      return { ...state, dialog: null };
    case 'DRAFTS_CHANGED':
      return { ...state, drafts: action.drafts };
    case 'SHOW_MESSAGE':
      return { ...state, message: action.text };
    case 'CLEAR_MESSAGE':
      return { ...state, message: null };
    default:
      return state;
  }
}

// The check describes the current text (not an older one). An incomplete structured
// document has no text, so nothing is current for it.
function checkIsCurrent(state) {
  if (!state.doc || !state.check) return false;
  const text = doc.puzzleText(state.doc);
  return text !== null && state.checkedText === text;
}

const isIncomplete = (state) => !!state.doc && doc.puzzleText(state.doc) === null;

function canExport(state) {
  return checkIsCurrent(state) && !state.check.parseError && state.check.errors.length === 0;
}

// True while the preview is built with placeholder clues: the puzzle is missing clues and
// nothing else. The real document is still incomplete then.
function usesPlaceholders(state) {
  return isIncomplete(state) && doc.previewText(state.doc) !== null;
}

// The build of the placeholder-filled text, once it is current for the document.
function placeholderCheck(state) {
  const c = state.previewCheck;
  return c && c.text === doc.previewText(state.doc) ? c.result : null;
}

// lastGoodHtml is always the newest good build (CHECK_RESULT and PREVIEW_RESULT both set
// it), so anything not current falls back to it; an older check's page would reload the
// frame and lose the test-solve.
function previewHtml(state) {
  if (state.doc && usesPlaceholders(state)) return placeholderCheck(state)?.html ?? state.lastGoodHtml;
  return (checkIsCurrent(state) && state.check.html) || state.lastGoodHtml;
}

function previewIsStale(state) {
  if (!state.lastGoodHtml) return false;
  if (state.doc && usesPlaceholders(state)) {
    const result = placeholderCheck(state);
    return !!result && !result.html;
  }
  return isIncomplete(state) || (checkIsCurrent(state) && !state.check.html);
}

// The problems chip: what to say, and in what tone ('ok' | 'bad' | 'busy').
function problemsLabel(state) {
  if (isIncomplete(state)) {
    const n = state.completeness.length;
    return { text: `${n} problem${n === 1 ? '' : 's'}`, tone: 'bad' };
  }
  if (!checkIsCurrent(state)) return { text: 'Checking…', tone: 'busy' };
  const { parseError, errors, warnings } = state.check;
  if (parseError) return { text: 'YAML error', tone: 'bad' };
  if (errors.length) return { text: `${errors.length} problem${errors.length === 1 ? '' : 's'}`, tone: 'bad' };
  const w = warnings.length ? ` · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : '';
  return { text: `Ready to export${w}`, tone: 'ok' };
}

module.exports = { initialState, reduce, phaseForJump, canExport, previewHtml, previewIsStale, usesPlaceholders, problemsLabel };
