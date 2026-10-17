'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { buildPuzzle } = require('../cli');
const { puzzleDataOf } = require('../../test/helpers');

const SAMPLE = path.join(__dirname, '../../examples/marching-bands.yaml');

test('buildPuzzle: sample PUZZLE_DATA has correct structure', () => {
  const out = path.join(os.tmpdir(), `mb-fixture2-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    const pd = puzzleDataOf(fs.readFileSync(out, 'utf8'));

    assert.equal(pd.kind, 'marching-bands');
    assert.ok(Number.isInteger(pd.size) && pd.size >= 3, `size should be integer >= 3, got ${pd.size}`);
    assert.equal(pd.rows.length, pd.size, 'rows.length should equal size');
    assert.equal(pd.bands.length, Math.floor(pd.size / 2), 'bands.length should equal floor(size/2)');
    assert.ok(
      Array.isArray(pd.letters) || typeof pd.boardHash === 'string',
      'PUZZLE_DATA must have either letters or boardHash'
    );
    if (pd.letters) {
      assert.equal(pd.letters.length, pd.size * pd.size,
        `letters.length should equal size*size (${pd.size * pd.size})`);
    }
  } finally {
    fs.rmSync(out, { force: true });
  }
});
