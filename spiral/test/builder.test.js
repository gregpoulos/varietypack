'use strict';

const { test }   = require('node:test');
const assert     = require('node:assert/strict');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const { buildPuzzle } = require('../src/builder');
const { loadPuzzle, validatePuzzle } = require('../../shared/build/builderUtils');
const { validate } = require('../src/validator');

const SAMPLE = path.join(__dirname, '../../examples/spiral.yaml');

test('validatePuzzle: accepts sample puzzle', () => {
  const p = loadPuzzle(SAMPLE);
  assert.doesNotThrow(() => validatePuzzle(p, SAMPLE, validate));
});

test('buildPuzzle: output contains correct cell count in PUZZLE_DATA', () => {
  const out = path.join(os.tmpdir(), `spiral-test-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out);
    const html = fs.readFileSync(out, 'utf8');
    const match = html.match(/"cells"\s*:\s*(\[[\s\S]*?\])/);
    assert.ok(match, 'cells array not found in PUZZLE_DATA');
    const cells = JSON.parse(match[1]);
    // sample.yaml has 78 cells (sum of normalized inward answer lengths)
    assert.equal(cells.length, 78);
    assert.equal(cells[0].cell_number, 1);
    assert.equal(cells[cells.length - 1].cell_number, cells.length);
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('buildPuzzle: hashed mode — no plaintext answers in HTML', () => {
  const yaml = require('js-yaml');
  const tmpYaml = path.join(os.tmpdir(), `spiral-hashed-${Date.now()}.yaml`);
  const tmpHtml = tmpYaml.replace('.yaml', '.html');
  const puzzle = {
    kind: 'spiral', title: 'Hashed Test', hashed: true,
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
    buildPuzzle(tmpYaml, tmpHtml);
    const html = fs.readFileSync(tmpHtml, 'utf8');
    assert.ok(!html.includes('abcdefghijklmnopqrst'), 'plaintext answer found in hashed HTML');
    assert.ok(html.includes('"boardHash"'), 'boardHash field not found in hashed HTML');
    assert.ok(!html.includes('"letters"'), 'letters array found in hashed HTML');
  } finally {
    fs.rmSync(tmpYaml, { force: true });
    fs.rmSync(tmpHtml, { force: true });
  }
});

test('buildPuzzle: creates output directory if it does not exist', () => {
  const dir = path.join(os.tmpdir(), `spiral-newdir-${Date.now()}`);
  const out = path.join(dir, 'out.html');
  try {
    buildPuzzle(SAMPLE, out);
    assert.ok(fs.existsSync(out), 'output file was not created');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── theme flag ────────────────────────────────────────────────────────────────

test('buildPuzzle: broadsheet theme includes broadsheet-tokens CSS', () => {
  const out = path.join(os.tmpdir(), `spiral-broadsheet-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out, { theme: 'broadsheet' });
    const html = fs.readFileSync(out, 'utf8');
    assert.ok(html.includes('--color-bg'), 'broadsheet tokens not found');
    assert.ok(!html.includes('#1a1520'),   'skeleton colors found in broadsheet output');
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('buildPuzzle: skeleton theme excludes broadsheet tokens and includes skeleton colors', () => {
  const out = path.join(os.tmpdir(), `spiral-skeleton-${Date.now()}.html`);
  try {
    buildPuzzle(SAMPLE, out, { theme: 'skeleton' });
    const html = fs.readFileSync(out, 'utf8');
    assert.ok(!html.includes('--color-bg'), 'broadsheet tokens found in skeleton output');
    assert.ok(html.includes('#1a1520'),     'skeleton background color not found');
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test('buildPuzzle: unknown theme throws', () => {
  const out = path.join(os.tmpdir(), `spiral-badtheme-${Date.now()}.html`);
  try {
    assert.throws(
      () => buildPuzzle(SAMPLE, out, { theme: 'neon' }),
      /Unknown theme/
    );
  } finally {
    fs.rmSync(out, { force: true });
  }
});

// ── styles in PUZZLE_DATA ─────────────────────────────────────────────────────

test('buildPuzzle: inward entry styles appear in PUZZLE_DATA', () => {
  const yaml = require('js-yaml');
  const tmpYaml = path.join(os.tmpdir(), `spiral-styles-inward-${Date.now()}.yaml`);
  const tmpHtml = tmpYaml.replace('.yaml', '.html');
  const puzzle = {
    kind: 'spiral', title: 'Styles Test',
    inward: [
      { clue: 'A', answer: 'ABCDEFGHIJKLMNOPQRST', styles: { circle: [0, 4] } },
      { clue: 'B', answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
    outward: [
      { clue: 'C', answer: 'ABCDEFGHIJKLMNOPQRST' },
      { clue: 'D', answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
  };
  try {
    fs.writeFileSync(tmpYaml, yaml.dump(puzzle), 'utf8');
    buildPuzzle(tmpYaml, tmpHtml);
    const html = fs.readFileSync(tmpHtml, 'utf8');
    const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    assert.ok(match, 'PUZZLE_DATA not found');
    const data = JSON.parse(match[1]);
    assert.deepEqual(data.inward[0].styles, { circle: [0, 4] });
    assert.equal(data.inward[1].styles, undefined);
  } finally {
    fs.rmSync(tmpYaml, { force: true });
    fs.rmSync(tmpHtml, { force: true });
  }
});

test('buildPuzzle: outward entry styles appear in PUZZLE_DATA', () => {
  const yaml = require('js-yaml');
  const tmpYaml = path.join(os.tmpdir(), `spiral-styles-outward-${Date.now()}.yaml`);
  const tmpHtml = tmpYaml.replace('.yaml', '.html');
  const puzzle = {
    kind: 'spiral', title: 'Styles Test',
    inward: [
      { clue: 'A', answer: 'ABCDEFGHIJKLMNOPQRST' },
      { clue: 'B', answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
    outward: [
      { clue: 'C', answer: 'ABCDEFGHIJKLMNOPQRST', styles: { circle: [2, 5] } },
      { clue: 'D', answer: 'TSRQPONMLKJIHGFEDCBA' },
    ],
  };
  try {
    fs.writeFileSync(tmpYaml, yaml.dump(puzzle), 'utf8');
    buildPuzzle(tmpYaml, tmpHtml);
    const html = fs.readFileSync(tmpHtml, 'utf8');
    const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    assert.ok(match, 'PUZZLE_DATA not found');
    const data = JSON.parse(match[1]);
    assert.deepEqual(data.outward[0].styles, { circle: [2, 5] });
    assert.equal(data.outward[1].styles, undefined);
  } finally {
    fs.rmSync(tmpYaml, { force: true });
    fs.rmSync(tmpHtml, { force: true });
  }
});
