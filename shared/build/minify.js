'use strict';

const { minify_sync } = require('terser');
const CleanCSS = require('clean-css');

const cleanCss = new CleanCSS();

// Strip HTML comments and trim incidental whitespace. This pass is
// string-unaware, so it must run ONLY on segments outside <script>/<style>: a
// /* … */ or // sequence inside a JS/JSON string literal (e.g. PUZZLE_DATA,
// where author text can contain anything) or a CSS string value (e.g.
// content: "…") would otherwise be deleted, silently corrupting data or
// breaking the document. terser and clean-css handle their own blocks safely.
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

// clean-css-minify one <style> body; return it unchanged if clean-css reports an
// error (it collects errors rather than throwing, so check the result).
function minifyStyle(css) {
  const result = cleanCss.minify(css);
  return result.errors.length ? css : result.styles;
}

// Minify the HTML bundle: terser-minify each <script> body, clean-css-minify each
// <style> body, and run the comment/whitespace pass on everything outside those
// blocks. Splitting on the block boundary keeps simplePass away from JS and CSS
// string contents (see its note). The backreference \2 matches each closing tag
// to its opening tag name.
function minifyHtml(html) {
  const blockRe = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi;
  let out = '';
  let lastIndex = 0;
  for (const m of html.matchAll(blockRe)) {
    out += simplePass(html.slice(lastIndex, m.index));
    const minifyBody = m[2].toLowerCase() === 'style' ? minifyStyle : minifyScript;
    out += m[1] + minifyBody(m[3]) + m[4];
    lastIndex = m.index + m[0].length;
  }
  out += simplePass(html.slice(lastIndex));
  return out;
}

module.exports = { minifyHtml };
