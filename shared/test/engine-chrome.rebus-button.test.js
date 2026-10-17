'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupRebusButton } = require('../engine-chrome.mjs');

// The button is DOM-coupled but touches no document/window globals, so it takes a plain
// mock on the setupClearButton precedent. `mousedown` reports whether the handler
// canceled the event — that cancellation is the whole focus-preservation mechanism.
function makeBtn() {
  const listeners = [];
  const fire = (type, e) => {
    for (const l of listeners) if (l.type === type) l.fn(e);
  };
  return {
    textContent: '',
    disabled: false,
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    click(e = {}) { fire('click', e); },
    mousedown() {
      let prevented = false;
      fire('mousedown', { preventDefault() { prevented = true; } });
      return prevented;
    },
    pointerdown() {
      let seen = false;
      for (const l of listeners) if (l.type === 'pointerdown') seen = true;
      return seen;
    },
  };
}

// Minimal harness: composing is a plain flag the fake onToggle flips, so the tests
// exercise the button's own logic rather than a stubbed composer.
function harness() {
  const state = { composing: false, toggles: 0, refocused: 0 };
  const btn = makeBtn();
  const api = setupRebusButton(btn, {
    onToggle:    () => { state.toggles++; state.composing = !state.composing; },
    isComposing: () => state.composing,
    refocus:     () => { state.refocused++; },
  });
  return { btn, state, api };
}

test('activating the button toggles composition', () => {
  const { btn, state } = harness();
  btn.click();
  assert.strictEqual(state.toggles, 1);
});

// Focus-on-click is a mousedown default action, so canceling mousedown keeps focus on
// the hidden input and a phone's soft keyboard open.
test('mousedown is canceled so focus never moves off the hidden input', () => {
  const { btn } = harness();
  assert.strictEqual(btn.mousedown(), true);
});

// Not a style preference. On a WebKit (iOS) touch tap, canceling pointerdown suppresses
// the click entirely and the button never activates; canceling mousedown does not.
// Chromium fires click either way, so a Chromium-only suite cannot see the difference —
// hence this structural assertion rather than a behavioral one.
test('focus preservation is bound to mousedown, never pointerdown', () => {
  const { btn } = harness();
  assert.strictEqual(btn.pointerdown(), false, 'no pointerdown listener may be registered');
});

test('the label reads Rebus before any composition begins', () => {
  const { btn } = harness();
  assert.strictEqual(btn.textContent, 'Rebus');
});

test('the label reads Done while a cell is composing', () => {
  const { btn } = harness();
  btn.click();
  assert.strictEqual(btn.textContent, 'Done');
});

// Composition also ends by moving the cursor (composer.commitIfMoved), which never
// touches the button — the engine's syncUI calls sync() to catch up.
test('sync() restores the label when composition ended elsewhere', () => {
  const { btn, state, api } = harness();
  btn.click();
  state.composing = false;   // as if commitIfMoved committed on a cursor move
  api.sync();
  assert.strictEqual(btn.textContent, 'Rebus');
});

// The spoiler rule: nothing in the UI may vary with a cell's capacity. #check-btn is
// disabled per-cell and must not be copied here.
test('the button is never disabled, in any state', () => {
  const { btn, api } = harness();
  assert.strictEqual(btn.disabled, false);
  btn.click();               // composing
  api.sync();
  assert.strictEqual(btn.disabled, false);

  const solvedCase = harness({ solved: true });
  solvedCase.btn.click();
  solvedCase.api.sync();
  assert.strictEqual(solvedCase.btn.disabled, false);
});

// Needed for the keyboard path: a Tab-focused button keeps focus after activation, so
// letters would go nowhere without this. On touch it is a no-op, since the canceled
// mousedown already kept focus where it was.
test('refocus runs after activation so letter input keeps working', () => {
  const { btn, state } = harness();
  btn.click();
  assert.strictEqual(state.refocused, 1);
});

// setupKeydown returns early on any meta/ctrl chord, so Cmd+Enter cannot open
// composition. A click carries the same modifiers and must match, or the two entry
// points diverge on exactly the input CROSS_TOOL_SPEC says they share.
test('a modified click is ignored, matching setupKeydown', () => {
  for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
    const { btn, state } = harness();
    btn.click(mod);
    assert.strictEqual(state.toggles, 0);
    assert.strictEqual(state.refocused, 0);
  }
});
