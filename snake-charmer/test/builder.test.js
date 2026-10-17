'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { buildHtml, HOOKS } = require('../src/builder');
const { buildPuzzle } = require('../cli');
const { buildFromObject } = require('../../shared/build/buildFromObject');
const { loadPuzzle } = require('../../shared/cli/puzzleFiles');
const { ringFor, SHAPES } = require('../src/layout');
const { preparePuzzle } = require('../src/prepare');
const { puzzleDataOf } = require('../../test/helpers');

const SAMPLE = path.join(__dirname, 'fixtures', 'double-turn-72.yaml');

// Reads a built HTML file's PUZZLE_DATA, then deletes the file.
function takePuzzleData(outPath) {
  const html = fs.readFileSync(outPath, 'utf8');
  fs.unlinkSync(outPath);
  return puzzleDataOf(html);
}

// ── buildHtml ─────────────────────────────────────────────────────────────────

test('buildHtml: PUZZLE_DATA carries loops and ring, and omits cells (entry mapping derived at engine init)', () => {
  const prepared = preparePuzzle(loadPuzzle(SAMPLE));
  const { ring } = ringFor(72, 'stadium');   // the fixture's ring size
  const data = puzzleDataOf(buildHtml(prepared, ring));
  assert.equal(data.cells, undefined);
  assert.equal(data.loops, 2);
  assert.equal(data.ring.N, 72);
});

// ── buildPuzzle auto-shape ────────────────────────────────────────────────────

test('buildPuzzle: no shape specified — uses double-turn for compatible puzzle', () => {
  const outPath = path.join(os.tmpdir(), 'sc-test-autoshape-dt.html');
  buildPuzzle(SAMPLE, outPath);
  const data = takePuzzleData(outPath);
  assert.equal(data.shape, 'double-turn');
});

test('buildPuzzle: shape field in YAML used when no --shape flag', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', shape: 'stadium',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const inPath  = path.join(os.tmpdir(), 'sc-test-yaml-shape-in.yaml');
  const outPath = path.join(os.tmpdir(), 'sc-test-yaml-shape-out.html');
  fs.writeFileSync(inPath, yaml.dump(puzzle), 'utf8');
  try { buildPuzzle(inPath, outPath); } finally { fs.unlinkSync(inPath); }
  assert.equal(takePuzzleData(outPath).shape, 'stadium');
});

test('buildPuzzle: --shape flag overrides shape field in YAML', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', shape: 'turn',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const inPath  = path.join(os.tmpdir(), 'sc-test-yaml-shape-override-in.yaml');
  const outPath = path.join(os.tmpdir(), 'sc-test-yaml-shape-override-out.html');
  fs.writeFileSync(inPath, yaml.dump(puzzle), 'utf8');
  try { buildPuzzle(inPath, outPath, { shape: 'stadium' }); } finally { fs.unlinkSync(inPath); }
  assert.equal(takePuzzleData(outPath).shape, 'stadium');
});

test('buildPuzzle: YAML shape disables auto-select fallback — throws on incompatible shape', () => {
  // N=8 is too small for double-turn; auto-select would fall back to stadium.
  // With shape: 'double-turn' in the YAML the fallback is disabled, so it must throw.
  const puzzle = {
    kind: 'snake-charmer', title: 'T', shape: 'double-turn',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const inPath  = path.join(os.tmpdir(), 'sc-test-yaml-shape-nofallback-in.yaml');
  const outPath = path.join(os.tmpdir(), 'sc-test-yaml-shape-nofallback-out.html');
  fs.writeFileSync(inPath, yaml.dump(puzzle), 'utf8');
  try {
    assert.throws(() => buildPuzzle(inPath, outPath));
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }
});

// ── buildPuzzle (full pipeline) ───────────────────────────────────────────────

test('buildHtml: PUZZLE_DATA contains ring object with all stadium fields', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = ringFor(72, 'stadium');   // the fixture's ring size
  const data = puzzleDataOf(buildHtml(prepared, ring));
  assert.equal(data.ring.N, 72);
  for (const f of ['nCurve', 'nStraight', 'L', 'rCenter', 'rOuter', 'rInner', 'svgWidth', 'svgHeight', 'cx', 'cy']) {
    assert.ok(typeof data.ring[f] === 'number', `ring.${f} should be a number`);
  }
  assert.ok(Math.abs(data.ring.cx - data.ring.svgWidth / 2) < 0.01, 'cx = svgWidth/2');
  assert.ok(Math.abs(data.ring.cy - data.ring.svgHeight / 2) < 0.01, 'cy = svgHeight/2');
});

test('buildPuzzle: turn shape writes ring with turn-specific fields', () => {
  const outPath = path.join(os.tmpdir(), 'sc-test-turn.html');
  buildPuzzle(SAMPLE, outPath, { shape: 'turn' });
  const data = takePuzzleData(outPath);
  assert.equal(data.shape, 'turn');
  assert.equal(data.ring.N, 72);
  for (const f of ['nArmStraight', 'nArmCurve', 'nBodyInner', 'nBodyOuter', 'R_in', 'R_out', 'D', 'svgWidth', 'svgHeight']) {
    assert.ok(typeof data.ring[f] === 'number', `ring.${f} should be a number`);
  }
  assert.equal(data.ring.nCurve, undefined, 'stadium field nCurve should be absent');
});

function captureStderr(fn) {
  let out = '';
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { out += chunk; return true; };
  try { return { result: fn(), stderr: out }; } finally { process.stderr.write = origWrite; }
}

test('HOOKS via buildFromObject: auto-shape fallback note is returned, not printed', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const { result, stderr } = captureStderr(() => buildFromObject(puzzle, {}, HOOKS));
  assert.ok(result.notes.some(n => /double-turn shape not supported/.test(n)), result.notes.join('|'));
  assert.equal(stderr, '');
});

test('an auto-shaped build computes the double-turn ring once', () => {
  const real = SHAPES['double-turn'].computeRing;
  let calls = 0;
  SHAPES['double-turn'].computeRing = (N) => { calls++; return real(N); };
  try {
    const { shape, ...autoShaped } = loadPuzzle(SAMPLE);   // no shape: auto-select
    buildFromObject(autoShaped, {}, HOOKS);
  } finally {
    SHAPES['double-turn'].computeRing = real;
  }
  assert.equal(calls, 1);
});

