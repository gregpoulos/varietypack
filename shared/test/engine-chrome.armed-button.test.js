'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupArmedButton } = require('../engine-chrome.mjs');

function makeBtn() {
  const listeners = [];
  const classes = new Set();
  return {
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

test('onConfirmed is not called on first (arming) click', () => {
  const btn = makeBtn();
  let confirmed = 0;
  setupArmedButton(btn, () => confirmed++, null);
  btn.click();
  assert.strictEqual(confirmed, 0);
});

test('onConfirmed is called on second (confirming) click', () => {
  const btn = makeBtn();
  let confirmed = 0;
  setupArmedButton(btn, () => confirmed++, null);
  btn.click();
  btn.click();
  assert.strictEqual(confirmed, 1);
});

test('onConfirmed is called exactly once on second click', () => {
  const btn = makeBtn();
  let confirmed = 0;
  setupArmedButton(btn, () => confirmed++, null);
  btn.click();
  btn.click();
  btn.click(); // button is disarmed after confirm; third click re-arms but does not confirm
  assert.strictEqual(confirmed, 1);
});

test('button label becomes "Are you sure?" after first click', () => {
  const btn = makeBtn();
  setupArmedButton(btn, () => {}, null);
  btn.click();
  assert.strictEqual(btn.textContent, 'Are you sure?');
});

test('button gets .armed class after first click', () => {
  const btn = makeBtn();
  setupArmedButton(btn, () => {}, null);
  btn.click();
  assert.ok(btn.classList.contains('armed'));
});

test('refocus is called on first (arming) click', () => {
  const btn = makeBtn();
  let refocused = 0;
  setupArmedButton(btn, () => {}, () => refocused++);
  btn.click();
  assert.strictEqual(refocused, 1);
});

test('refocus is not called on second (confirming) click', () => {
  const btn = makeBtn();
  let refocused = 0;
  setupArmedButton(btn, () => {}, () => refocused++);
  btn.click(); // arm → refocused = 1
  btn.click(); // confirm → refocused must stay 1
  assert.strictEqual(refocused, 1);
});

test('the label it returns to is whatever the button read at setup', () => {
  const btn = makeBtn();
  btn.textContent = 'Reveal puzzle';
  setupArmedButton(btn, () => {}, null);
  btn.click();
  assert.strictEqual(btn.textContent, 'Are you sure?');
  assert.ok(btn.classList.contains('armed'));
  btn.click(); // confirms and disarms
  assert.strictEqual(btn.textContent, 'Reveal puzzle');
  assert.ok(!btn.classList.contains('armed'));
});

test('a button that reads Clear puzzle at setup returns to Clear puzzle', () => {
  const btn = makeBtn();
  setupArmedButton(btn, () => {}, null);
  btn.click();
  btn.click();
  assert.strictEqual(btn.textContent, 'Clear puzzle');
});

test('setupArmedButton returns a disarm that restores the label and cancels the lapse timer', () => {
  const btn = makeBtn();
  let confirmed = 0;
  const { disarm } = setupArmedButton(btn, () => confirmed++, null);
  btn.click();
  assert.strictEqual(btn.textContent, 'Are you sure?');
  disarm();
  assert.strictEqual(btn.textContent, 'Clear puzzle');
  assert.ok(!btn.classList.contains('armed'));
  // Disarmed, so the next click arms again instead of confirming.
  btn.click();
  assert.strictEqual(confirmed, 0);
  assert.strictEqual(btn.textContent, 'Are you sure?');
});
