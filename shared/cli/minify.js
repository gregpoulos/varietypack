'use strict';

const { transformSync } = require('esbuild');

// Collapse blank-line runs and trim trailing whitespace. This pass is string-unaware, and
// outside <script>/<style> there are no JS or CSS comments to strip: /* … */ and // are
// page text there (a puzzle title can contain either), so it must never remove them.
function simplePass(text) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '');
}

// esbuild-minify one <script> or <style> body (`loader` 'js' or 'css'); return it
// unchanged, and say why through `onSkip`, if esbuild can't parse it.
function minifyBlock(code, loader, tag, onSkip) {
  try {
    return transformSync(code, { loader, minify: true }).code.trimEnd();
  } catch (err) {
    onSkip(`a <${tag}> was left unminified: ${err.errors?.[0]?.text ?? err.message}`);
    return code;
  }
}

// Minify the HTML page: esbuild-minify each <script> and <style> body, and run the
// whitespace pass on everything outside those blocks. Splitting on the block boundary
// keeps simplePass away from JS and CSS string contents (see its note). The
// backreference \2 matches each closing tag to its opening tag name. `onSkip(message)`
// is called for each block that comes back unminified; the page is still complete and
// correct.
function minifyHtml(html, onSkip = () => {}) {
  const blockRe = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi;
  let out = '';
  let lastIndex = 0;
  for (const m of html.matchAll(blockRe)) {
    out += simplePass(html.slice(lastIndex, m.index));
    const tag = m[2].toLowerCase();
    out += m[1] + minifyBlock(m[3], tag === 'style' ? 'css' : 'js', tag, onSkip) + m[4];
    lastIndex = m.index + m[0].length;
  }
  out += simplePass(html.slice(lastIndex));
  return out;
}

module.exports = { minifyHtml };
