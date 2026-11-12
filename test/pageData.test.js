'use strict';

// What a built page's PUZZLE_DATA must and must not carry, for every kind, hashed and
// plain. Each tool's prepare step parses answers into `_cells` and must strip them before
// the page data is built: a page that kept them would ship its answers even when hashed.
// A leading `_` marks any such internal field.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadPuzzle } = require('../shared/cli/puzzleFiles');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { KINDS, hooksFor } = require('../shared/build/tools');
const { normalize } = require('../shared/normalize.mjs');
const { puzzleDataOf } = require('./helpers');

const EXAMPLES = path.join(__dirname, '..', 'examples');

// Every key in `value`, at any depth, and every string found under key `only` (or under
// any key when `only` is omitted).
function walk(value, only, found = { keys: new Set(), strings: [] }, key) {
  if (Array.isArray(value)) {
    for (const v of value) walk(v, only, found, key);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { found.keys.add(k); walk(v, only, found, k); }
  } else if (typeof value === 'string' && (only === undefined || key === only)) {
    found.strings.push(value);
  }
  return found;
}

for (const kind of KINDS) {
  const HOOKS = hooksFor(kind);
  const puzzle = loadPuzzle(path.join(EXAMPLES, `${kind}.yaml`));
  const dataOf = muddle => puzzleDataOf(buildFromObject(puzzle, { muddle }, HOOKS).html);

  for (const muddle of [true, false]) {
    test(`[${kind}] a ${muddle ? 'hashed' : 'plain'} page ships no internal _ fields`, () => {
      assert.deepEqual([...walk(dataOf(muddle)).keys].filter(k => k.startsWith('_')), []);
    });
  }

  test(`[${kind}] a plain page ships its letters and a board hash`, () => {
    const data = dataOf(false);
    assert.ok(Array.isArray(data.letters));
    assert.match(data.boardHash, /^[0-9a-f]{64}$/);
  });

  test(`[${kind}] a hashed page ships the same board hash and no answers`, () => {
    const data = dataOf(true);
    assert.equal(data.boardHash, dataOf(false).boardHash);
    const { keys, strings } = walk(data);
    assert.ok(!keys.has('letters') && !keys.has('answer'));
    // No string in the page data is one of the source's answers.
    const answers = new Set(walk(puzzle, 'answer').strings.map(normalize));
    assert.ok(answers.size > 0);
    assert.deepEqual(strings.filter(s => answers.has(normalize(s))), []);
  });
}
