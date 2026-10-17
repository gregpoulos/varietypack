'use strict';

const fs = require('fs');
const path = require('path');
const escHtml = require('../escHtml');

const TEMPLATE = path.join(__dirname, 'index-list.html');

// Writes <buildDir>/index.html: a self-contained page linking each built puzzle.
// `heading` is the page title and <h1> (e.g. "Puzzles"). Called only by
// shared/cli/buildCommand.js's directory mode when --build-index is passed.
// `stdout` is injected (defaulting to process.stdout) so callers can capture the
// build log instead of it going straight to the real stream.
function buildIndex(puzzles, buildDir, heading = 'Puzzles', { stdout = process.stdout } = {}) {
  const links = puzzles.length > 0
    ? puzzles.map(p =>
        `    <li><a href="${escHtml(p.name)}">${escHtml(p.title)}</a></li>`
      ).join('\n')
    : '    <li>No puzzles built yet.</li>';

  // Function replacers: their return value is inserted literally, so
  // $-patterns in an escaped heading/title never get reinterpreted by
  // replaceAll itself.
  const html = fs.readFileSync(TEMPLATE, 'utf8')
    .replaceAll('{{HEADING}}', () => escHtml(heading))
    .replaceAll('{{LINKS}}', () => links);
  fs.writeFileSync(path.join(buildDir, 'index.html'), html, 'utf8');
  stdout.write('Built: index.html\n');
}

module.exports = buildIndex;
