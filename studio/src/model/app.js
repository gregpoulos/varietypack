'use strict';
// App state and its reducer. Every piece of state that matters lives here, so it can be
// tested under node:test; components only render state and dispatch actions.
//
//   { doc, check, checkedText, lastGoodHtml, view: 'edit'|'test', dialog: null|'export',
//     drafts, message,
//     history,        // structured docs only: undo/redo over the model (history.js)
//     completeness }  // structured docs only: the kind's completeness diagnostics
const doc = require('./doc');
const { STRUCTURED } = require('./kinds');
const { createHistory, commit, undo, redo } = require('./history');

function initialState(drafts = []) {
  return { doc: null, check: null, checkedText: null, lastGoodHtml: null,
           view: 'edit', dialog: null, drafts, message: null, history: null, completeness: [] };
}

const NO_CHECK = { check: null, checkedText: null, lastGoodHtml: null };

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

function reduce(state, action) {
  switch (action.type) {
    case 'OPEN_DOC':
      return { ...state, doc: action.doc, ...NO_CHECK, ...modelState(action.doc), view: 'edit', dialog: null, message: action.message ?? null };
    case 'CLOSE_DOC':
      return { ...state, doc: null, ...NO_CHECK, ...modelState(null), dialog: null };
    case 'SWITCH_MODE':
      return { ...state, doc: action.doc, ...NO_CHECK, ...modelState(action.doc), dialog: null, message: action.message ?? null };
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
      return { ...state, view: action.view };
    case 'SET_YAML':
      return state.doc ? { ...state, doc: doc.setYaml(state.doc, action.text, action.now) } : state;
    case 'SET_OPTION':
      return state.doc ? { ...state, doc: doc.setOption(state.doc, action.key, action.value, action.now) } : state;
    case 'SET_UI':
      return state.doc ? { ...state, doc: doc.setUi(state.doc, action.key, action.value, action.now) } : state;
    case 'SET_MUDDLED_THEME':
      return state.doc ? { ...state, doc: doc.setMuddledTheme(state.doc, action.theme, action.now) } : state;
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

function previewHtml(state) {
  return state.check?.html ?? state.lastGoodHtml;
}

function previewIsStale(state) {
  if (!state.lastGoodHtml) return false;
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

module.exports = { initialState, reduce, canExport, previewHtml, previewIsStale, problemsLabel };
