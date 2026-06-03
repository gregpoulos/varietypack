'use strict';

const fs = require('fs');
const path = require('path');
const escHtml = require('../escHtml');

const TEMPLATE = path.join(__dirname, 'index-list.html');

// Writes <buildDir>/index.html: a self-contained page linking each built puzzle.
// `heading` is the page title and <h1> (e.g. "Puzzles"). Called only by
// cli.js directory mode when --build-index is passed.
function buildIndex(puzzles, buildDir, heading = 'Puzzles') {
  const links = puzzles.length > 0
    ? puzzles.map(p =>
        `    <li><a href="${escHtml(p.name)}">${escHtml(p.title)}</a></li>`
      ).join('\n')
    : '    <li>No puzzles built yet.</li>';

  const html = fs.readFileSync(TEMPLATE, 'utf8')
    .replaceAll('{{HEADING}}', escHtml(heading))
    .replaceAll('{{LINKS}}', links);
  fs.writeFileSync(path.join(buildDir, 'index.html'), html, 'utf8');
  console.log('Built: index.html');
}

module.exports = buildIndex;
