'use strict';

const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupArmedButton } = require('../engine-chrome.mjs');

function makeBtn() {
  const listeners = [];
  const classes = new Set();
  return {
    focusVisible: false,
    matches(sel) { return sel === ':focus-visible' && this.focusVisible; },
    textContent: 'Clear puzzle',
    classList: {
      add(c)      { classes.add(c); },
      remove(c)   { classes.delete(c); },
      contains(c) { return classes.has(c); },
    },
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    click() {
      for (const { type, fn } of listeners) { if (type === 'click') fn(); }
    },
  };
}

// The 3s lapse runs on mock timers; real ones keep the process waiting out each.
beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

test('arming then confirming calls onConfirmed exactly once', () => {
  const btn = makeBtn();
  let confirmed = 0;
  setupArmedButton(btn, () => confirmed++, null);
  btn.click();
  assert.strictEqual(confirmed, 0, 'the arming click does not confirm');
  btn.click();
  assert.strictEqual(confirmed, 1);
  btn.click(); // button is disarmed after confirm; a third click re-arms but does not confirm
  assert.strictEqual(confirmed, 1);
});

test('arming shows "Are you sure?" and the .armed class', () => {
  const btn = makeBtn();
  setupArmedButton(btn, () => {}, null);
  btn.click();
  assert.strictEqual(btn.textContent, 'Are you sure?');
  assert.ok(btn.classList.contains('armed'));
});

test('refocus runs on arming, not on confirming, and not under keyboard focus', () => {
  const btn = makeBtn();
  let refocused = 0;
  setupArmedButton(btn, () => {}, () => refocused++);
  btn.click(); // arm, pointer focus
  assert.strictEqual(refocused, 1);
  btn.click(); // confirm: refocus must stay 1
  assert.strictEqual(refocused, 1);

  const kbd = makeBtn();
  let kbdRefocused = 0;
  kbd.focusVisible = true;
  setupArmedButton(kbd, () => {}, () => kbdRefocused++);
  kbd.click();
  assert.strictEqual(kbdRefocused, 0);
});

test('the label returns to what the button read at setup', () => {
  const btn = makeBtn();
  btn.textContent = 'Reveal puzzle';
  setupArmedButton(btn, () => {}, null);
  btn.click();
  assert.strictEqual(btn.textContent, 'Are you sure?');
  assert.ok(btn.classList.contains('armed'));
  btn.click(); // confirms and disarms
  assert.strictEqual(btn.textContent, 'Reveal puzzle');
  assert.ok(!btn.classList.contains('armed'));

  const clear = makeBtn(); // reads Clear puzzle at setup
  setupArmedButton(clear, () => {}, null);
  clear.click();
  clear.click();
  assert.strictEqual(clear.textContent, 'Clear puzzle');
});

test('disarm restores the label and cancels the lapse', () => {
  const btn = makeBtn();
  let confirmed = 0;
  const { disarm } = setupArmedButton(btn, () => confirmed++, null);
  btn.click();
  assert.strictEqual(btn.textContent, 'Are you sure?');
  mock.timers.tick(2000);
  disarm();
  assert.strictEqual(btn.textContent, 'Clear puzzle');
  assert.ok(!btn.classList.contains('armed'));
  // Disarmed, so the next click arms again instead of confirming.
  btn.click();
  assert.strictEqual(confirmed, 0);
  assert.strictEqual(btn.textContent, 'Are you sure?');
  // The first arming's timer would fire 1000ms from now; a canceled one doesn't.
  mock.timers.tick(1500);
  assert.strictEqual(btn.textContent, 'Are you sure?');
});

test('an armed button disarms by itself after 3s, not before', () => {
  const btn = makeBtn();
  let confirmed = 0;
  setupArmedButton(btn, () => confirmed++, null);
  btn.click();
  mock.timers.tick(2999);
  assert.strictEqual(btn.textContent, 'Are you sure?');
  mock.timers.tick(1);
  assert.strictEqual(btn.textContent, 'Clear puzzle');
  assert.ok(!btn.classList.contains('armed'));
  btn.click(); // arms again rather than confirming
  assert.strictEqual(confirmed, 0);
  assert.strictEqual(btn.textContent, 'Are you sure?');
});
