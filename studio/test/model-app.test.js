'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { newDoc, puzzleText } = require('../src/model/doc');
const { initialState, reduce, canExport, previewHtml, previewIsStale, problemsLabel } = require('../src/model/app');

function deepFreeze(o) {
  Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
}

const doc = newDoc({ id: 'a', now: 1, kind: null, yaml: 'kind: spiral\n' });
const clean = { parseError: null, kind: 'spiral', muddled: false, theme: null, title: 'T', html: '<p>ok</p>', errors: [], warnings: [], notes: [] };
const failing = { ...clean, html: null, errors: ['bad'] };

function opened() { return reduce(initialState(), { type: 'OPEN_DOC', doc }); }
function checked(state, result, text = puzzleText(state.doc)) { return reduce(state, { type: 'CHECK_RESULT', text, result }); }

test('OPEN_DOC: sets the doc, clears check state, starts on the Edit view', () => {
  let s = checked(opened(), clean);
  s = reduce({ ...s, view: 'test', dialog: 'export' }, { type: 'OPEN_DOC', doc, message: 'hi' });
  assert.equal(s.doc, doc);
  assert.equal(s.check, null);
  assert.equal(s.checkedText, null);
  assert.equal(s.lastGoodHtml, null);
  assert.equal(s.view, 'edit');
  assert.equal(s.dialog, null);
  assert.equal(s.message, 'hi');
});

test('CHECK_RESULT: a stale result (text differs) leaves the state unchanged', () => {
  const s = opened();
  assert.deepEqual(checked(s, clean, 'something else'), s);
});

test('CHECK_RESULT: a passing check replaces lastGoodHtml', () => {
  let s = checked(opened(), clean);
  s = reduce(s, { type: 'SET_YAML', text: 'kind: spiral\n# x', now: 2 });
  s = checked(s, { ...clean, html: '<p>new</p>' });
  assert.equal(s.lastGoodHtml, '<p>new</p>');
  assert.equal(previewHtml(s), '<p>new</p>');
});

test('CHECK_RESULT: a failing check keeps lastGoodHtml, and the preview turns stale', () => {
  let s = checked(opened(), clean);
  assert.equal(previewIsStale(s), false);
  s = reduce(s, { type: 'SET_YAML', text: 'kind: spiral\nbroken', now: 2 });
  s = checked(s, failing);
  assert.equal(s.lastGoodHtml, '<p>ok</p>');
  assert.equal(previewHtml(s), '<p>ok</p>');
  assert.equal(previewIsStale(s), true);
});

test('previewIsStale: false when there is no good preview to be stale', () => {
  assert.equal(previewIsStale(checked(opened(), failing)), false);
});

test('CHECK_RESULT: records the detected kind without counting as an edit', () => {
  const s = checked(opened(), clean);
  assert.equal(s.doc.kind, 'spiral');
  assert.equal(s.doc.updatedAt, 1);
});

test('canExport: false before any check', () => {
  assert.equal(canExport(opened()), false);
});

test('canExport: false with errors, false with a parse error, true when clean', () => {
  assert.equal(canExport(checked(opened(), failing)), false);
  assert.equal(canExport(checked(opened(), { ...clean, parseError: 'bad yaml' })), false);
  assert.equal(canExport(checked(opened(), clean)), true);
  assert.equal(canExport(checked(opened(), { ...clean, warnings: ['w'] })), true);
});

test('canExport: false once the text has changed since the check', () => {
  const s = reduce(checked(opened(), clean), { type: 'SET_YAML', text: 'changed', now: 2 });
  assert.equal(canExport(s), false);
});

test('SET_VIEW, dialogs, messages and drafts update their own field', () => {
  let s = opened();
  s = reduce(s, { type: 'SET_VIEW', view: 'test' });
  assert.equal(s.view, 'test');
  s = reduce(s, { type: 'SHOW_DIALOG', name: 'export' });
  assert.equal(s.dialog, 'export');
  s = reduce(s, { type: 'HIDE_DIALOG' });
  assert.equal(s.dialog, null);
  s = reduce(s, { type: 'SHOW_MESSAGE', text: 'note' });
  assert.equal(s.message, 'note');
  s = reduce(s, { type: 'CLEAR_MESSAGE' });
  assert.equal(s.message, null);
  s = reduce(s, { type: 'DRAFTS_CHANGED', drafts: [{ id: 'x' }] });
  assert.deepEqual(s.drafts, [{ id: 'x' }]);
});

test('SET_OPTION and SET_MUDDLED_THEME edit the doc', () => {
  let s = reduce(opened(), { type: 'SET_OPTION', key: 'phoneWidth', value: true, now: 3 });
  assert.equal(s.doc.options.phoneWidth, true);
  s = reduce({ ...s, doc: { ...s.doc, mode: 'muddled', muddled: { kind: 'spiral' } } },
    { type: 'SET_MUDDLED_THEME', theme: 'skeleton', now: 4 });
  assert.equal(s.doc.muddled.theme, 'skeleton');
});

test('CLOSE_DOC returns to the welcome screen', () => {
  assert.equal(reduce(opened(), { type: 'CLOSE_DOC' }).doc, null);
});

test('the reducer never mutates its input state', () => {
  const s = deepFreeze(checked(opened(), clean));
  for (const action of [
    { type: 'SET_YAML', text: 'z', now: 9 },
    { type: 'SET_OPTION', key: 'font', value: 'link', now: 9 },
    { type: 'SET_VIEW', view: 'test' },
    { type: 'CHECK_RESULT', text: puzzleText(s.doc), result: failing },
    { type: 'OPEN_DOC', doc },
    { type: 'CLOSE_DOC' },
  ]) assert.doesNotThrow(() => reduce(s, action), action.type);
});

test('problemsLabel: checking until a check for the current text arrives', () => {
  assert.deepEqual(problemsLabel(opened()), { text: 'Checking…', tone: 'busy' });
  const stale = reduce(checked(opened(), clean), { type: 'SET_YAML', text: 'changed', now: 2 });
  assert.equal(problemsLabel(stale).tone, 'busy');
});

test('problemsLabel: a parse error, problems, and a clean puzzle', () => {
  assert.deepEqual(problemsLabel(checked(opened(), { ...clean, html: null, parseError: 'x' })), { text: 'YAML error', tone: 'bad' });
  assert.deepEqual(problemsLabel(checked(opened(), failing)), { text: '1 problem', tone: 'bad' });
  assert.deepEqual(problemsLabel(checked(opened(), { ...failing, errors: ['a', 'b'] })), { text: '2 problems', tone: 'bad' });
  assert.deepEqual(problemsLabel(checked(opened(), clean)), { text: 'Ready to export', tone: 'ok' });
  assert.deepEqual(problemsLabel(checked(opened(), { ...clean, warnings: ['w'] })), { text: 'Ready to export · 1 warning', tone: 'ok' });
  assert.equal(problemsLabel(checked(opened(), { ...clean, warnings: ['w', 'v'] })).text, 'Ready to export · 2 warnings');
});

test('SET_UI edits an editor setting on the doc and is not an undo step', () => {
  const s = reduce(opened(), { type: 'SET_UI', key: 'symmetric', value: false, now: 3 });
  assert.equal(s.doc.ui.symmetric, false);
  assert.deepEqual(s.history, opened().history);
});

