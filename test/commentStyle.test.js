'use strict';

// Repo-wide style: comment paragraphs wrap at 90 columns, and prose is American English.
// Spelling is checked in code and docs alike, since a British word lands in a string or
// an identifier as easily as in a comment. This file is exempt from its own spelling
// check, as it has to name the words.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const MAX_COMMENT_WIDTH = 90;

// Tracked files, minus generated fixtures (built HTML carries whatever the source did).
const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(f => f && !f.includes('/fixtures/') && fs.existsSync(path.join(ROOT, f)));
const withExt = (...exts) => files.filter(f => exts.includes(path.extname(f)));
const linesOf = f => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');

// Lines that are wholly comment, in a file whose comments are `//` (and block comments)
// or `#`. A block comment is recognized only when `/*` opens the line, so a glob inside
// a string cannot start one. Trailing comments are excluded: they sit beside code that
// is often aligned, and are not paragraphs to reflow.
function* fullLineComments(file) {
  const hash = path.extname(file) === '.sh';
  let inBlock = false;
  let n = 0;
  for (const line of linesOf(file)) {
    n++;
    const t = line.trim();
    if (inBlock) {
      yield [n, line];
      if (t.includes('*/')) inBlock = false;
    } else if (t.startsWith('/*')) {
      yield [n, line];
      if (!t.includes('*/')) inBlock = true;
    } else if (t.startsWith(hash ? '#' : '//') && !t.startsWith('#!')) {
      yield [n, line];
    }
  }
}

// A comment line with a run of spaces after its text starts is an aligned list or
// table; reflowing it would wreck the alignment. A URL cannot be broken either.
const isUnbreakable = line => /\S {2,}\S/.test(line.trim()) || /https?:\/\//.test(line);

// JS comments are held to the same width by ESLint's `max-len` (eslint.config.js), which
// can't read CSS or shell.
test('CSS and shell comment paragraphs are wrapped at 90 columns', () => {
  const wide = [];
  for (const f of withExt('.css', '.sh')) {
    for (const [n, line] of fullLineComments(f)) {
      if (line.length > MAX_COMMENT_WIDTH && !isUnbreakable(line)) wide.push(`${f}:${n} (${line.length})`);
    }
  }
  assert.deepEqual(wide, [], 'comment lines over 90 columns');
});

// British spelling → the American one to use. `aria-labelledby` is an HTML attribute,
// not prose, and keeps its spelling.
const BRITISH = {
  centre: 'center', centred: 'centered', centres: 'centers', centring: 'centering',
  colour: 'color', colours: 'colors', coloured: 'colored',
  behaviour: 'behavior', behaviours: 'behaviors', behavioural: 'behavioral',
  neighbour: 'neighbor', neighbours: 'neighbors', neighbouring: 'neighboring',
  labelled: 'labeled', labeller: 'labeler',
  cancelled: 'canceled', cancelling: 'canceling',
  catalogue: 'catalog', recognised: 'recognized',
};
const BRITISH_RE = new RegExp(`\\b(${Object.keys(BRITISH).join('|')})\\b`, 'gi');

test('prose and identifiers use American spelling', () => {
  const found = [];
  const self = path.relative(ROOT, __filename);
  for (const f of withExt('.js', '.mjs', '.jsx', '.css', '.sh', '.html', '.md')) {
    if (f === self) continue;
    linesOf(f).forEach((line, i) => {
      for (const [word] of line.matchAll(BRITISH_RE)) {
        found.push(`${f}:${i + 1} ${word} → ${BRITISH[word.toLowerCase()]}`);
      }
    });
  }
  assert.deepEqual(found, [], 'British spellings');
});
