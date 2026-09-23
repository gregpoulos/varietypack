'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resetAndRefocus } = require('../../shared/engine-state');

test('resetAndRefocus drops composition first and refocuses last', () => {
  const calls = [];
  resetAndRefocus({
    composer:     { reset: () => calls.push('composer') },
    clearBoard:   () => calls.push('board'),
    clearState:   () => calls.push('storage'),
    timer:        { reset: () => calls.push('timer') },
    latch:        { reset: () => calls.push('latch') },
    focusInitial: () => calls.push('focus'),
  });
  assert.equal(calls[0], 'composer');
  assert.equal(calls[calls.length - 1], 'focus');
  assert.deepEqual([...calls].sort(), ['board', 'composer', 'focus', 'latch', 'storage', 'timer']);
});
