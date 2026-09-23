'use strict';

const MarkdownIt = require('markdown-it');
const sub   = require('markdown-it-sub');
const sup   = require('markdown-it-sup');
const emoji = require('markdown-it-emoji').full;

// Node-only, build-time rendering of clue/instructions markdown into static
// HTML baked into PUZZLE_DATA — the shipped puzzle HTML gains no runtime
// markdown dependency; the browser just injects the already-rendered string.
//
// 'zero' preset disables every rule, then this enables only what's wanted:
// bold, italic, code, links, and (via the two small official plugins)
// strikethrough, subscript, and superscript, plus emoji shortcodes.
// Deliberately excludes block structure (headings, lists, blockquotes,
// tables, images) and autolinking — clue/instructions text is short prose
// living inside a `<span>` or a couple of `<p>`s, not a document, and images
// or autolinking a bare URL widen the input surface for no benefit this
// format needs.
//
// `typographer: true` plus the `replacements`/`smartquotes` core rules (also
// disabled by the 'zero' preset, and not covered by the `enable()` call
// above since they're core rules, not inline ones) curl straight quotes and
// convert `--`/`---` and `...` to dashes/ellipsis. `escape` is enabled
// alongside them so `\"` and `\*` still produce a literal character — without
// it, a backslash before a quote or asterisk passes straight through as text
// (it's not a markdown escape) rather than suppressing the curl/emphasis it
// precedes.
const md = new MarkdownIt('zero', { html: false, linkify: false, typographer: true });
md.enable(['emphasis', 'strikethrough', 'backticks', 'link', 'replacements', 'smartquotes', 'escape']);
md.use(sub).use(sup).use(emoji);

// Every rendered link opens in a new tab: a clue's <li> already has its own
// click handler (selecting/navigating to that entry), so a same-tab link
// click would both follow the link AND fire that handler — worse, without
// target="_blank" it would navigate the puzzle page itself away, discarding
// the tab a solver was mid-puzzle in. rel="noopener noreferrer" is the
// standard safety pairing for target="_blank" (prevents the opened page from
// reaching back via window.opener).
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

// `html: false` escapes any literal HTML in the source rather than passing
// it through, so an author's clue text can never inject a tag. markdown-it's
// own default `validateLink` already rejects script-executing URL schemes
// (`javascript:`, `vbscript:`, etc.) — no custom override needed for that.

// Bold/italic/code/links/strikethrough/subscript/superscript/emoji, no block
// structure — for text that lives inside an inline element (a clue), not a
// paragraph. Plain text with no markdown syntax passes through unchanged.
function renderClueMarkdown(text) {
  return md.renderInline(text);
}

// Same rule set, but block-level: blank-line-separated paragraphs each
// become their own `<p>`, replacing the client-side blank-line split
// `shared/engine-chrome.js`'s `renderInstructions` used to do itself — the
// engine now just injects this HTML directly.
function renderInstructionsMarkdown(text) {
  return md.render(text);
}

module.exports = { renderClueMarkdown, renderInstructionsMarkdown };
