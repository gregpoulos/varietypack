'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { placeholderClue, fillEmptyClues, emptyClueCount } = require('../src/model/placeholderClues');
const { STRUCTURED } = require('../src/model/kinds');
const { newDoc, puzzleText, previewText } = require('../src/model/doc');
const { initialState, reduce, previewHtml, previewIsStale, usesPlaceholders } = require('../src/model/app');
const { canUndo } = require('../src/model/history');

test('placeholderClue is deterministic, varies by index, and is clue-length', () => {
  assert.equal(placeholderClue(3), placeholderClue(3));
  assert.notEqual(placeholderClue(0), placeholderClue(1));
  assert.ok(new Set([0, 1, 2, 3].map(placeholderClue)).size >= 3);
  for (let i = 0; i < 20; i++) assert.ok(placeholderClue(i).length >= 40, 'long enough to wrap');
});

const SIZES = { spiral: { cells: 40 }, 'snake-charmer': { cells: 12 }, 'marching-bands': { size: 6 }, crushword: { rows: 5, cols: 5 } };

for (const kind of Object.keys(STRUCTURED)) {
  const K = STRUCTURED[kind];
  const fresh = () => {
    const size = {};
    for (const f of K.sizeFields) size[f.name] = (SIZES[kind] || {})[f.name] ?? f.default;
    return newDoc({ id: 'a', now: 1, kind, size }).model;
  };

  test(`${kind}: fillEmptyClues fills every empty clue, keeps the rest, and leaves the original alone`, () => {
    const model = fresh();
    const n = emptyClueCount(model, K.mapEntries);
    assert.ok(n > 0);
    // Give the first entry a real clue.
    let first = true;
    const withOne = K.mapEntries(model, e => { if (first) { first = false; return { ...e, clue: 'Mine' }; } return e; });
    const filled = fillEmptyClues(withOne, K.mapEntries);
    assert.equal(emptyClueCount(filled, K.mapEntries), 0);
    assert.equal(emptyClueCount(withOne, K.mapEntries), n - 1, 'input not mutated');
    const clues = [];
    K.mapEntries(filled, e => { clues.push(e.clue); return e; });
    assert.equal(clues[0], 'Mine');
    if (clues.length > 1) assert.equal(clues[1], placeholderClue(1));
    assert.equal(fillEmptyClues(filled, K.mapEntries), filled, 'nothing to fill returns the same model');
  });

  test(`${kind}: an example with one clue cleared has no puzzleText but has a previewText`, () => {
    const { openText } = require('../src/model/doc');
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', '..', 'examples', `${kind}.yaml`);
    const { doc } = openText(fs.readFileSync(file, 'utf8'), { id: 'a', now: 1 });
    assert.equal(doc.mode, 'structured');
    let first = true;
    const model = K.mapEntries(doc.model, e => { if (first) { first = false; return { ...e, clue: '' }; } return e; });
    const cleared = { ...doc, model };
    assert.equal(puzzleText(cleared), null);
    assert.notEqual(previewText(cleared), null);
  });

  test(`${kind}: the fill command is one undo step`, () => {
    const doc = newDoc({ id: 'a', now: 1, kind, size: Object.fromEntries(K.sizeFields.map(f => [f.name, (SIZES[kind] || {})[f.name] ?? f.default])) });
    let s = reduce(initialState(), { type: 'OPEN_DOC', doc });
    const before = s.doc.model;
    s = reduce(s, { type: 'MODEL_COMMAND', name: 'fillEmptyClues', args: [], now: 5 });
    assert.equal(emptyClueCount(s.doc.model, K.mapEntries), 0);
    assert.equal(canUndo(s.history), true);
    s = reduce(s, { type: 'UNDO' });
    assert.equal(s.doc.model, before);
  });
}

// A spiral with every cell and title filled but no clues.
function unclued() {
  let doc = newDoc({ id: 'a', now: 1, kind: 'spiral', size: { cells: 40 } });
  const K = STRUCTURED.spiral;
  let m = K.commands.setHeader(doc.model, 'title', 'T');
  const letters = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmn'.split('');
  letters.forEach((ch, i) => { m = K.commands.setCell(m, i, ch); });
  return { ...doc, model: m };
}

test('previewText fills clues for an otherwise complete puzzle; the real text stays null', () => {
  const doc = unclued();
  assert.equal(puzzleText(doc), null);
  const text = previewText(doc);
  assert.match(text, /Lorem ipsum/);
  assert.equal(doc.model.cuts.inward.entries[0].clue, '', 'document untouched');
});

