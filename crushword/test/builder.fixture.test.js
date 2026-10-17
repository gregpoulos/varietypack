'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { buildPuzzle } = require('../cli');
const { puzzleDataOf } = require('../../test/helpers');

const SAMPLE = path.join(__dirname, '../../examples/crushword.yaml');

test('buildPuzzle: examples/crushword.yaml PUZZLE_DATA has correct structure', () => {
  const out = path.join(os.tmpdir(), `cw-fixture2-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    const pd = puzzleDataOf(fs.readFileSync(out, 'utf8'));

    assert.equal(pd.kind, 'crushword');
    assert.ok(Array.isArray(pd.grid) && pd.grid.length > 0);
    assert.ok(pd.across && Object.keys(pd.across).length > 0);
    assert.ok(pd.down && Object.keys(pd.down).length > 0);
    assert.ok(
      Array.isArray(pd.letters) || typeof pd.boardHash === 'string',
      'PUZZLE_DATA must have either letters or boardHash'
    );
    if (pd.letters) {
      const totalCells = pd.grid.reduce((sum, row) => sum + row.length, 0);
      assert.equal(pd.letters.length, totalCells);
    }
  } finally {
    fs.rmSync(out, { force: true });
  }
});
