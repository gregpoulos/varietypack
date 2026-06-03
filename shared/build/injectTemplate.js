'use strict';

const escHtml = require('../escHtml');

function injectTemplate(template, { title, css, js, puzzleData }) {
  const dataScript =
    `window.PUZZLE_DATA = ${JSON.stringify(puzzleData, null, 2).replace(/<\//g, '<\\/')};`;
  return template
    .replaceAll('{{TITLE}}',       escHtml(title))
    .replaceAll('{{CSS}}',         css)
    .replaceAll('{{JS}}',          js)
    .replaceAll('{{PUZZLE_DATA}}', dataScript);
}

module.exports = injectTemplate;
