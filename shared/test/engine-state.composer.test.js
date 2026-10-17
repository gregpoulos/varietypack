'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeComposer, setLetterText, letterLenClass } = require('../engine-state.mjs');

// Mock letter element: only textContent and classList are touched. Mirrors the
// mock-object pattern in engine-chrome.clear-button.test.js — no DOM, no jsdom.
function makeEl() {
  const classes = new Set();
  return {
    textContent: '',
    classList: {
      add(c)      { classes.add(c); },
      remove(c)   { classes.delete(c); },
      contains(c) { return classes.has(c); },
      // DOMTokenList.toggle: with `force`, add when true and remove when false.
      toggle(c, force = !classes.has(c)) { force ? classes.add(c) : classes.delete(c); return force; },
    },
  };
}

// Builds a composer over a plain object store keyed 0..n-1, plus a commit counter, so
// every test can assert on both.
function harness(initial = {}, { solved = false } = {}) {
  const store = { ...initial };
  const commits = [];
  const composer = makeComposer({
    getContent: n => store[n] || '',
    setContent: (n, s) => { store[n] = s; },
    onCommit:   () => commits.push(Object.assign({}, store)),
    isSolved:   () => solved,
  });
  return { composer, store, commits };
}

// Every way into composition (Enter, the Rebus button, Crushword's keystrokes) ends in
// toggle(), so this one check keeps a sealed board closed whichever way it is reached.
test('toggle does nothing once the board is solved', () => {
  const { composer } = harness({ 0: 'A' }, { solved: true });
  composer.toggle(0);
  assert.equal(composer.isComposing(0), false);
});

test('isCellFilled is true for a non-empty, non-composing cell', () => {
  const { composer } = harness({ 0: 'A' });
  assert.equal(composer.isCellFilled(0), true);
});

test('isCellFilled is false for an empty cell', () => {
  const { composer } = harness();
  assert.equal(composer.isCellFilled(0), false);
});

test('isCellFilled is false for a composing cell even when it holds content', () => {
  const { composer } = harness({ 0: 'A' });
  composer.toggle(0);
  assert.equal(composer.isCellFilled(0), false);
});

test('isCellFilled stays true for other cells while one composes', () => {
  const { composer } = harness({ 0: 'A', 1: 'B' });
  composer.toggle(0);
  assert.equal(composer.isCellFilled(1), true);
});

test('typeLetter replaces content and returns true when not composing', () => {
  const { composer, store } = harness({ 0: 'A' });
  assert.equal(composer.typeLetter(0, 'B'), true);
  assert.equal(store[0], 'B');
});

test('typeLetter keeps only the last character when not composing', () => {
  const { composer, store } = harness();
  composer.typeLetter(0, 'HAR');
  assert.equal(store[0], 'R');
});

test('typeLetter appends and returns false while composing', () => {
  const { composer, store } = harness();
  composer.toggle(0);
  assert.equal(composer.typeLetter(0, 'H'), false);
  composer.typeLetter(0, 'A');
  composer.typeLetter(0, 'R');
  assert.equal(store[0], 'HAR');
});

test('typeLetter takes the whole value while composing (paste)', () => {
  const { composer, store } = harness();
  composer.toggle(0);
  composer.typeLetter(0, 'HAR');
  assert.equal(store[0], 'HAR');
});

test('typeLetter caps composed content, dropping input past the cap', () => {
  const { composer, store } = harness();
  composer.toggle(0);
  composer.typeLetter(0, 'ABCDEFGHIJKLMNOP');   // 16 chars in one paste
  assert.equal(store[0], 'ABCDEFGHIJKL');       // capped at 12
  composer.typeLetter(0, 'Z');                  // further input is dropped
  assert.equal(store[0], 'ABCDEFGHIJKL');
});

test('backspace still works at the cap, and re-typing refills to it', () => {
  const { composer, store } = harness();
  composer.toggle(0);
  composer.typeLetter(0, 'ABCDEFGHIJKLMNOP');
  composer.backspace(0);
  assert.equal(store[0], 'ABCDEFGHIJK');
  composer.typeLetter(0, 'Z');
  assert.equal(store[0], 'ABCDEFGHIJKZ');
});

test('toggle keeps existing content rather than clearing it', () => {
  const { composer, store } = harness({ 0: 'H' });
  composer.toggle(0);
  composer.typeLetter(0, 'AR');
  assert.equal(store[0], 'HAR');
});

test('a second toggle on the same cell commits it', () => {
  const { composer, commits } = harness();
  composer.toggle(0);
  assert.equal(composer.isComposing(0), true);
  composer.toggle(0);
  assert.equal(composer.isComposing(0), false);
  assert.equal(commits.length, 1);
});

test('backspace drops one character and returns true while composing', () => {
  const { composer, store } = harness();
  composer.toggle(0);
  composer.typeLetter(0, 'HAR');
  assert.equal(composer.backspace(0), true);
  assert.equal(store[0], 'HA');
});

test('backspace returns false when not composing', () => {
  const { composer } = harness({ 0: 'A' });
  assert.equal(composer.backspace(0), false);
});

