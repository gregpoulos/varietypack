'use strict';
// Regenerate the marching-bands visual-QA fixtures so every cell's row value
// and band value agree (the validator's row/band cross-check requires this).
//
// These fixtures exist to exercise grid/clue RENDERING at various N, not to be
// real puzzles, so their letters are arbitrary filler. This tool rewrites each
// fixture's answers off a single consistent grid, preserving clues, entry
// lengths, and styles — only the letters change. Muddled fixtures (which have
// no `answer:` lines to rewrite) are skipped entirely, not touched.
//
// Rebus (bracketed, multi-letter) cells are NOT supported: the filler grid is
// one plain letter per cell, so rebus reconstruction would silently flatten a
// bracketed group into that many bare single-letter cells — same cell count,
// wrong cell shape. Rather than do that quietly, this tool refuses to touch a
// fixture whose source answers contain a bracket group; see `assertNoRebus`.
// A rebus fixture needs bracket-aware filler letters, which this arbitrary-
// filler devtool has no reason to grow — write/update rebus fixtures by hand.
//
// Usage:  node marching-bands/devtools/regen-fixtures.js
// Operates in place on every YAML in marching-bands/test/fixtures/.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { bandCells, centerFlatIndex } = require('../src/layout.mjs');
const { parseAnswerCells, entryCellCount } = require('../../shared/build/cells');

const FIXTURES_DIR = path.join(__dirname, '../test/fixtures');

// Throws, naming the file, if any row or band entry uses bracket notation.
// See the header comment for why this tool can't faithfully regenerate a
// rebus fixture's letters.
function assertNoRebus(file, p) {
  const allEntries = [...p.rows, ...(p.bands || [])].flatMap((g) => g.entries);
  for (const e of allEntries) {
    const cells = parseAnswerCells(e.answer).cells ?? [];
    if (cells.some((c) => c.length > 1)) {
      throw new Error(
        `${path.basename(file)}: answer ${JSON.stringify(e.answer)} contains a bracketed ` +
          `rebus cell — regen-fixtures.js's single-letter filler grid can't reconstruct a ` +
          `multi-letter cell without silently flattening it into several single-letter ` +
          `cells. Update this fixture's letters by hand instead of running this tool on it.`
      );
    }
  }
}

function regenerate(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const p = yaml.load(raw);
  if (!p || p.kind !== 'marching-bands') return null;
  // Muddled fixtures have no `answer:` lines to rewrite (they carry `length:`
  // instead) — nothing for this tool to regenerate.
  if (p.boardHash !== undefined) { console.log(`${path.basename(file)}: skipped (muddled)`); return null; }
  assertNoRebus(file, p);

  const N = p.rows[0].entries.reduce((s, e) => s + entryCellCount(e), 0);
  const centerIdx = N % 2 === 1 ? centerFlatIndex(N) : -1; // 0-indexed flat

  // Consistent filler grid: 1-indexed cell id -> letter (varied, deterministic).
  const grid = {};
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const flat0 = r * N + c;
    if (flat0 !== centerIdx) grid[flat0 + 1] = String.fromCharCode(65 + (flat0 % 26));
  }

  // New answers in file order: every row entry, then every band entry. Each
  // entry consumes its cell count worth of cells from the grid.
  const answers = [];
  const take = (ids, entries) => {
    let i = 0;
    for (const e of entries) {
      const len = entryCellCount(e);
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
