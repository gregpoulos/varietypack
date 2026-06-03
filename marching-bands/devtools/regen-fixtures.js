'use strict';
// Regenerate the marching-bands visual-QA fixtures so every cell's row letter
// and band letter agree (the validator's row/band cross-check requires this).
//
// These fixtures exist to exercise grid/clue RENDERING at various N, not to be
// real puzzles, so their letters are arbitrary filler. This tool rewrites each
// fixture's answers off a single consistent grid, preserving clues, entry
// lengths, styles, and the hashed flag — only the letters change.
//
// Usage:  node marching-bands/devtools/regen-fixtures.js
// Operates in place on every YAML in marching-bands/test/fixtures/.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { bandCells, centerFlatIndex } = require('../src/layout');
const normalize = require('../../shared/normalize');

const FIXTURES_DIR = path.join(__dirname, '../test/fixtures');

function regenerate(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const p = yaml.load(raw);
  if (!p || p.kind !== 'marching-bands') return null;

  const N = p.rows[0].entries.reduce((s, e) => s + normalize(e.answer).length, 0);
  const centerIdx = N % 2 === 1 ? centerFlatIndex(N) : -1; // 0-indexed flat

  // Consistent filler grid: 1-indexed cell id -> letter (varied, deterministic).
  const grid = {};
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const flat0 = r * N + c;
    if (flat0 !== centerIdx) grid[flat0 + 1] = String.fromCharCode(65 + (flat0 % 26));
  }

  // New answers in file order: every row entry, then every band entry. Each
  // entry consumes its (normalized) length worth of cells from the grid.
  const answers = [];
  const take = (ids, entries) => {
    let i = 0;
    for (const e of entries) {
      const len = normalize(e.answer).length;
      answers.push(ids.slice(i, i + len).map(id => grid[id]).join(''));
      i += len;
    }
  };
  for (let r = 0; r < N; r++) {
    const ids = [];
    for (let c = 0; c < N; c++) { const f = r * N + c; if (f !== centerIdx) ids.push(f + 1); }
    take(ids, p.rows[r].entries);
  }
  for (let k = 0; k < p.bands.length; k++) take(bandCells(k, N), p.bands[k].entries);

  let n = 0;
  const out = raw.replace(/^(\s*answer:\s*).*$/gm, (_, pre) => pre + answers[n++]);
  if (n !== answers.length) throw new Error(`${path.basename(file)}: replaced ${n}, computed ${answers.length}`);
  fs.writeFileSync(file, out);
  return { N, count: answers.length };
}

const files = fs.readdirSync(FIXTURES_DIR).filter(f => /\.ya?ml$/.test(f)).sort();
for (const f of files) {
  const r = regenerate(path.join(FIXTURES_DIR, f));
  if (r) console.log(`${f}: N=${r.N}, ${r.count} answers regenerated`);
}
