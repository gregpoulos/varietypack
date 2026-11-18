'use strict';

// Every tool's validator is wired the same way: the shared header checks, the unknown-key
// warning and the muddled-file rules. They are checked here once per kind, so a new tool
// can't skip the wiring. Each tool's own validator.test.js covers what is specific to it.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { KINDS, hooksFor } = require('../shared/build/tools');
const { loadPuzzle } = require('../shared/cli/puzzleFiles');
const { muddlePuzzle } = require('../shared/build/muddleUtils');

const example = kind => loadPuzzle(path.join(__dirname, '..', 'examples', `${kind}.yaml`));

// The first object found by walking `o` that has a `length`: a muddled entry, with the
// path (the label the validator reports it under) that reaches it, such as
// `rows[0].entries[0]` or `across[1]`.
function firstMuddledEntry(o, label = '') {
  if (!o || typeof o !== 'object') return null;
  if (!Array.isArray(o) && o.length !== undefined && o.clue !== undefined) return { entry: o, label };
  for (const [k, v] of Object.entries(o)) {
    const found = firstMuddledEntry(v, /^\d+$/.test(k) ? `${label}[${k}]` : label ? `${label}.${k}` : k);
    if (found) return found;
  }
  return null;
}

function muddled(kind) {
  const hooks = hooksFor(kind);
  const { errors, muddled: m } = muddlePuzzle(example(kind), hooks);
  assert.deepEqual(errors, []);
  return m;
}

for (const kind of KINDS) {
  const { validateFn } = hooksFor(kind);

  test(`[${kind}] the example validates with no errors and no warnings`, () => {
    assert.deepEqual(validateFn(example(kind)), { errors: [], warnings: [] });
  });

  test(`[${kind}] a wrong kind is reported`, () => {
    const p = { ...example(kind), kind: 'nope' };
    assert.ok(validateFn(p).errors.some(e => e.includes('"kind"')));
  });

  test(`[${kind}] an unknown top-level key warns`, () => {
    const p = { ...example(kind), instruction: 2 };
    const { warnings } = validateFn(p);
    assert.ok(warnings.includes('unknown key "instruction" (is it a typo?)'), warnings.join('|'));
  });

  test(`[${kind}] the muddled example passes with the skip warning`, () => {
    const { errors, warnings } = validateFn(muddled(kind));
    assert.deepEqual(errors, []);
    assert.ok(warnings.some(w => /muddled/.test(w)), warnings.join('|'));
  });

  test(`[${kind}] a muddled file without boardHash is rejected`, () => {
    const p = muddled(kind);
    delete p.boardHash;
    assert.ok(validateFn(p).errors.some(e => e.includes('boardHash')));
  });

  test(`[${kind}] an answer: in a muddled entry is rejected`, () => {
    const p = structuredClone(muddled(kind));
    const found = firstMuddledEntry(p);
    assert.ok(found, 'no muddled entry found');
    const { entry, label } = found;
    for (const k of Object.keys(entry)) delete entry[k];
    Object.assign(entry, { clue: 'x', answer: 'AB' });
    // Each tool names the entry by its own label; Crushword's is keyed by clue number.
    const { errors } = validateFn(p);
    assert.ok(errors.some(e => e.startsWith(`${label}:`) && e.includes('length:, not answer:')), errors.join('|'));
  });
}
