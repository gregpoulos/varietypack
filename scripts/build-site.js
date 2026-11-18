#!/usr/bin/env node
'use strict';

// Builds the hosted site: every example in every theme, a landing page that links them,
// and the studio. The release process runs it and publishes the output (all gitignored)
// for GitHub Pages to serve.
//
//   node scripts/build-site.js [-o <root>]    # default root: the repo
//
// Writes <root>/examples/<theme>/<puzzle>.html, <root>/examples/index.html and
// <root>/studio/index.html. Puzzles go through cli.js like any user's build, so the site
// shows what `varietypack build --theme <theme>` makes.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const yaml = require('js-yaml');
const escHtml = require('../shared/escHtml');
const parseCliArgs = require('../shared/cli/parseCliArgs');
const { VALID_THEMES } = require('../shared/build/themeRegistry');

const REPO = path.resolve(__dirname, '..');
const SOURCES = path.join(REPO, 'examples');

// The default theme's pages come first, so the landing page leads with them.
const THEMES = ['broadsheet', ...VALID_THEMES.filter(t => t !== 'broadsheet')];

// Runs a repo script (path relative to the repo) with node; throws if it fails.
function run(script, ...args) {
  const res = spawnSync(process.execPath, [path.join(REPO, script), ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (res.status !== 0) throw new Error(`failed: ${script} ${args.join(' ')}`);
}

// One example per .yaml in examples/, titled by its own `title:`.
function listExamples() {
  return fs.readdirSync(SOURCES).filter(f => /\.ya?ml$/i.test(f)).sort().map(file => {
    const name = path.basename(file, path.extname(file));
    const { title } = yaml.load(fs.readFileSync(path.join(SOURCES, file), 'utf8'));
    return { name, title: typeof title === 'string' ? title : name };
  });
}

function landingPage(examples) {
  const head = THEMES.map(t => `<th>${escHtml(t)}</th>`).join('');
  const rows = examples.map(ex => {
    const cells = THEMES.map(t => `<td><a href="${escHtml(t)}/${escHtml(ex.name)}.html">${escHtml(t)}</a></td>`).join('');
    return `    <tr><th scope="row">${escHtml(ex.title)}</th>${cells}</tr>`;
  }).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Examples</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 640px; margin: 40px auto; padding: 0 20px; background: #f9f7f1; color: #222; }
    h1 { border-bottom: 2px solid #222; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { text-align: left; padding: 10px 12px 10px 0; }
    thead th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #666; }
    tbody tr { border-top: 1px solid #ddd; }
    a { color: #222; }
    p { margin-top: 24px; }
  </style>
</head>
<body>
  <h1>Examples</h1>
  <table>
    <thead><tr><th></th>${head}</tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <p><a href="../studio/">Open the studio</a> to compose a puzzle in the browser.</p>
</body>
</html>
`;
}

function main() {
  const { values } = parseCliArgs(process.argv.slice(2), { output: { type: 'string', short: 'o' } }, { maxPositionals: 0 });
  const root = path.resolve(values.output ?? REPO);
  const examples = listExamples();

  // Each theme gets its own directory of every example.
  for (const theme of THEMES) {
    run('cli.js', 'build', SOURCES, '-o', path.join(root, 'examples', theme), '--theme', theme, '-f');
  }
  fs.writeFileSync(path.join(root, 'examples', 'index.html'), landingPage(examples), 'utf8');

  // The studio is one self-contained file.
  run('studio/build.js');
  fs.mkdirSync(path.join(root, 'studio'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'studio', 'build', 'index.html'), path.join(root, 'studio', 'index.html'));
}

try { main(); } catch (err) { console.error(err.message); process.exit(1); }
