'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { buildHtml, buildPuzzle, findCoincidentStarts } = require('../src/builder');
const { loadPuzzle, validatePuzzle } = require('../../shared/build/builderUtils');
const { validate } = require('../src/validator');
const { computeLayout } = require('../src/layout');
const { preparePuzzle } = require('../src/hasher');

const SAMPLE = path.join(__dirname, 'fixtures', 'double-turn-72.yaml');

// ── loadPuzzle ────────────────────────────────────────────────────────────────

test('loadPuzzle: loads sample.yaml without error', () => {
  const puzzle = loadPuzzle(SAMPLE);
  assert.equal(typeof puzzle, 'object');
  assert.equal(puzzle.title, 'Test N=72 (double-turn)');
  assert.equal(puzzle.kind, 'snake-charmer');
});

// ── validatePuzzle ────────────────────────────────────────────────────────────

test('validatePuzzle: sample puzzle passes', () => {
  const puzzle = loadPuzzle(SAMPLE);
  assert.doesNotThrow(() => validatePuzzle(puzzle, SAMPLE, validate));
});

// ── buildHtml (non-hashed) ────────────────────────────────────────────────────

test('buildHtml: non-hashed output has letters array in PUZZLE_DATA', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.ok(Array.isArray(data.letters) && data.letters.length > 0);
});

test('buildHtml: PUZZLE_DATA omits cells array (entry mapping derived at engine init)', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  const data = JSON.parse(match[1]);
  assert.equal(data.cells, undefined);
  assert.equal(data.ring.N, 72);
});

test('buildHtml: non-hashed plain-text answers absent from output', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  assert.ok(!html.includes('"AAAAAAAA"'));
  assert.ok(!html.includes('"BBBBBBBBB"'));
});

test('buildHtml: non-hashed no hash fields in entries', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data.entries[0].hash, undefined);
  assert.equal(data.entries[0].answer, undefined);
});

test('buildHtml: hashed output has boardHash, no letters, no per-entry hashes', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABC' },
      { clue: 'Two', answer: 'DEF' },
      { clue: 'Three', answer: 'ABCDEF' },
    ],
  };
  const prepared = preparePuzzle({ ...puzzle, hashed: true });
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.ok(data.boardHash);
  assert.equal(data.entries[0].hash, undefined);
  assert.equal(data.letters, undefined);
});

test('buildHtml: PUZZLE_DATA contains loops and hashed fields', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data.loops, 2);
  assert.equal(data.hashed, false);
});

// ── buildPuzzle auto-shape ────────────────────────────────────────────────────

test('buildPuzzle: no shape specified — uses double-turn for compatible puzzle', () => {
  const os = require('os');
  const fs = require('fs');
  const outPath = path.join(os.tmpdir(), 'sc-test-autoshape-dt.html');
  buildPuzzle(SAMPLE, outPath);
  const content = fs.readFileSync(outPath, 'utf8');
  const match = content.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data.shape, 'double-turn');
  fs.unlinkSync(outPath);
});

test('buildPuzzle: no shape specified — falls back to stadium for small puzzle with stderr note', () => {
  const os = require('os');
  const fs = require('fs');
  const yaml = require('js-yaml');
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
  const content = fs.readFileSync(outPath, 'utf8');
  fs.unlinkSync(outPath);
  const match = content.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data.shape, 'stadium');
  assert.ok(stderrOutput.includes('double-turn'), 'expected fallback note on stderr');
});

test('buildPuzzle: shape field in YAML used when no --shape flag', () => {
  const os = require('os');
  const fs = require('fs');
  const yaml = require('js-yaml');
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
  const content = fs.readFileSync(outPath, 'utf8');
  fs.unlinkSync(outPath);
  const match = content.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.equal(JSON.parse(match[1]).shape, 'stadium');
});

test('buildPuzzle: --shape flag overrides shape field in YAML', () => {
  const os = require('os');
  const fs = require('fs');
  const yaml = require('js-yaml');
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
  const content = fs.readFileSync(outPath, 'utf8');
  fs.unlinkSync(outPath);
  const match = content.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.equal(JSON.parse(match[1]).shape, 'stadium');
});

