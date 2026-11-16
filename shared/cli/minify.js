'use strict';

// terser and clean-css load lazily: requiring them adds tens of milliseconds to every
// tool process's startup, which only a --minify build should pay.
let cleanCss;

// Collapse blank-line runs and trim trailing whitespace. This pass is string-unaware, and
// outside <script>/<style> there are no JS or CSS comments to strip: /* … */ and // are
// page text there (a puzzle title can contain either), so it must never remove them.
// terser and clean-css handle comments inside their own blocks.
function simplePass(text) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '');
}

// terser-minify one <script> body; return it unchanged, and say why through `onSkip`, if
// terser can't parse it (minify_sync throws on a parse error, which the catch handles).
function minifyScript(js, onSkip) {
  const { minify_sync } = require('terser');
  try {
    return minify_sync(js, { compress: true, mangle: true }).code;
  } catch (err) {
    onSkip(`a <script> was left unminified: ${err.message}`);
    return js;
  }
}

// clean-css-minify one <style> body; return it unchanged, and say why through `onSkip`,
// if clean-css reports an error or a warning (it collects both rather than throwing, so
// check the result). A warning counts: syntax clean-css doesn't know (CSS nesting, for
// one) is a warning, and the styles it returns then have those rules dropped or mangled.
// `inline: ['none']` leaves every @import as written. The default tries to inline one,
// and warns about a remote one it has no fetch callback for, which --font link emits.
function minifyStyle(css, onSkip) {
  if (!cleanCss) {
    const CleanCSS = require('clean-css');
    cleanCss = new CleanCSS({ inline: ['none'] });
  }
  const result = cleanCss.minify(css);
  const problems = [...result.errors, ...result.warnings];
  if (!problems.length) return result.styles;
  onSkip(`a <style> was left unminified: ${problems.join('; ')}`);
  return css;
}

// Minify the HTML bundle: terser-minify each <script> body, clean-css-minify each
// <style> body, and run the whitespace pass on everything outside those
// blocks. Splitting on the block boundary keeps simplePass away from JS and CSS
// string contents (see its note). The backreference \2 matches each closing tag
// to its opening tag name. `onSkip(message)` is called for each block that comes back
// unminified (minifyScript, minifyStyle); the page is still complete and correct.
function minifyHtml(html, onSkip = () => {}) {
  const blockRe = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi;
  let out = '';
  let lastIndex = 0;
  for (const m of html.matchAll(blockRe)) {
    out += simplePass(html.slice(lastIndex, m.index));
    const minifyBody = m[2].toLowerCase() === 'style' ? minifyStyle : minifyScript;
    out += m[1] + minifyBody(m[3], onSkip) + m[4];
    lastIndex = m.index + m[0].length;
  }
  out += simplePass(html.slice(lastIndex));
  return out;
}

module.exports = { minifyHtml };