test('previewText is null while a cell is still empty, and equals puzzleText when complete', () => {
  const blank = newDoc({ id: 'a', now: 1, kind: 'spiral', size: { cells: 40 } });
  assert.equal(previewText(blank), null);
  const done = fillDoc(unclued());
  assert.equal(previewText(done), puzzleText(done));
});

function fillDoc(doc) {
  return { ...doc, model: fillEmptyClues(doc.model, STRUCTURED.spiral.mapEntries) };
}

test('usesPlaceholders is true only while a clue is empty and the rest is complete', () => {
  const open = (doc) => reduce(initialState(), { type: 'OPEN_DOC', doc });
  assert.equal(usesPlaceholders(open(unclued())), true);
  assert.equal(usesPlaceholders(open(fillDoc(unclued()))), false);
  assert.equal(usesPlaceholders(open(newDoc({ id: 'a', now: 1, kind: 'spiral', size: { cells: 40 } }))), false);
});

test('a preview result for the placeholder text is shown, and is not stale', () => {
  let s = reduce(initialState(), { type: 'OPEN_DOC', doc: unclued() });
  const text = previewText(s.doc);
  s = reduce(s, { type: 'PREVIEW_RESULT', text, result: { html: '<p>x</p>', errors: [], warnings: [] } });
  assert.equal(previewHtml(s), '<p>x</p>');
  assert.equal(previewIsStale(s), false);
  // The real document still has no export-ready check.
  assert.equal(puzzleText(s.doc), null);
});

test('a preview result for text that has since changed is dropped', () => {
  let s = reduce(initialState(), { type: 'OPEN_DOC', doc: unclued() });
  s = reduce(s, { type: 'PREVIEW_RESULT', text: 'old', result: { html: '<p>x</p>', errors: [], warnings: [] } });
  assert.equal(previewHtml(s), null);
});

test('the preview never goes back to an older build while a newer good one exists', () => {
  const ok = (html) => ({ html, errors: [], warnings: [] });
  let s = reduce(initialState(), { type: 'OPEN_DOC', doc: fillDoc(unclued()) });
  s = reduce(s, { type: 'CHECK_RESULT', text: puzzleText(s.doc), result: ok('A') });
  assert.equal(previewHtml(s), 'A');
  // Clearing a clue: the placeholder build B replaces A.
  s = reduce(s, { type: 'MODEL_COMMAND', name: 'setClue', args: ['inward', 0, ''], now: 5 });
  s = reduce(s, { type: 'PREVIEW_RESULT', text: previewText(s.doc), result: ok('B') });
  assert.equal(previewHtml(s), 'B');
  // Clearing a cell too: nothing can be built; the page stays on B, not the stale A.
  s = reduce(s, { type: 'MODEL_COMMAND', name: 'setCell', args: [0, ''], now: 6 });
  assert.equal(previewHtml(s), 'B');
  // Filling the last empty clue: the check of the new text isn't in yet; still B, then C.
  s = reduce(s, { type: 'MODEL_COMMAND', name: 'setCell', args: [0, 'a'], now: 7 });
  s = reduce(s, { type: 'MODEL_COMMAND', name: 'setClue', args: ['inward', 0, 'Mine'], now: 8 });
  assert.equal(previewHtml(s), 'B');
  s = reduce(s, { type: 'CHECK_RESULT', text: puzzleText(s.doc), result: ok('C') });
  assert.equal(previewHtml(s), 'C');
});

test('puzzleText and previewText are stable per model and recompute when the model changes', () => {
  const doc = unclued();
  const first = previewText(doc);
  assert.equal(previewText(doc), first);
  assert.equal(previewText({ ...doc }), first, 'same model, same text');
  const done = fillDoc(doc);
  const text = puzzleText(done);
  assert.equal(puzzleText(done), text);
  const edited = { ...done, model: STRUCTURED.spiral.commands.setClue(done.model, 'inward', 0, 'Changed clue') };
  assert.match(puzzleText(edited), /Changed clue/);
  assert.equal(puzzleText(done), text, 'the old model keeps its text');
  const cleared = { ...doc, model: STRUCTURED.spiral.commands.setCell(doc.model, 0, '') };
  assert.equal(previewText(cleared), null);
  assert.equal(previewText(doc), first);
});
