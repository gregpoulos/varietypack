'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { switchTipPlacement, makeSwitchTipGate } = require('../engine-chrome.mjs');

// ---- Placement ------------------------------------------------------------------------

const rect = (left, top, width, height) =>
  ({ left, top, width, height, right: left + width, bottom: top + height });
const BOARD = rect(100, 100, 600, 600);
const TIP = { width: 260, height: 30 };
const VIEWPORT = { width: 1000, top: 0, bottom: 1000 };
const place = (target, board = BOARD, viewport = VIEWPORT) =>
  switchTipPlacement({ target, board, tip: TIP, viewport });
const centerX = r => r.left + r.width / 2;

test('the arrow points at the middle of the target', () => {
  for (const target of [rect(380, 150, 40, 40), rect(110, 150, 40, 40), rect(650, 600, 40, 40)]) {
    const p = place(target);
    assert.equal(p.left + p.arrowX, centerX(target));
  }
});

test('the tip is centered on the target when the window has room', () => {
  const target = rect(380, 150, 40, 40);
  const p = place(target);
  assert.equal(p.left + TIP.width / 2, centerX(target));
});

// A target near the window's edge keeps the tip on screen; the arrow still finds it.
test('the tip stays inside the window', () => {
  for (const target of [rect(0, 150, 40, 40), rect(960, 150, 40, 40)]) {
    const p = place(target);
    assert.ok(p.left > 0, `left ${p.left}`);
    assert.ok(p.left + TIP.width < VIEWPORT.width, `right ${p.left + TIP.width}`);
    assert.ok(p.arrowX > 0 && p.arrowX < TIP.width, `arrow ${p.arrowX}`);
  }
});

test('a target in the board\'s top half gets the tip below it, clear of it', () => {
  const target = rect(380, 150, 40, 40);
  const p = place(target);
  assert.equal(p.above, false);
  assert.ok(p.top > target.bottom);
});

test('a target in the board\'s bottom half gets the tip above it, clear of it', () => {
  const target = rect(380, 600, 40, 40);
  const p = place(target);
  assert.equal(p.above, true);
  assert.ok(p.top + TIP.height < target.top);
});

// The toggle has no board around it: the tip goes under it, room allowing.
test('with no board, the tip goes below the target', () => {
  const target = rect(380, 800, 200, 30);
  const p = place(target, null);
  assert.equal(p.above, false);
  assert.ok(p.top > target.bottom);
});

// Spiral's toggle sits under the board, so on a short window it can be near the bottom.
test('a target with no room below gets the tip above it, on screen', () => {
  const target = rect(380, 940, 200, 30);
  const p = place(target, null);
  assert.equal(p.above, true);
  assert.ok(p.top + TIP.height < target.top);
  assert.ok(p.top >= VIEWPORT.top);
});

// The page is scrolled so a cell in the board's bottom half sits just under the fixed
// active-clue bar, which the tip must not slip beneath.
test('a target with no room above, below anything fixed, gets the tip below it', () => {
  const board = rect(100, -400, 600, 600);
  const target = rect(380, 70, 40, 40);
  const p = place(target, board, { width: 1000, top: 56, bottom: 1000 });
  assert.equal(p.above, false);
  assert.ok(p.top > target.bottom);
});

// ---- Whether to show ------------------------------------------------------------------

function memoryStorage() {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}
// A "." keydown as the engine's switch passes it on: from the keyboard, or dispatched by
// the page itself.
const PERIOD = { key: '.', isTrusted: true };
const DISPATCHED = { key: '.', isTrusted: false };

test('the tip shows on the first mouse switch, and only once per page', () => {
  const gate = makeSwitchTipGate(memoryStorage());
  assert.equal(gate.claim(), true);
  assert.equal(gate.claim(), false);
});

test('pressing the period key stops the tip for good, across page loads', () => {
  const storage = memoryStorage();
  makeSwitchTipGate(storage).noteKey(PERIOD);
  assert.equal(makeSwitchTipGate(storage).claim(), false);
});

test('pressing the period key stops the tip on the current page too', () => {
  const gate = makeSwitchTipGate(memoryStorage());
  gate.noteKey(PERIOD);
  assert.equal(gate.claim(), false);
});

// The phone view's drawn switch key sends one; tapping it teaches nothing about ".".
test('a "." the page dispatched itself leaves the tip to show', () => {
  const storage = memoryStorage();
  const gate = makeSwitchTipGate(storage);
  gate.noteKey(DISPATCHED);
  assert.equal(gate.claim(), true);
  assert.equal(makeSwitchTipGate(storage).claim(), true);
});

// A sandboxed frame (the studio's test-solve preview) throws on any localStorage use.
test('unusable storage still lets the tip show once', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const gate = makeSwitchTipGate(broken);
  assert.equal(gate.claim(), true);
  assert.doesNotThrow(() => gate.noteKey(PERIOD));
  assert.equal(gate.claim(), false);
});
