'use strict';

const escHtml = require('../escHtml');

// The data goes inside a <script>, where two sequences in author text would derail the
// HTML parser: `</` could close the element early, and `<!--` followed later by
// `<script` stops the element's own </script> from closing it, so the page script after
// it never runs. Both are rewritten as escapes that read back the same in JS and JSON.
function injectTemplate(template, { title, css, js, puzzleData }) {
  const json = JSON.stringify(puzzleData, null, 2).replace(/<\//g, '<\\/').replace(/<!--/g, '\\u003c!--');
  const dataScript = `window.PUZZLE_DATA = ${json};`;
  const values = { TITLE: escHtml(title), CSS: css, JS: js, PUZZLE_DATA: dataScript };
  // One pass, so inserted text is never searched for placeholders again. A function
  // replacer's return value is inserted literally, so $-patterns ($$, $&, $`, $') in
  // the values are never reinterpreted by replace itself.
  return template.replace(/\{\{(TITLE|CSS|JS|PUZZLE_DATA)\}\}/g, (_, key) => values[key]);
}

module.exports = injectTemplate;
