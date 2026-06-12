'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupClearButton } = require('../../shared/engine-chrome');

function makeBtn() {
  const listeners = [];
  const classes = new Set();
  return {
    textContent: 'Clear',
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
  setupClearButton(btn, () => confirmed++, null);
  btn.click();
  assert.strictEqual(confirmed, 0);
});

test('onConfirmed is called on second (confirming) click', () => {
  const btn = makeBtn();
  let confirmed = 0;
  setupClearButton(btn, () => confirmed++, null);
  btn.click();
  btn.click();
  assert.strictEqual(confirmed, 1);
});

test('onConfirmed is called exactly once on second click', () => {
  const btn = makeBtn();
  let confirmed = 0;
  setupClearButton(btn, () => confirmed++, null);
  btn.click();
  btn.click();
  btn.click(); // button is disarmed after confirm; third click re-arms but does not confirm
  assert.strictEqual(confirmed, 1);
});

test('button label becomes Sure? after first click', () => {
  const btn = makeBtn();
  setupClearButton(btn, () => {}, null);
  btn.click();
  assert.strictEqual(btn.textContent, 'Sure?');
});

test('button gets .armed class after first click', () => {
  const btn = makeBtn();
  setupClearButton(btn, () => {}, null);
  btn.click();
  assert.ok(btn.classList.contains('armed'));
});

test('refocus is called on first (arming) click', () => {
  const btn = makeBtn();
  let refocused = 0;
  setupClearButton(btn, () => {}, () => refocused++);
  btn.click();
  assert.strictEqual(refocused, 1);
});

test('refocus is not called on second (confirming) click', () => {
  const btn = makeBtn();
  let refocused = 0;
  setupClearButton(btn, () => {}, () => refocused++);
  btn.click(); // arm → refocused = 1
  btn.click(); // confirm → refocused must stay 1
  assert.strictEqual(refocused, 1);
});
