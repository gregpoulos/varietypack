'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { buildPuzzle } = require('../src/builder');

const SAMPLE = path.join(__dirname, '../../examples/marching-bands.yaml');

test('buildPuzzle: sample.yaml builds without error', () => {
  const out = path.join(os.tmpdir(), `mb-fixture-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    assert.ok(fs.existsSync(out), 'HTML output not created');
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('buildPuzzle: sample PUZZLE_DATA has correct structure', () => {
  const out = path.join(os.tmpdir(), `mb-fixture2-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    const html = fs.readFileSync(out, 'utf8');

    // Extract PUZZLE_DATA using robust approach
    const startIdx = html.indexOf('window.PUZZLE_DATA = ');
    assert.ok(startIdx !== -1, 'PUZZLE_DATA assignment not found');
    const jsonStart = startIdx + 'window.PUZZLE_DATA = '.length;
    const scriptClose = html.indexOf('</script>', jsonStart);
    assert.ok(scriptClose !== -1, '</script> tag not found after PUZZLE_DATA');
    const jsonStr = html.slice(jsonStart, scriptClose).replace(/;\s*$/, '').trim();
    const pd = JSON.parse(jsonStr);

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
