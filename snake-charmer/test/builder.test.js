'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { buildHtml, buildPuzzle, findCoincidentStarts } = require('../src/builder');
const { loadPuzzle } = require('../../shared/build/builderUtils');
const { computeLayout } = require('../src/layout');
const { preparePuzzle } = require('../src/hasher');

const SAMPLE = path.join(__dirname, 'fixtures', 'double-turn-72.yaml');

function puzzleDataOf(html) {
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  return JSON.parse(match[1]);
}

// Reads a built HTML file's PUZZLE_DATA, then deletes the file.
function takePuzzleData(outPath) {
  const html = fs.readFileSync(outPath, 'utf8');
  fs.unlinkSync(outPath);
  return puzzleDataOf(html);
}

// ── buildHtml ─────────────────────────────────────────────────────────────────

test('buildHtml: PUZZLE_DATA carries loops and ring, and omits cells (entry mapping derived at engine init)', () => {
  const prepared = preparePuzzle(loadPuzzle(SAMPLE));
  const { ring } = computeLayout(prepared.entries, prepared.loops);
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

test('buildPuzzle: no shape specified — falls back to stadium for small puzzle with stderr note', () => {
  // N=8 is too small for double-turn; 3 entries satisfies the validator minimum
  const puzzle = {
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const inPath  = path.join(os.tmpdir(), 'sc-test-autoshape-small-in.yaml');
  const outPath = path.join(os.tmpdir(), 'sc-test-autoshape-small-out.html');
  fs.writeFileSync(inPath, yaml.dump(puzzle), 'utf8');

  let stderrOutput = '';
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
  try {
    buildPuzzle(inPath, outPath);
  } finally {
    process.stderr.write = origWrite;
    try { fs.unlinkSync(inPath); } catch {}
  }
  const data = takePuzzleData(outPath);
  assert.equal(data.shape, 'stadium');
  assert.ok(stderrOutput.includes('double-turn'), 'expected fallback note on stderr');
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

test('buildPuzzle: invalid YAML shape throws a clean validation error', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', shape: 'hexagon',
    entries: [
      { clue: 'One',   answer: 'ABCD' },
      { clue: 'Two',   answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const inPath  = path.join(os.tmpdir(), 'sc-test-invalid-shape-in.yaml');
  const outPath = path.join(os.tmpdir(), 'sc-test-invalid-shape-out.html');
  fs.writeFileSync(inPath, yaml.dump(puzzle), 'utf8');
  try {
    assert.throws(
      () => buildPuzzle(inPath, outPath),
      (err) => err.message.includes('"shape"'),
    );
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
  }
});

// ── buildPuzzle (full pipeline) ───────────────────────────────────────────────

test('buildPuzzle: circle option writes shape:circle to output file', () => {
  const outPath = path.join(os.tmpdir(), 'sc-test-ring.html');
  buildPuzzle(SAMPLE, outPath, { shape: 'circle' });
  const data = takePuzzleData(outPath);
  assert.equal(data.shape, 'circle');
  assert.equal(data.ring.nStraight, 0);
});

test('buildHtml: PUZZLE_DATA contains ring object with all stadium fields', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
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

// ── findCoincidentStarts ──────────────────────────────────────────────────────

test('findCoincidentStarts: returns empty array when no entries share a start cell', () => {
  // ringSize=3, loops=2. e0(len2) starts ring 0; e1(len4) starts ring 2. Distinct starts.
  const entries = [{ length: 2 }, { length: 4 }];
  assert.deepEqual(findCoincidentStarts(entries, 2), []);
});

test('findCoincidentStarts: returns ring positions where two entries share a start cell', () => {
  // ringSize=4, loops=2. Starts: e0→0, e1→2, e2→0, e3→2 (loop 1 lands on the same cells).
  const entries = [{ length: 2 }, { length: 2 }, { length: 2 }, { length: 2 }];
  assert.deepEqual(findCoincidentStarts(entries, 2), [0, 2]);
});

test('buildPuzzle: writes coincident-start warning to stderr', () => {
  // Both loops start at ring cells 0 and 4 — entries 0&2 share cell 0, entries 1&3 share cell 4.
  const puzzle = {
    kind: 'snake-charmer',
    title: 'Coincident Test',
    entries: [
      { clue: 'One',   answer: 'AAAA' },
      { clue: 'Two',   answer: 'BBBB' },
      { clue: 'Three', answer: 'AAAA' },
      { clue: 'Four',  answer: 'BBBB' },
    ],
  };
  const inPath  = path.join(os.tmpdir(), 'sc-test-coincident-in.yaml');
  const outPath = path.join(os.tmpdir(), 'sc-test-coincident-out.html');
  fs.writeFileSync(inPath, yaml.dump(puzzle), 'utf8');

  let stderrOutput = '';
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
  try {
    buildPuzzle(inPath, outPath);
  } finally {
    process.stderr.write = origWrite;
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }

  assert.ok(stderrOutput.length > 0, 'expected a warning on stderr');
  assert.match(stderrOutput, /[Ww]arning/);
});
