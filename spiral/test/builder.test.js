'use strict';

const { test }   = require('node:test');
const assert     = require('node:assert/strict');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const { buildPuzzle } = require('../cli');
const { puzzleDataOf } = require('../../test/helpers');

const SAMPLE = path.join(__dirname, '../../examples/spiral.yaml');

test('buildPuzzle: output contains correct cell count in PUZZLE_DATA', () => {
  const out = path.join(os.tmpdir(), `spiral-test-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    const { cells } = puzzleDataOf(fs.readFileSync(out, 'utf8'));
    // sample.yaml has 78 cells (sum of normalized inward answer lengths)
    assert.equal(cells.length, 78);
    assert.equal(cells[0].cell_number, 1);
    assert.equal(cells[cells.length - 1].cell_number, cells.length);
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('buildPuzzle: --muddle — no plaintext answers in HTML', () => {
  const yaml = require('js-yaml');
  const tmpYaml = path.join(os.tmpdir(), `spiral-muddle-${Date.now()}.yaml`);
  const tmpHtml = tmpYaml.replace('.yaml', '.html');
  const puzzle = {
    kind: 'spiral', title: 'Muddle Test',
    inward:  [
      { clue: 'A', answer: 'ABCDEFGHIJKLMNOPQRST' },
      { clue: 'B', answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
    outward: [
      { clue: 'C', answer: 'ABCDEFGHIJKLMNOPQRST' },
      { clue: 'D', answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
  };
  try {
    fs.writeFileSync(tmpYaml, yaml.dump(puzzle), 'utf8');
    buildPuzzle(tmpYaml, tmpHtml, { muddle: true });
    const html = fs.readFileSync(tmpHtml, 'utf8');
    assert.ok(!html.includes('abcdefghijklmnopqrst'), 'plaintext answer found in muddled HTML');
    assert.ok(html.includes('"boardHash"'), 'boardHash field not found in muddled HTML');
    assert.ok(!html.includes('"letters"'), 'letters array found in muddled HTML');
  } finally {
    fs.rmSync(tmpYaml, { force: true });
    fs.rmSync(tmpHtml, { force: true });
  }
});

test('buildPuzzle: PUZZLE_DATA carries geometryFor its cell count', () => {
  const { geometryFor } = require('../src/layout.mjs');
  const out = path.join(os.tmpdir(), `spiral-test-geom-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    const data = puzzleDataOf(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(data.geometry, geometryFor(data.cells.length));
  } finally {
    fs.rmSync(out, { force: true });
  }
});
