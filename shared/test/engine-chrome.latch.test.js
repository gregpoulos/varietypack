'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeCompletionLatch } = require('../../shared/engine-chrome');

function makeLatch(opts = {}) {
  const events = [];
  const msgs = [];
  const puzzleRoot = { dispatchEvent: (e) => events.push(e) };
  const latch = makeCompletionLatch({
    puzzleRoot,
    kind:         opts.kind        ?? 'snake-charmer',
    title:        opts.title       ?? 'Test Puzzle',
    date:         opts.date        ?? '2026',
    getBoardHash: opts.getBoardHash ?? (() => 'abc123'),
    getSolution:  opts.getSolution  ?? (() => 'solution'),
    getElapsedMs: opts.getElapsedMs ?? (() => 1234),
    _postMessage: (msg) => msgs.push(msg),
  });
  return { latch, events, msgs };
}

test('check does not fire when isSolved is false', () => {
  const { latch, events } = makeLatch();
  latch.check(false);
  assert.strictEqual(events.length, 0);
});

test('check fires exactly once when isSolved is true', () => {
  const { latch, events } = makeLatch();
  latch.check(true);
  latch.check(true); // second call — must not fire again
  assert.strictEqual(events.length, 1);
});

test('sealIfSolved(true) suppresses all future check() calls', () => {
  const { latch, events } = makeLatch();
  latch.sealIfSolved(true);
  latch.check(true);
  assert.strictEqual(events.length, 0);
});

test('sealIfSolved(false) does not suppress subsequent check()', () => {
  const { latch, events } = makeLatch();
  latch.sealIfSolved(false);
  latch.check(true);
  assert.strictEqual(events.length, 1);
});

test('fired CustomEvent has type varietypack:complete', () => {
  const { latch, events } = makeLatch();
  latch.check(true);
  assert.strictEqual(events[0].type, 'varietypack:complete');
});

test('CustomEvent detail contains all required fields', () => {
  const { latch, events } = makeLatch({
    kind: 'spiral', title: 'My Puzzle', date: '2026-01',
    getBoardHash: () => 'deadbeef',
    getSolution:  () => 'thesolution',
    getElapsedMs: () => 42000,
  });
  latch.check(true);
  const { detail } = events[0];
  assert.strictEqual(detail.kind,      'spiral');
  assert.strictEqual(detail.title,     'My Puzzle');
  assert.strictEqual(detail.date,      '2026-01');
  assert.strictEqual(detail.boardHash, 'deadbeef');
  assert.strictEqual(detail.solution,  'thesolution');
  assert.strictEqual(detail.timeMs,    42000);
});

test('CustomEvent detail.timeMs comes from getElapsedMs at fire time', () => {
  let elapsed = 0;
  const { latch, events } = makeLatch({ getElapsedMs: () => elapsed });
  elapsed = 99999;
  latch.check(true);
  assert.strictEqual(events[0].detail.timeMs, 99999);
});

test('postMessage payload matches detail minus solution', () => {
  const { latch, msgs } = makeLatch({
    kind: 'marching-bands', title: 'T', date: '2026',
    getBoardHash: () => 'hash1',
    getSolution:  () => 'sol',
    getElapsedMs: () => 5000,
  });
  latch.check(true);
  assert.strictEqual(msgs.length, 1);
  const msg = msgs[0];
  assert.strictEqual(msg.type,      'varietypack:complete');
  assert.strictEqual(msg.kind,      'marching-bands');
  assert.strictEqual(msg.boardHash, 'hash1');
  assert.strictEqual(msg.timeMs,    5000);
  assert.strictEqual(msg.solution,  undefined); // must not be present
});

test('reset() allows check() to fire again after sealIfSolved sealed the latch', () => {
  const { latch, events } = makeLatch();
  latch.sealIfSolved(true);
  latch.reset();
  latch.check(true);
  assert.strictEqual(events.length, 1);
});

test('reset() allows check() to fire again after it already fired', () => {
  const { latch, events } = makeLatch();
  latch.check(true);  // fires once
  latch.reset();
  latch.check(true);  // should fire again
  assert.strictEqual(events.length, 2);
});

test('CustomEvent options: bubbles and composed are true', () => {
  // The constructor is called with CustomEvent(type, { bubbles, composed, detail }).
  // We capture the constructed event via puzzleRoot.dispatchEvent.
  let capturedInit;
  const OriginalCustomEvent = global.CustomEvent;
  const Base = OriginalCustomEvent ?? Object;
  global.CustomEvent = class extends Base {
    constructor(type, init) { super(type, init); capturedInit = init; }
  };
  const puzzleRoot = { dispatchEvent: () => {} };
  const latch = makeCompletionLatch({
    puzzleRoot,
    kind: 'spiral', title: 'T', date: '2026',
    getBoardHash: () => 'h', getSolution: () => 's', getElapsedMs: () => 0,
    _postMessage: () => {},
  });
  try {
    latch.check(true);
    assert.strictEqual(capturedInit.bubbles,  true);
    assert.strictEqual(capturedInit.composed, true);
  } finally {
    if (OriginalCustomEvent) global.CustomEvent = OriginalCustomEvent;
    else delete global.CustomEvent;
  }
});