test('backspace returns false when composing an empty cell, so the caller retreats', () => {
  const { composer } = harness();
  composer.toggle(0);
  assert.equal(composer.backspace(0), false);
});

test('commitIfMoved commits when the target is a different cell', () => {
  const { composer, commits } = harness();
  composer.toggle(0);
  composer.commitIfMoved(1);
  assert.equal(commits.length, 1);
  assert.equal(composer.isComposing(0), false);
});

test('commitIfMoved is a no-op on the same cell, so composition survives a toggle', () => {
  const { composer, commits } = harness();
  composer.toggle(0);
  composer.commitIfMoved(0);
  assert.equal(commits.length, 0);
  assert.equal(composer.isComposing(0), true);
});

test('commitIfMoved is a no-op when nothing is composing', () => {
  const { composer, commits } = harness({ 0: 'A' });
  composer.commitIfMoved(1);
  assert.equal(commits.length, 0);
});

test('onCommit runs after composingId is cleared, so the cell reads as filled', () => {
  const store = { 0: 'HAR' };
  let filledAtCommit = null;
  const composer = makeComposer({
    getContent: n => store[n] || '',
    setContent: (n, s) => { store[n] = s; },
    onCommit:   () => { filledAtCommit = composer.isCellFilled(0); },
    isSolved:   () => false,
  });
  composer.toggle(0);
  composer.toggle(0);
  assert.equal(filledAtCommit, true);
});

test('reset drops composing state without firing onCommit', () => {
  const { composer, commits } = harness();
  composer.toggle(0);
  composer.reset();
  assert.equal(commits.length, 0);
  assert.equal(composer.isComposing(0), false);
});

test('letterLenClass maps typed length to a class', () => {
  assert.equal(letterLenClass(''),      null);
  assert.equal(letterLenClass('A'),     null);
  assert.equal(letterLenClass('HA'),    'len-2');
  assert.equal(letterLenClass('HAR'),   'len-3');
  assert.equal(letterLenClass('HARD'),  'len-long');
  assert.equal(letterLenClass('HARDY'), 'len-long');
});

test('setLetterText sets text and the matching length class', () => {
  const el = makeEl();
  setLetterText(el, 'HAR');
  assert.equal(el.textContent, 'HAR');
  assert.ok(el.classList.contains('len-3'));
});

test('setLetterText shows the stored lowercase form uppercased', () => {
  const el = makeEl();
  setLetterText(el, 'har');
  assert.equal(el.textContent, 'HAR');
  assert.ok(el.classList.contains('len-3'));
});

test('setLetterText swaps the length class when content shrinks', () => {
  const el = makeEl();
  setLetterText(el, 'HAR');
  setLetterText(el, 'HA');
  assert.ok(el.classList.contains('len-2'));
  assert.equal(el.classList.contains('len-3'), false);
});

test('setLetterText removes every length class when cleared', () => {
  const el = makeEl();
  setLetterText(el, 'HARD');
  setLetterText(el, '');
  assert.equal(el.textContent, '');
  for (const c of ['len-2', 'len-3', 'len-long']) {
    assert.equal(el.classList.contains(c), false);
  }
});

// ── Composition survives a reload ────────────────────────────────────────────
// Autosave fires at every mutation site, including mid-composition, and on mobile also
// on every app switch and screen lock (setupTimer's visibility listener). Without the
// composing id in the payload, a reload silently commits a half-typed prefix: the cell
// comes back filled, counts toward isBoardFilled, and can be checked as a wrong answer
// the solver never submitted.

test('getComposing returns null when no cell is composing', () => {
  const { composer } = harness({ 0: 'A' });
  assert.equal(composer.getComposing(), null);
});

test('getComposing returns the id of the composing cell', () => {
  const { composer } = harness({ 0: 'A' });
  composer.toggle(0);
  assert.equal(composer.getComposing(), 0);
});

test('restore reopens composition, so a reloaded prefix is not treated as filled', () => {
  const { composer } = harness({ 2: 'HA' });
  composer.restore(2);
  assert.equal(composer.isComposing(2), true);
  assert.equal(composer.isCellFilled(2), false);
});

test('restore keeps the cell content it was given', () => {
  const { composer, store } = harness({ 2: 'HA' });
  composer.restore(2);
  assert.equal(store[2], 'HA');
});

test('restore(null) leaves nothing composing', () => {
  const { composer } = harness({ 0: 'A' });
  composer.restore(null);
  assert.equal(composer.getComposing(), null);
});

// Saves written before this field existed have no `composing` key at all; restore must
// treat that exactly like null rather than opening composition on cell "undefined".
test('restore(undefined) leaves nothing composing, for saves predating the field', () => {
  const { composer } = harness({ 0: 'A' });
  composer.restore(undefined);
  assert.equal(composer.getComposing(), null);
});

test('a restored composing cell commits normally on the next cursor move', () => {
  const { composer, commits } = harness({ 2: 'HA' });
  composer.restore(2);
  composer.commitIfMoved(3);
  assert.equal(composer.getComposing(), null);
  assert.equal(commits.length, 1);
});