test('buildPuzzle: YAML shape disables auto-select fallback — throws on incompatible shape', () => {
  // N=8 is too small for double-turn; auto-select would fall back to stadium.
  // With shape: 'double-turn' in the YAML the fallback is disabled, so it must throw.
  const os = require('os');
  const fs = require('fs');
  const yaml = require('js-yaml');
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
  const os = require('os');
  const fs = require('fs');
  const yaml = require('js-yaml');
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

test('buildPuzzle: returns title from built puzzle', () => {
  const os = require('os');
  const outPath = path.join(os.tmpdir(), 'sc-test-output.html');
  const result = buildPuzzle(SAMPLE, outPath);
  assert.equal(result.title, 'Test N=72 (double-turn)');
  require('fs').unlinkSync(outPath);
});

test('buildPuzzle: --muddle omits letters and includes boardHash', () => {
  const os = require('os');
  const fs = require('fs');
  const yaml = require('js-yaml');
  // 3 entries, ringSize=8: concat='abcdefghabcdefgh', loop0=loop1 ✓
  const puzzle = {
    kind: 'snake-charmer', title: 'T',
    entries: [
      { clue: 'One', answer: 'ABCD' },
      { clue: 'Two', answer: 'EFGH' },
      { clue: 'Three', answer: 'ABCDEFGH' },
    ],
  };
  const inPath  = path.join(os.tmpdir(), 'sc-test-muddle-in.yaml');
  const outPath = path.join(os.tmpdir(), 'sc-test-muddle-out.html');
  fs.writeFileSync(inPath, yaml.dump(puzzle), 'utf8');
  try {
    buildPuzzle(inPath, outPath, { muddle: true });
    const content = fs.readFileSync(outPath, 'utf8');
    const match = content.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    const data = JSON.parse(match[1]);
    assert.ok(data.boardHash, 'boardHash should be present');
    assert.equal(data.letters, undefined);
  } finally {
    try { fs.unlinkSync(inPath); } catch {}
    try { fs.unlinkSync(outPath); } catch {}
  }
});

test('buildHtml: PUZZLE_DATA contains shape field when explicitly passed', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops, 'stadium');
  const html = buildHtml(prepared, ring, 'stadium');
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data.shape, 'stadium');
});

test('buildHtml: PUZZLE_DATA shape field reflects circle when passed', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops, 'circle');
  const html = buildHtml(prepared, ring, 'circle');
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data.shape, 'circle');
});

test('buildPuzzle: circle option writes shape:circle to output file', () => {
  const os = require('os');
  const fs = require('fs');
  const outPath = path.join(os.tmpdir(), 'sc-test-ring.html');
  buildPuzzle(SAMPLE, outPath, { shape: 'circle' });
  const content = fs.readFileSync(outPath, 'utf8');
  const match = content.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  const data = JSON.parse(match[1]);
  assert.equal(data.shape, 'circle');
  assert.equal(data.ring.nStraight, 0);
  fs.unlinkSync(outPath);
});

test('buildHtml: PUZZLE_DATA contains ring object with all stadium fields', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  const data = JSON.parse(match[1]);
  assert.ok(data.ring, 'ring key missing from PUZZLE_DATA');
  assert.equal(data.ring.N, 72);
  for (const f of ['nCurve', 'nStraight', 'L', 'rCenter', 'rOuter', 'rInner', 'svgWidth', 'svgHeight', 'cx', 'cy']) {
    assert.ok(typeof data.ring[f] === 'number', `ring.${f} should be a number`);
  }
  assert.ok(Math.abs(data.ring.cx - data.ring.svgWidth / 2) < 0.01, 'cx = svgWidth/2');
  assert.ok(Math.abs(data.ring.cy - data.ring.svgHeight / 2) < 0.01, 'cy = svgHeight/2');
});

