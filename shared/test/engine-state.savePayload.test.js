'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeSavePayload } = require('../engine-state.mjs');

// Stand-ins that log what the payload calls, in order.
function parts(log = []) {
  return {
    log,
    cells: {
      saveFields: () => ({ letters: { 0: 'a' }, correct: [0] }),
      fitsSave: saved => saved.letters !== undefined,
      restoreFields: () => log.push('cells'),
    },
    helpRecord: {
      saveFields: () => ({ help: { checks: 2, reveals: 1 } }),
      restoreFields: saved => log.push(`help:${JSON.stringify(saved.help)}`),
    },
    timer: { getElapsedMs: () => 4200, restoreMs: ms => log.push(`timer:${ms}`) },
    composer: { getComposing: () => 3, restore: n => log.push(`composer:${n}`) },
  };
}

test('getState joins the cells, the help counts, the elapsed time and the composing cell', () => {
  const { getState } = makeSavePayload(parts());
  assert.deepEqual(getState(), {
    letters: { 0: 'a' }, correct: [0], help: { checks: 2, reveals: 1 }, activeMs: 4200, composing: 3,
  });
});

test('fits is the cell store\'s own check', () => {
  const { fits } = makeSavePayload(parts());
  assert.equal(fits({ letters: {} }), true);
  assert.equal(fits({}), false);
});

test('applyState restores the letters first and the composition last', () => {
  const p = parts();
  makeSavePayload(p).applyState({ activeMs: 900, composing: 5, help: { checks: 3, reveals: 2 } });
  assert.deepEqual(p.log, ['cells', 'timer:900', 'help:{"checks":3,"reveals":2}', 'composer:5']);
});
