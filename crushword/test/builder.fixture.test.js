'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { buildPuzzle } = require('../src/builder');

const SAMPLE = path.join(__dirname, '../../examples/crushword.yaml');

test('buildPuzzle: examples/crushword.yaml builds without error', () => {
  const out = path.join(os.tmpdir(), `cw-fixture-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    assert.ok(fs.existsSync(out), 'HTML output not created');
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('buildPuzzle: examples/crushword.yaml PUZZLE_DATA has correct structure', () => {
  const out = path.join(os.tmpdir(), `cw-fixture2-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    const html = fs.readFileSync(out, 'utf8');

    const startIdx = html.indexOf('window.PUZZLE_DATA = ');
    assert.ok(startIdx !== -1, 'PUZZLE_DATA assignment not found');
    const jsonStart = startIdx + 'window.PUZZLE_DATA = '.length;
    const scriptClose = html.indexOf('</script>', jsonStart);
    assert.ok(scriptClose !== -1, '</script> tag not found after PUZZLE_DATA');
    const jsonStr = html.slice(jsonStart, scriptClose).replace(/;\s*$/, '').trim();
    const pd = JSON.parse(jsonStr);

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