test('buildPuzzle: turn shape writes ring with turn-specific fields', () => {
  const os = require('os');
  const fs = require('fs');
  const outPath = path.join(os.tmpdir(), 'sc-test-turn.html');
  buildPuzzle(SAMPLE, outPath, { shape: 'turn' });
  const content = fs.readFileSync(outPath, 'utf8');
  const match = content.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found in turn output');
  const data = JSON.parse(match[1]);
  assert.equal(data.shape, 'turn');
  assert.equal(data.ring.N, 72);
  for (const f of ['nArmStraight', 'nArmCurve', 'nBodyInner', 'nBodyOuter', 'R_in', 'R_out', 'D', 'svgWidth', 'svgHeight']) {
    assert.ok(typeof data.ring[f] === 'number', `ring.${f} should be a number`);
  }
  assert.equal(data.ring.nCurve, undefined, 'stadium field nCurve should be absent');
  fs.unlinkSync(outPath);
});

// ── instructions in PUZZLE_DATA ──────────────────────────────────────────────

test('buildHtml: instructions is included in PUZZLE_DATA when provided', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    instructions: 'Fill in the blanks.\n\nEnjoy the puzzle.',
    entries: [
      { clue: 'One', answer: 'ABCDEFGH' },
      { clue: 'Two', answer: 'ABCDEFGH' },
    ],
  };
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  const data = JSON.parse(match[1]);
  assert.equal(data.instructions, 'Fill in the blanks.\n\nEnjoy the puzzle.');
});

test('buildHtml: instructions is absent from PUZZLE_DATA when not provided', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABCDEFGH' },
      { clue: 'Two', answer: 'ABCDEFGH' },
    ],
  };
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  const data = JSON.parse(match[1]);
  assert.equal(data.instructions, undefined);
});

// ── styles in PUZZLE_DATA ─────────────────────────────────────────────────────

test('buildHtml: entry styles appear in PUZZLE_DATA entries', () => {
  const puzzle = {
    kind: 'snake-charmer', title: 'T', loops: 2,
    entries: [
      { clue: 'One', answer: 'ABCDEFGH', styles: { circle: [0, 4] } },
      { clue: 'Two', answer: 'ABCDEFGH' },
    ],
  };
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring);
  const match = html.match(/window\.PUZZLE_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  assert.ok(match, 'PUZZLE_DATA not found');
  const data = JSON.parse(match[1]);
  assert.deepEqual(data.entries[0].styles, { circle: [0, 4] });
  assert.equal(data.entries[1].styles, undefined);
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
  const os = require('os');
  const fs = require('fs');
  const yaml = require('js-yaml');
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

// ── theme support ─────────────────────────────────────────────────────────────

test('buildHtml: skeleton theme — CSS includes Outfit font', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  const html = buildHtml(prepared, ring, 'stadium', 'skeleton', 'embed');
  assert.ok(html.includes('Outfit'), 'skeleton CSS should reference Outfit font');
});

test('buildHtml: unknown theme throws', () => {
  const puzzle = loadPuzzle(SAMPLE);
  const prepared = preparePuzzle(puzzle);
  const { ring } = computeLayout(prepared.entries, prepared.loops);
  assert.throws(
    () => buildHtml(prepared, ring, 'stadium', 'neon'),
    /Unknown theme/
  );
});

test('buildPuzzle: skeleton theme writes skeleton CSS to output', () => {
  const os = require('os');
  const fs = require('fs');
  const outPath = path.join(os.tmpdir(), 'sc-test-skeleton.html');
  buildPuzzle(SAMPLE, outPath, { theme: 'skeleton', font: 'embed' });
  const content = fs.readFileSync(outPath, 'utf8');
  assert.ok(content.includes('Outfit'), 'skeleton output should include Outfit font');
  fs.unlinkSync(outPath);
});

test('buildPuzzle: creates output directory if it does not exist', () => {
  const os = require('os');
  const fs = require('fs');
  const dir = path.join(os.tmpdir(), `sc-newdir-${Date.now()}`);
  const out = path.join(dir, 'out.html');
  try {
    buildPuzzle(SAMPLE, out);
    assert.ok(fs.existsSync(out), 'output file was not created');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
