'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeHelpRecord } = require('../engine-state.mjs');

test('a new help record has counted nothing', () => {
  assert.deepEqual(makeHelpRecord().get(), { checks: 0, reveals: 0 });
});

test('checks and reveals count independently', () => {
  const helpRecord = makeHelpRecord();
  helpRecord.countCheck();
  helpRecord.countCheck();
  helpRecord.countReveal();
  assert.deepEqual(helpRecord.get(), { checks: 2, reveals: 1 });
});

test('reset zeroes both counts', () => {
  const helpRecord = makeHelpRecord();
  helpRecord.countCheck();
  helpRecord.countReveal();
  helpRecord.reset();
  assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 0 });
});

test('get returns a snapshot, not the live counts', () => {
  const helpRecord = makeHelpRecord();
  const before = helpRecord.get();
  helpRecord.countCheck();
  assert.deepEqual(before, { checks: 0, reveals: 0 });
});

test('saveFields nests the counts under help', () => {
  const helpRecord = makeHelpRecord();
  helpRecord.countCheck();
  helpRecord.countCheck();
  helpRecord.countReveal();
  assert.deepEqual(helpRecord.saveFields(), { help: { checks: 2, reveals: 1 } });
});

test('restoreFields round-trips saveFields', () => {
  const a = makeHelpRecord();
  a.countCheck();
  a.countReveal();
  a.countReveal();
  const b = makeHelpRecord();
  b.restoreFields(a.saveFields());
  assert.deepEqual(b.get(), { checks: 1, reveals: 2 });
});

test('restoreFields reads a save with no help field as zero counts', () => {
  const helpRecord = makeHelpRecord();
  helpRecord.countCheck();
  helpRecord.restoreFields({});
  assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 0 });
});

test('restoreFields reads a malformed help field as zero counts', () => {
  for (const bad of [null, 'x', 3, { checks: 'x' }, { checks: -1, reveals: 2.5 }]) {
    const helpRecord = makeHelpRecord();
    helpRecord.restoreFields({ help: bad });
    assert.deepEqual(helpRecord.get(), { checks: 0, reveals: 0 }, JSON.stringify(bad));
  }
});

test('restoreFields keeps a valid count when the other is malformed', () => {
  const helpRecord = makeHelpRecord();
  helpRecord.restoreFields({ help: { checks: 4, reveals: 'x' } });
  assert.deepEqual(helpRecord.get(), { checks: 4, reveals: 0 });
});
