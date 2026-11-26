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
const { SHAPE_NAMES } = require('../snake-charmer/src/layout.mjs');
const { LOOPS } = require('../snake-charmer/src/entryMaps.mjs');
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

// What each tool's own fields in a plain page's PUZZLE_DATA must hold, built from its
// example. A tool's builder copies fields into the page data by name, so a field it
// forgets is missing here.
const TOOL_FIELDS = {
  'snake-charmer': data => {
    assert.equal(data.loops, undefined);
    assert.equal(data.ring, undefined);   // the engine derives it from the shape
    assert.equal(data.cells, undefined);
    assert.ok(SHAPE_NAMES.includes(data.shape), data.shape);
    assert.equal(data.letters.length, data.entries.reduce((sum, e) => sum + e.length, 0) / LOOPS);
  },
  'spiral': data => {
    const total = data.inward.reduce((sum, e) => sum + e.length, 0);
    assert.equal(data.cells, undefined);   // the engine derives the geometry from the lengths
    assert.equal(data.geometry, undefined);
    assert.equal(data.letters.length, total);
  },
  'marching-bands': data => {
    assert.equal(data.rows.length, data.size);
    assert.equal(data.bands.length, Math.floor(data.size / 2));
    assert.equal(data.letters.length, data.size * data.size);
  },
  'crushword': data => {
    assert.ok(data.grid.length > 0);
    assert.ok(Object.keys(data.across).length > 0 && Object.keys(data.down).length > 0);
    assert.equal(data.maxCellLetters, 3);
    assert.equal(data.letters.length, data.grid.length * data.grid[0].length);
  },
};

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

  test(`[${kind}] a plain page ships its own fields`, () => {
    TOOL_FIELDS[kind](dataOf(false));
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
