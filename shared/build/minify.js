'use strict';

const { minify_sync } = require('terser');

// Strip CSS/HTML comments and trim incidental whitespace. This pass is
// string-unaware, so it must run ONLY on non-<script> segments: a /* … */ or //
// sequence inside a JS/JSON string literal (e.g. PUZZLE_DATA, where author text
// can contain anything) would otherwise be deleted, silently corrupting data or
// breaking the whole document. terser handles comment removal inside scripts.
function simplePass(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[^\S\n]*\/\/[^\n]*\n/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '');
}

// terser-minify one <script> body; return it unchanged if terser can't parse it
// (minify_sync throws on a parse error, which the catch handles).
function minifyScript(js) {
  try {
    return minify_sync(js, { compress: true, mangle: true }).code;
  } catch (_) {
    return js;
  }
}

// Minify the HTML bundle: terser-minify the body of each <script> block and run
// the comment/whitespace pass on everything outside scripts. Splitting on the
// script boundary keeps simplePass away from JS string contents (see its note).
function minifyHtml(html) {
  const scriptRe = /(<script[^>]*>)([\s\S]*?)(<\/script>)/g;
  let out = '';
  let lastIndex = 0;
  for (const m of html.matchAll(scriptRe)) {
    out += simplePass(html.slice(lastIndex, m.index));
    out += m[1] + minifyScript(m[2]) + m[3];
    lastIndex = m.index + m[0].length;
  }
  out += simplePass(html.slice(lastIndex));
  return out;
}

module.exports = { minifyHtml };
