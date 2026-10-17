'use strict';

// Each tool's prepare step parses answers into `_cells` and must strip them before the
// page data is built. A page that kept them would ship its answers even when hashed, and
// the per-tool "no plaintext answers" tests wouldn't notice: they look for joined
// strings, and `_cells` is an array of single letters. A leading `_` marks any such
// internal field.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadPuzzle } = require('../shared/cli/puzzleFiles');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { TOOLS } = require('../shared/cli/toolRegistry');
const { puzzleDataOf } = require('./helpers');

const EXAMPLES = path.join(__dirname, '..', 'examples');

// Every key in `value`, at any depth.
function allKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const v of value) allKeys(v, keys);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { keys.add(k); allKeys(v, keys); }
  }
  return keys;
}

for (const [kind, tool] of Object.entries(TOOLS)) {
  const { HOOKS } = require(path.join(tool.dir, 'src', 'builder'));

  for (const muddle of [true, false]) {
    test(`[${kind}] a ${muddle ? 'hashed' : 'plain'} page ships no internal _ fields`, () => {
      const puzzle = loadPuzzle(path.join(EXAMPLES, `${kind}.yaml`));
      const keys = allKeys(puzzleDataOf(buildFromObject(puzzle, { muddle }, HOOKS).html));
      assert.deepEqual([...keys].filter(k => k.startsWith('_')), []);
    });
  }
}
