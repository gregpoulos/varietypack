'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeCompletionLatch } = require('../engine-state.mjs');

function makeLatch(opts = {}) {
  const events = [];
  const msgs = [];
  const targets = [];
  const puzzleRoot = { dispatchEvent: (e) => events.push(e) };
  const latch = makeCompletionLatch({
    puzzleRoot,
    kind:         opts.kind        ?? 'snake-charmer',
    title:        opts.title       ?? 'Test Puzzle',
    date:         opts.date        ?? '2026',
    getBoardHash: opts.getBoardHash ?? (() => 'abc123'),
    getSolution:  opts.getSolution  ?? (() => 'solution'),
    getElapsedMs: opts.getElapsedMs ?? (() => 1234),
    getHelp:      opts.getHelp      ?? (() => ({ checks: 0, reveals: 0 })),
    onComplete:   opts.onComplete,
    embedOrigin:  opts.embedOrigin,
    _postMessage: (msg, targetOrigin) => { msgs.push(msg); targets.push(targetOrigin); },
  });
  return { latch, events, msgs, targets };
}

// ── the fired event ──────────────────────────────────────────────────────────

test('check fires one varietypack:complete event, with every detail field read at fire time', () => {
  let elapsed = 0;
  let counts = { checks: 0, reveals: 0 };
  const { latch, events, msgs } = makeLatch({
    kind: 'spiral', title: 'My Puzzle', date: '2026-01',
    getBoardHash: () => 'deadbeef',
    getSolution:  () => 'thesolution',
    getElapsedMs: () => elapsed,
    getHelp:      () => counts,
  });
  elapsed = 99999;                          // changed after the latch was built
  counts = { checks: 5, reveals: 1 };
  latch.check(true);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'varietypack:complete');
  const { detail } = events[0];
  assert.strictEqual(detail.kind,      'spiral');
  assert.strictEqual(detail.title,     'My Puzzle');
  assert.strictEqual(detail.date,      '2026-01');
  assert.strictEqual(detail.boardHash, 'deadbeef');
  assert.strictEqual(detail.solution,  'thesolution');
  assert.strictEqual(detail.timeMs,    99999);
  assert.strictEqual(detail.checks,    5);
  assert.strictEqual(detail.reveals,   1);
  // The posted message carries the help counts too.
  assert.strictEqual(msgs[0].checks,  5);
  assert.strictEqual(msgs[0].reveals, 1);
});

test('without embedOrigin, the message goes to "*" without the solution', () => {
  const { latch, msgs, targets } = makeLatch({
    kind: 'marching-bands', getBoardHash: () => 'hash1', getElapsedMs: () => 5000,
  });
  latch.check(true);
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(targets[0], '*');
  assert.strictEqual(msgs[0].type,      'varietypack:complete');
  assert.strictEqual(msgs[0].kind,      'marching-bands');
  assert.strictEqual(msgs[0].boardHash, 'hash1');
  assert.strictEqual(msgs[0].timeMs,    5000);
  assert.ok(!('solution' in msgs[0]));
});

test('with embedOrigin, posts once to that origin, including the solution', () => {
  const { latch, msgs, targets } = makeLatch({ embedOrigin: 'https://h.example', getSolution: () => 'a.b.c' });
  latch.check(true);
  latch.check(true);
  assert.equal(msgs.length, 1);
  assert.equal(targets[0], 'https://h.example');
  assert.equal(msgs[0].solution, 'a.b.c');
  assert.equal(msgs[0].type, 'varietypack:complete');
});

test('the help counts go to the embed host too, beside the solution', () => {
  const { latch, msgs } = makeLatch({
    embedOrigin: 'https://host.example', getHelp: () => ({ checks: 1, reveals: 0 }),
  });
  latch.check(true);
  assert.strictEqual(msgs[0].checks, 1);
  assert.strictEqual(msgs[0].reveals, 0);
  assert.ok('solution' in msgs[0]);
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
    getHelp: () => ({ checks: 0, reveals: 0 }),
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

// ── firing, sealing and resetting ────────────────────────────────────────────

test('check fires once and calls onComplete once, and only when solved', () => {
  const calls = [];
  const { latch, events } = makeLatch({ getElapsedMs: () => 5000, onComplete: (ms) => calls.push(ms) });
  assert.strictEqual(latch.solved, false);
  latch.check(false);
  assert.strictEqual(events.length, 0);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(latch.solved, false);
  latch.check(true);
  latch.check(true); // second call: must not fire again
  assert.strictEqual(events.length, 1);
  assert.deepStrictEqual(calls, [5000]);
  assert.strictEqual(latch.solved, true);
});

test('reset re-opens a fired or sealed latch, clearing solved, and onComplete runs again', () => {
  const calls = [];
  const { latch, events } = makeLatch({ onComplete: (ms) => calls.push(ms) });
  latch.check(true);
  latch.reset();
  assert.strictEqual(latch.solved, false);
  latch.check(true);
  assert.strictEqual(events.length, 2);
  assert.strictEqual(calls.length, 2);

  latch.reset();
  latch.sealIfSolved(true);
  latch.reset();
  latch.check(true);
  assert.strictEqual(events.length, 3);
});

test('sealIfSolved(true) suppresses all future check() calls and sets solved without onComplete', () => {
  const calls = [];
  const { latch, events } = makeLatch({ onComplete: (ms) => calls.push(ms) });
  latch.sealIfSolved(true);
  assert.strictEqual(latch.solved, true);
  latch.check(true);
  assert.strictEqual(events.length, 0);
  assert.strictEqual(calls.length, 0);
});

test('sealIfSolved(false) does not suppress subsequent check()', () => {
  const { latch, events } = makeLatch();
  latch.sealIfSolved(false);
  latch.check(true);
  assert.strictEqual(events.length, 1);
});
