'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextMenuItem } = require('../engine-chrome.mjs');

test('ArrowDown skips disabled rows', () => assert.equal(nextMenuItem([true, false, true], 0, 'ArrowDown'), 2));
test('ArrowDown wraps to the first enabled row', () => assert.equal(nextMenuItem([true, false, true], 2, 'ArrowDown'), 0));
test('ArrowUp wraps and skips disabled rows', () => assert.equal(nextMenuItem([true, true, false], 0, 'ArrowUp'), 1));
test('ArrowDown from no row goes to the first enabled one', () => assert.equal(nextMenuItem([false, true], -1, 'ArrowDown'), 1));
test('ArrowUp from no row goes to the last enabled one', () => {
  assert.equal(nextMenuItem([true, true, true], -1, 'ArrowUp'), 2);
  assert.equal(nextMenuItem([true, true, false], -1, 'ArrowUp'), 1);
});
test('Home and End go to the first and last enabled rows', () => {
  assert.equal(nextMenuItem([false, true, true], 2, 'Home'), 1);
  assert.equal(nextMenuItem([true, true, false], 0, 'End'), 1);
});
test('nothing enabled gives -1', () => assert.equal(nextMenuItem([false, false], -1, 'ArrowDown'), -1));
