'use strict';

const { test }   = require('node:test');
const assert     = require('node:assert/strict');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const { buildPuzzleFile, puzzleDataOf } = require('../../test/helpers');

const SAMPLE = path.join(__dirname, '../../examples/spiral.yaml');

test('build: output contains correct cell count in PUZZLE_DATA', () => {
  const out = path.join(os.tmpdir(), `spiral-test-${Date.now()}.html`);
  try {
    buildPuzzleFile(SAMPLE, out);
    const { cells } = puzzleDataOf(fs.readFileSync(out, 'utf8'));
    // sample.yaml has 78 cells (sum of normalized inward answer lengths)
    assert.equal(cells.length, 78);
    assert.equal(cells[0].cell_number, 1);
    assert.equal(cells[cells.length - 1].cell_number, cells.length);
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('build: PUZZLE_DATA carries geometryFor its cell count', () => {
  const { geometryFor } = require('../src/layout.mjs');
  const out = path.join(os.tmpdir(), `spiral-test-geom-${Date.now()}.html`);
  try {
    buildPuzzleFile(SAMPLE, out);
    const data = puzzleDataOf(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(data.geometry, geometryFor(data.cells.length));
  } finally {
    fs.rmSync(out, { force: true });
  }
});
