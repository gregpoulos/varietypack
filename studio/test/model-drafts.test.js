'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { newDoc } = require('../src/model/doc');
const { serializeDraft, parseDraft, indexEntry } = require('../src/model/drafts');

const doc = newDoc({ id: 'd1', now: 7, kind: 'spiral', yaml: 'kind: spiral\n' });

test('serializeDraft then parseDraft round-trips the document', () => {
  const text = serializeDraft(doc, '2026-10-06T00:00:00.000Z');
  assert.deepEqual(parseDraft(text), doc);
  assert.equal(JSON.parse(text).savedAt, '2026-10-06T00:00:00.000Z');
});

test('parseDraft rejects an object that is not a draft', () => {
  assert.throws(() => parseDraft('{}'), /Not a studio draft file/);
});

test('parseDraft rejects text that is not JSON', () => {
  assert.throws(() => parseDraft('kind: spiral'), /Not a studio draft file/);
});

test('parseDraft rejects a draft from a newer studio, naming its version', () => {
  assert.throws(() => parseDraft('{"studio":2}'), /saved by a newer studio \(version 2\)/);
});

test('parseDraft rejects a draft file with no document', () => {
  assert.throws(() => parseDraft('{"studio":1}'), /Not a studio draft file/);
});

test('parseDraft rejects a document that is not a studio document', () => {
  assert.throws(() => parseDraft('{"studio":1,"doc":{"yaml":"x"}}'), /Not a studio draft file/);
});

test('parseDraft rejects a yaml document with no text, and a muddled one with no file', () => {
  assert.throws(() => parseDraft('{"studio":1,"doc":{"id":"x","mode":"yaml"}}'), /Not a studio draft file/);
  assert.throws(() => parseDraft('{"studio":1,"doc":{"id":"x","mode":"muddled","yaml":"","muddled":null}}'), /Not a studio draft file/);
  assert.throws(() => parseDraft('{"studio":1,"doc":{"id":"x","mode":"nonsense","yaml":""}}'), /Not a studio draft file/);
});

test('parseDraft fills in missing options with the defaults', () => {
  const d = parseDraft('{"studio":1,"doc":{"id":"x","mode":"yaml","yaml":"a","options":{"font":"link"}}}');
  assert.deepEqual(d.options, { font: 'link', hashedPreview: false, phoneWidth: false });
  assert.equal(parseDraft('{"studio":1,"doc":{"id":"x","mode":"yaml","yaml":"a"}}').options.font, 'embed');
});

test('parseDraft rejects a structured draft whose model is not shaped like a model', () => {
  assert.throws(() => parseDraft('{"studio":1,"doc":{"id":"x","mode":"structured","model":{"kind":"spiral"}}}'), /Not a studio draft file/);
});

test('a Snake Charmer draft round-trips, and a malformed one is rejected', () => {
  const { newDoc } = require('../src/model/doc');
  const doc = newDoc({ id: 'sc', now: 1, kind: 'snake-charmer', size: { cells: 16 } });
  assert.deepEqual(parseDraft(serializeDraft(doc, 'x')), doc);
  assert.throws(() => parseDraft('{"studio":1,"doc":{"id":"x","mode":"structured","model":{"kind":"snake-charmer","ring":[]}}}'), /Not a studio draft file/);
});

test('a structured draft must name the same kind as its model', () => {
  const { newDoc } = require('../src/model/doc');
  const doc = newDoc({ id: 'sc', now: 1, kind: 'snake-charmer', size: { cells: 16 } });
  for (const kind of [null, 'spiral', undefined]) {
    assert.throws(() => parseDraft(serializeDraft({ ...doc, kind }, 'x')), /Not a studio draft file/, String(kind));
  }
});

test('indexEntry carries what the draft list shows', () => {
  assert.deepEqual(indexEntry(doc, 'My Puzzle'), { id: 'd1', title: 'My Puzzle', kind: 'spiral', updatedAt: 7 });
});

// A structured draft whose model is shaped wrongly must be refused at parse time, not
// crash the reducer when the document opens.
function structuredDraft(mutate) {
  const { openText } = require('../src/model/doc');
  const fs = require('fs'), path = require('path');
  const text = fs.readFileSync(path.join(__dirname, '..', '..', 'examples', 'spiral.yaml'), 'utf8');
  const d = JSON.parse(JSON.stringify(openText(text, { id: 's', now: 1 }).doc));
  mutate(d.model);
  return JSON.stringify({ studio: 1, doc: d });
}

test('parseDraft accepts a real structured document', () => {
  assert.equal(parseDraft(structuredDraft(() => {})).mode, 'structured');
});

test('parseDraft rejects a structured model whose cuts are not shaped like cuts', () => {
  const bad = [
    m => { m.cuts = { inward: {}, outward: {} }; },
    m => { m.cuts.inward.entries = 'x'; },
    m => { m.cuts.outward.starts = [1, 2]; },
    m => { m.cuts.inward.entries = m.cuts.inward.entries.slice(1); },
    m => { m.cuts.inward.entries[0] = null; },
    m => { m.cells = m.cells.map(() => 5); },
    m => { m.circles = [m.cells.length + 3]; },
  ];
  for (const mutate of bad) assert.throws(() => parseDraft(structuredDraft(mutate)), /Not a studio draft file/);
});

