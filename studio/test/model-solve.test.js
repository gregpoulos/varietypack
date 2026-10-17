'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { solveTimeFromMessage, formatSolveTime } = require('../src/model/solve');

test('solveTimeFromMessage: reads timeMs from a completion message', () => {
  assert.equal(solveTimeFromMessage({ type: 'varietypack:complete', timeMs: 83000 }), 83000);
});

test('solveTimeFromMessage: ignores other messages', () => {
  assert.equal(solveTimeFromMessage({ type: 'something:else', timeMs: 1 }), null);
  assert.equal(solveTimeFromMessage(null), null);
  assert.equal(solveTimeFromMessage('varietypack:complete'), null);
});

test('solveTimeFromMessage: a completion with no usable time still counts as a solve', () => {
  assert.equal(solveTimeFromMessage({ type: 'varietypack:complete' }), 0);
  assert.equal(solveTimeFromMessage({ type: 'varietypack:complete', timeMs: 'soon' }), 0);
});

test('formatSolveTime: m:ss', () => {
  assert.equal(formatSolveTime(0), '0:00');
  assert.equal(formatSolveTime(83000), '1:23');
  assert.equal(formatSolveTime(600000), '10:00');
  assert.equal(formatSolveTime(59999), '0:59');
});
