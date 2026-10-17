'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const yaml     = require('js-yaml');
const spiral   = require('../src/model/kinds/spiral');
const { newDoc, openText, parseSize, fieldValue, puzzleText, toYamlMode, toStructuredMode } = require('../src/model/doc');
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

test('newDoc with a size gives a structured doc; with yaml gives a yaml doc', () => {
  const doc = newDoc({ id: 'a', now: 1, kind: 'spiral', size: { cells: 40 } });
  assert.equal(doc.mode, 'structured');
  assert.equal(doc.model.cells.length, 40);
  assert.equal(doc.yaml, null);
  const y = newDoc({ id: 'a', now: 1, kind: 'spiral', yaml: 'kind: spiral\n' });
  assert.equal(y.mode, 'yaml');
});

test('newDoc: a structured doc needs a structured kind and a size', () => {
  assert.throws(() => newDoc({ id: 'a', now: 1, kind: 'nonesuch', size: { cells: 1 } }), /structured/);
  assert.throws(() => newDoc({ id: 'a', now: 1, kind: 'spiral' }), /size/);
});

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
  s = cmd(s, 'setClue', ['inward', 0, '']);
  assert.equal(puzzleText(s.doc), null);
  assert.equal(previewIsStale(s), true);
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

test('puzzleText of a complete structured doc is the exported YAML', () => {
  const s = structured();
  assert.deepEqual(yaml.load(puzzleText(s.doc)).inward.map(e => e.answer), ['ROTI', 'DEREK']);
});

test('toYamlMode: a yaml doc with the dumped text; refused while incomplete', () => {
  const s = structured();
  const y = toYamlMode(s.doc);
  assert.equal(y.mode, 'yaml');
  assert.equal(y.yaml, puzzleText(s.doc));
  assert.ok(!('model' in y) || y.model == null);
  const blank = newDoc({ id: 'b', now: 1, kind: 'spiral', size: { cells: 40 } });
  assert.throws(() => toYamlMode(blank), /incomplete/);
});

test('toStructuredMode: parses the text; throws parse and structure errors', () => {
  const y = toYamlMode(structured().doc);
  const { doc } = toStructuredMode(y);
  assert.equal(doc.mode, 'structured');
  assert.equal(doc.model.cells.join(''), 'rotiderek');
  assert.throws(() => toStructuredMode({ ...y, yaml: 'a: [unclosed' }));
  const uneven = complete(); uneven.outward[1].answer = 'DITO';
  assert.throws(() => toStructuredMode({ ...y, yaml: text(uneven) }), /different numbers of cells/);
});

test('SWITCH_MODE replaces the doc, resets history and sets the message', () => {
  let s = structured();
  s = cmd(s, 'setClue', ['inward', 0, 'x']);
  const y = toYamlMode(s.doc);
  s = reduce(s, { type: 'SWITCH_MODE', doc: y, message: 'now YAML' });
  assert.equal(s.doc.mode, 'yaml');
  assert.equal(s.history, null);
  assert.equal(s.message, 'now YAML');
  assert.equal(s.check, null);
});

test('parseSize: a whole number within the field range', () => {
  assert.deepEqual(parseSize(spiral, { cells: '40' }), { size: { cells: 40 } });
  for (const bad of ['39', '201', '4.5', '', 'abc']) {
    const r = parseSize(spiral, { cells: bad });
    assert.match(r.error, /^Cells must be a whole number from 40 to 200\.$/, bad);
  }
});

test('parseSize with a step, and extras merged into the size', () => {
  const kind = { sizeFields: [{ name: 'cells', label: 'Cells per lap', min: 8, max: 120, step: 2 }] };
  assert.deepEqual(parseSize(kind, { cells: '48' }, { shape: 'turn' }), { size: { cells: 48, shape: 'turn' } });
  assert.equal(parseSize(kind, { cells: '45' }).error, 'Cells per lap must be a whole number from 8 to 120, in steps of 2.');
});

test('openText: a Spiral with a reversal conflict opens structured, with a notice', () => {
  const p = complete(); p.outward[1].answer = 'DXTOR';
  const { doc, notice } = openText(text(p), { id: 'a', now: 1 });
  assert.equal(doc.mode, 'structured');
  assert.match(notice, /Cell 4: kept "I" from inward 1, discarded "X" from outward 2/);
});

test('openText: a Spiral whose totals differ opens as YAML, with an "Opened as YAML" notice', () => {
  const p = complete(); p.outward[1].answer = 'DITO';
  const { doc, notice } = openText(text(p), { id: 'a', now: 1 });
  assert.equal(doc.mode, 'yaml');
  assert.equal(doc.kind, 'spiral');
  assert.match(notice, /^Opened as YAML: inward and outward cover different numbers of cells/);
});

test('openText: a clean Spiral opens structured with no notice', () => {
  const { doc, notice } = openText(text(), { id: 'a', now: 1 });
  assert.equal(doc.mode, 'structured');
  assert.equal(notice, null);
});

test('a draft round trip keeps a structured doc', () => {
  const { serializeDraft, parseDraft } = require('../src/model/drafts');
  const { doc } = openText(text(), { id: 'a', now: 1 });
  assert.deepEqual(parseDraft(serializeDraft(doc, 'x')), doc);
});

test('fieldValue: the number a size field accepts, or null', () => {
  const plain = { name: 'cells', min: 40, max: 200 };
  const stepped = { name: 'cells', min: 8, max: 120, step: 2 };
  assert.equal(fieldValue(plain, ' 40 '), 40);
  for (const bad of ['39', '201', '4.5', '', 'abc', undefined]) assert.equal(fieldValue(plain, bad), null, String(bad));
  assert.equal(fieldValue(stepped, '48'), 48);
  assert.equal(fieldValue(stepped, '45'), null);
});
