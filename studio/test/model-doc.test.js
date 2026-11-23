'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { deepFreeze } = require('./helpers');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const spiral   = require('../src/model/kinds/spiral');
const { newDoc, openText, setYaml, setOption, puzzleText, toYamlMode, toStructuredMode, parseSize, fieldValue } = require('../src/model/doc');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('openText: a clean source Crushword opens structured, kind detected, no notice', () => {
  const { doc, notice } = openText(read('examples/crushword.yaml'), { id: 'a', now: 1 });
  assert.equal(doc.mode, 'structured');
  assert.equal(doc.kind, 'crushword');
  assert.equal(doc.yaml, null);
  assert.equal(doc.muddled, null);
  assert.equal(notice, null);
});

test('openText: a muddled file opens in muddled mode', () => {
  const text = read('spiral/test/fixtures/test-78.muddled.yaml');
  const { doc } = openText(text, { id: 'a', now: 1 });
  assert.equal(doc.mode, 'muddled');
  assert.equal(doc.kind, 'spiral');
  assert.equal(doc.muddled.boardHash, yaml.load(text).boardHash);
});

test('openText: text that does not parse still opens, in yaml mode with no kind', () => {
  const { doc } = openText('not: [a puzzle', { id: 'a', now: 1 });
  assert.equal(doc.mode, 'yaml');
  assert.equal(doc.kind, null);
  assert.equal(doc.yaml, 'not: [a puzzle');
});

test('newDoc: starts in yaml mode with default options', () => {
  const doc = newDoc({ id: 'x', now: 5, kind: 'crushword', yaml: 'kind: crushword\n' });
  assert.deepEqual(doc, {
    id: 'x', kind: 'crushword', mode: 'yaml', yaml: 'kind: crushword\n', muddled: null,
    options: { font: 'embed', hashedPreview: false, phoneWidth: false, previewTheme: null }, updatedAt: 5,
  });
});

test('puzzleText: a yaml-mode doc returns the author\'s text verbatim', () => {
  const doc = newDoc({ id: 'x', now: 1, kind: null, yaml: '# comment\nkind: spiral\n' });
  assert.equal(puzzleText(doc), '# comment\nkind: spiral\n');
});

test('setYaml and setOption return new docs and never mutate their input', () => {
  const doc = deepFreeze(newDoc({ id: 'x', now: 1, kind: null, yaml: 'a' }));
  const a = setYaml(doc, 'b', 2);
  const b = setOption(doc, 'phoneWidth', true, 3);
  assert.equal(a.yaml, 'b');
  assert.equal(a.updatedAt, 2);
  assert.equal(b.options.phoneWidth, true);
  assert.equal(b.updatedAt, 3);
  assert.equal(doc.yaml, 'a');
  assert.equal(doc.options.phoneWidth, false);
});

test('setOption: rejects a key that is not an option', () => {
  const doc = newDoc({ id: 'x', now: 1, kind: null, yaml: '' });
  assert.throws(() => setOption(doc, 'mode', 'muddled', 2), /option/);
});

test('every example imports into the structured editor without a notice', () => {
  for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
    const { doc, notice } = openText(read(`examples/${kind}.yaml`), { id: 'x', now: 0 });
    assert.equal(doc.mode, 'structured', kind);
    assert.ok(notice == null, kind);
  }
});

test('fieldValue: the number a size field accepts, or null', () => {
  const plain = { name: 'cells', min: 40, max: 200 };
  const stepped = { name: 'cells', min: 8, max: 120, step: 2 };
  assert.equal(fieldValue(plain, ' 40 '), 40);
  for (const bad of ['39', '201', '4.5', '', 'abc', undefined]) assert.equal(fieldValue(plain, bad), null, String(bad));
  assert.equal(fieldValue(stepped, '48'), 48);
  assert.equal(fieldValue(stepped, '45'), null);
});

// What a field accepts is fieldValue's; parseSize adds the message and the extras.
test('parseSize: the size, or the field\'s rule as a message, with extras merged in', () => {
  assert.deepEqual(parseSize(spiral, { cells: '40' }), { size: { cells: 40 } });
  assert.equal(parseSize(spiral, { cells: '39' }).error, 'Cells must be a whole number from 40 to 200.');
  const kind = { sizeFields: [{ name: 'cells', label: 'Cells per lap', min: 8, max: 120, step: 2 }] };
  assert.deepEqual(parseSize(kind, { cells: '48' }, { shape: 'turn' }), { size: { cells: 48, shape: 'turn' } });
  assert.equal(parseSize(kind, { cells: '45' }).error, 'Cells per lap must be a whole number from 8 to 120, in steps of 2.');
});

// A complete Spiral, as YAML text and opened as a structured doc.
const complete = () => ({
  kind: 'spiral', title: 'T',
  inward:  [{ clue: 'i1', answer: 'ROTI' }, { clue: 'i2', answer: 'DEREK' }],
  outward: [{ clue: 'o1', answer: 'KERE' }, { clue: 'o2', answer: 'DITOR' }],
});
const spiralText = (p = complete()) => yaml.dump(p);
const spiralDoc = () => openText(spiralText(), { id: 'a', now: 1 }).doc;

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

test('puzzleText of a complete structured doc is the exported YAML', () => {
  assert.deepEqual(yaml.load(puzzleText(spiralDoc())).inward.map(e => e.answer), ['ROTI', 'DEREK']);
});

test('toYamlMode: a yaml doc with the dumped text; refused while incomplete', () => {
  const d = spiralDoc();
  const y = toYamlMode(d);
  assert.equal(y.mode, 'yaml');
  assert.equal(y.yaml, puzzleText(d));
  assert.ok(!('model' in y) || y.model == null);
  const blank = newDoc({ id: 'b', now: 1, kind: 'spiral', size: { cells: 40 } });
  assert.throws(() => toYamlMode(blank), /incomplete/);
});

test('toStructuredMode: parses the text; throws parse and structure errors', () => {
  const y = toYamlMode(spiralDoc());
  const { doc } = toStructuredMode(y);
  assert.equal(doc.mode, 'structured');
  assert.equal(doc.model.cells.join(''), 'rotiderek');
  assert.throws(() => toStructuredMode({ ...y, yaml: 'a: [unclosed' }));
  const uneven = complete(); uneven.outward[1].answer = 'DITO';
  assert.throws(() => toStructuredMode({ ...y, yaml: spiralText(uneven) }), /different numbers of cells/);
});

test('openText: a Spiral with a reversal conflict opens structured, with a notice', () => {
  const p = complete(); p.outward[1].answer = 'DXTOR';
  const { doc, notice } = openText(spiralText(p), { id: 'a', now: 1 });
  assert.equal(doc.mode, 'structured');
  assert.match(notice, /Cell 4: kept "I" from inward 1, discarded "X" from outward 2/);
});

test('openText: a Spiral whose totals differ opens as YAML, with an "Opened as YAML" notice', () => {
  const p = complete(); p.outward[1].answer = 'DITO';
  const { doc, notice } = openText(spiralText(p), { id: 'a', now: 1 });
  assert.equal(doc.mode, 'yaml');
  assert.equal(doc.kind, 'spiral');
  assert.match(notice, /^Opened as YAML: inward and outward cover different numbers of cells/);
});

test('openText: a clean Spiral opens structured with no notice', () => {
  const { doc, notice } = openText(spiralText(), { id: 'a', now: 1 });
  assert.equal(doc.mode, 'structured');
  assert.equal(notice, null);
});
