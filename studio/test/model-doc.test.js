'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { deepFreeze } = require('./helpers');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const { newDoc, openText, setYaml, setOption, setUi, puzzleText } = require('../src/model/doc');

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
    v: 1, id: 'x', kind: 'crushword', mode: 'yaml', yaml: 'kind: crushword\n', muddled: null,
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

test('setUi: stores an editor setting on the doc without mutating it, and rejects an unknown one', () => {
  const doc = Object.freeze(newDoc({ id: 'x', now: 1, kind: 'spiral', yaml: 'a' }));
  const b = setUi(doc, 'symmetric', false, 4);
  assert.deepEqual(b.ui, { symmetric: false });
  assert.equal(b.updatedAt, 4);
  assert.equal(doc.ui, undefined);
  assert.throws(() => setUi(doc, 'mode', 1, 2), /setting/);
});

test('every example imports into the structured editor without a notice', () => {
  for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
    const { doc, notice } = openText(read(`examples/${kind}.yaml`), { id: 'x', now: 0 });
    assert.equal(doc.mode, 'structured', kind);
    assert.ok(notice == null, kind);
  }
});

test('previewTheme is a document option, null by default', () => {
  const d = newDoc({ id: 'a', now: 1, kind: 'spiral', yaml: 'kind: spiral\n' });
  assert.equal(d.options.previewTheme, null);
  assert.equal(setOption(d, 'previewTheme', 'skeleton', 2).options.previewTheme, 'skeleton');
});
