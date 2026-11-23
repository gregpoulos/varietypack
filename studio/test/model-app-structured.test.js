'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const yaml     = require('js-yaml');
const { newDoc, openText, puzzleText, toYamlMode, toStructuredMode } = require('../src/model/doc');
const { initialState, reduce, canExport, previewIsStale, problemsLabel } = require('../src/model/app');
const { canUndo } = require('../src/model/history');

const complete = () => ({
  kind: 'spiral', title: 'T',
  inward:  [{ clue: 'i1', answer: 'ROTI' }, { clue: 'i2', answer: 'DEREK' }],
  outward: [{ clue: 'o1', answer: 'KERE' }, { clue: 'o2', answer: 'DITOR' }],
});
const text = (p = complete()) => yaml.dump(p);

function structured(p = complete()) {
  const { doc } = openText(text(p), { id: 'a', now: 1 });
  return reduce(initialState(), { type: 'OPEN_DOC', doc });
}
const cmd = (s, name, args = [], key) => reduce(s, { type: 'MODEL_COMMAND', name, args, key, now: 5 });

test('OPEN_DOC with a structured doc starts a history and a completeness list', () => {
  const s = structured();
  assert.equal(s.history.present, s.doc.model);
  assert.deepEqual(s.completeness, []);
  const blank = reduce(initialState(), { type: 'OPEN_DOC', doc: newDoc({ id: 'b', now: 1, kind: 'spiral', size: { cells: 40 } }) });
  assert.ok(blank.completeness.length > 0);
});

test('a command commits; undo and redo restore doc.model', () => {
  let s = structured();
  const before = s.doc.model;
  s = cmd(s, 'setClue', ['inward', 0, 'changed']);
  assert.equal(s.doc.model.cuts.inward.entries[0].clue, 'changed');
  assert.equal(s.doc.updatedAt, 5);
  assert.equal(canUndo(s.history), true);
  s = reduce(s, { type: 'UNDO' });
  assert.equal(s.doc.model, before);
  s = reduce(s, { type: 'REDO' });
  assert.equal(s.doc.model.cuts.inward.entries[0].clue, 'changed');
});

test('typing in one clue coalesces into one undo step', () => {
  let s = structured();
  const before = s.doc.model;
  for (const t of ['c', 'cl', 'clu']) s = cmd(s, 'setClue', ['inward', 0, t], 'clue:inward:e1');
  s = reduce(s, { type: 'UNDO' });
  assert.equal(s.doc.model, before);
});

test('completeness updates with each command', () => {
  let s = structured();
  s = cmd(s, 'setClue', ['inward', 0, '']);
  assert.match(s.completeness[0].message, /Inward 1 .* has no clue/);
  s = cmd(s, 'setClue', ['inward', 0, 'back']);
  assert.deepEqual(s.completeness, []);
});

test('canExport is false while a structured doc has completeness errors', () => {
  let s = structured();
  s = reduce(s, { type: 'CHECK_RESULT', text: puzzleText(s.doc), result: { parseError: null, kind: 'spiral', html: '<p>x</p>', errors: [], warnings: [], notes: [] } });
  assert.equal(canExport(s), true);
  s = cmd(s, 'setClue', ['inward', 0, '']);
  assert.equal(canExport(s), false);
});

test('previewIsStale is true for an incomplete structured doc that has a lastGoodHtml', () => {
  let s = structured();
  s = reduce(s, { type: 'CHECK_RESULT', text: puzzleText(s.doc), result: { parseError: null, kind: 'spiral', html: '<p>x</p>', errors: [], warnings: [], notes: [] } });
  assert.equal(previewIsStale(s), false);
  s = cmd(s, 'setCell', [0, '']);
  assert.equal(puzzleText(s.doc), null);
  assert.equal(previewIsStale(s), true);
});

test('a missing clue alone does not make the preview stale: placeholders stand in', () => {
  let s = structured();
  s = reduce(s, { type: 'CHECK_RESULT', text: puzzleText(s.doc), result: { parseError: null, kind: 'spiral', html: '<p>x</p>', errors: [], warnings: [], notes: [] } });
  s = cmd(s, 'setClue', ['inward', 0, '']);
  assert.equal(previewIsStale(s), false);
});

test('problemsLabel counts completeness problems while the puzzle is incomplete', () => {
  const s = cmd(structured(), 'setClue', ['inward', 0, '']);
  assert.deepEqual(problemsLabel(s), { text: '1 problem', tone: 'bad' });
});

test('a CHECK_RESULT for a structured doc that is incomplete is ignored', () => {
  const s = cmd(structured(), 'setClue', ['inward', 0, '']);
  const next = reduce(s, { type: 'CHECK_RESULT', text: 'anything', result: { parseError: null, html: '<p>x</p>', errors: [], warnings: [], notes: [] } });
  assert.equal(next, s);
});

test('SWITCH_MODE replaces the doc, resets history and sets the message', () => {
  let s = structured();
  s = cmd(s, 'setClue', ['inward', 0, 'x']);
  const y = toYamlMode(s.doc);
  s = reduce(s, { type: 'SWITCH_MODE', doc: y, message: 'now YAML' });
  assert.equal(s.doc.mode, 'yaml');
  assert.equal(s.history, null);
  assert.equal(s.message, 'now YAML');
});

test('SWITCH_MODE keeps a check of the same text (see the reducer)', () => {
  const clean = { parseError: null, kind: 'spiral', html: '<p>ok</p>', errors: [], warnings: [], notes: [] };
  let s = structured();
  s = reduce(s, { type: 'CHECK_RESULT', text: puzzleText(s.doc), result: clean });
  const y = toYamlMode(s.doc);
  const inYaml = reduce(s, { type: 'SWITCH_MODE', doc: y });
  assert.equal(inYaml.doc.mode, 'yaml');
  assert.equal(problemsLabel(inYaml).tone, 'ok');
  assert.ok(canExport(inYaml));
  // And back: the same text stays checked; text that changed is waiting for a new check.
  const back = reduce(inYaml, { type: 'SWITCH_MODE', doc: toStructuredMode(y).doc });
  assert.equal(problemsLabel(back).tone, 'ok');
  const changed = complete(); changed.inward[0].clue = 'other';
  const edited = reduce(inYaml, { type: 'SWITCH_MODE', doc: toStructuredMode({ ...y, yaml: text(changed) }).doc });
  assert.equal(problemsLabel(edited).tone, 'busy');
});

