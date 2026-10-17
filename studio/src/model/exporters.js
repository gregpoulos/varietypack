'use strict';
// What the Export panel offers and how each file is produced. Pure: it builds strings
// from a document and returns them; the UI turns them into downloads.
const core = require('../core');
const { puzzleText } = require('./doc');
const { THEME_REGISTRY } = require('../../../shared/build/themeRegistry');
const escHtml = require('../../../shared/escHtml');

const DEFAULT_THEME = 'broadsheet';

// In panel order. `modes` is where the file is offered ('yaml' = a source document).
const FILES = [
  { id: 'hashed', type: 'hashed', mime: 'text/html', modes: ['yaml', 'muddled'], best: true,
    name: 'Puzzle page, answers hidden',
    desc: 'The page to publish, or to send to test-solvers. It tells solvers when the whole grid is right, but nobody can read the answers from the file, so it holds up in a puzzle hunt.' },
  // Opens the embed dialog instead of downloading: it needs the host's origin first.
  { id: 'embed', type: 'hashed', mime: 'text/html', modes: ['yaml', 'muddled'], dialog: true,
    name: 'Puzzle page for embedding',
    desc: 'The answers-hidden page, set up to sit in an iframe on another site, with a snippet to paste there. That site can verify a solve without ever seeing the answers.' },
  { id: 'html', type: 'html', mime: 'text/html', modes: ['yaml'],
    name: 'Puzzle page',
    desc: 'Solvers can also check single cells, but anyone can read the answers in the file.' },
  { id: 'source', type: 'source', mime: 'text/yaml', modes: ['yaml'],
    name: 'Puzzle file',
    desc: 'Everything, answers included. Keep it to work on the puzzle later, here or from the command line.' },
  { id: 'muddled', type: 'muddled', mime: 'text/yaml', modes: ['yaml', 'muddled'],
    name: 'Muddled puzzle file',
    desc: 'The puzzle without its answers, for someone else to build into a page, such as a puzzle hunt’s site or a blog with its own theme. They can build and test-solve it, but can’t read the answers.',
    mudDesc: 'This file again, with the theme you picked.' },
];

// A structured document exports like a YAML one: its text is the puzzle it describes.
const modeOf = (doc) => (doc.mode === 'muddled' ? 'muddled' : 'yaml');
const sourceText = (doc) => (doc.mode === 'structured' ? puzzleText(doc) : doc.yaml);

function exportList(doc) {
  return FILES.filter(f => f.modes.includes(modeOf(doc))).map(f => ({
    id: f.id, type: f.type, mime: f.mime, best: !!f.best, dialog: !!f.dialog, name: f.name,
    desc: modeOf(doc) === 'muddled' && f.mudDesc ? f.mudDesc : f.desc,
  }));
}

function failWith(errors) {
  const err = new Error(errors.join('\n'));
  err.errors = errors;
  return err;
}

function buildPage(doc, options) {
  const puzzle = doc.mode === 'muddled' ? doc.muddled : core.parseYaml(sourceText(doc));
  const r = core.checkPuzzle(puzzle, options);
  if (r.errors.length) throw failWith(r.errors);
  return r.html;
}

// → { text, mime, type }. Throws when the puzzle has problems, or the file isn't offered.
function buildExport(id, doc, { font }) {
  const file = exportList(doc).find(f => f.id === id);
  if (!file) throw new Error(`"${id}" is not available for this puzzle`);
  if (file.dialog) throw new Error(`"${id}" is built with buildEmbed`);
  const mud = doc.mode === 'muddled';
  let text;
  if (id === 'source') {
    text = sourceText(doc);
  } else if (id === 'html') {
    text = buildPage(doc, { font });
  } else if (id === 'hashed') {
    text = buildPage(doc, mud ? { font } : { font, muddle: true });
  } else if (mud) {
    text = puzzleText(doc);
  } else {
    const r = core.muddle(core.parseYaml(sourceText(doc)));
    if (r.errors.length) throw failWith(r.errors);
    text = r.text;
  }
  return { text, mime: file.mime, type: file.type };
}

// The answers-hidden page, built to post solves (with the solution) to `embedOrigin`
// only. → { text, mime, type }. Throws on an invalid origin or when the puzzle has
// problems.
function buildEmbed(doc, { font, embedOrigin }) {
  const mud = doc.mode === 'muddled';
  const text = buildPage(doc, { font, embedOrigin, ...(mud ? {} : { muddle: true }) });
  return { text, mime: 'text/html', type: 'hashed' };
}

// The markup an author pastes on the host page: the iframe, and the listener that sizes
// it to the height the puzzle posts. Title and URL are escaped for the attribute they go
// in.
function embedSnippet({ url, title }) {
  return `<iframe src="${escHtml(url)}" title="${escHtml(title)}" data-varietypack style="width:100%;border:0;min-height:480px"></iframe>
<script>
addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'varietypack:resize') return;
  document.querySelectorAll('iframe[data-varietypack]').forEach(function (f) {
    if (f.contentWindow === e.source) f.style.height = e.data.height + 'px';
  });
});
</script>`;
}

// The puzzle's theme: the muddled file's own, or what the last check read from the YAML.
function themeOf(doc, check) {
  const theme = doc.mode === 'muddled' ? doc.muddled.theme : check && check.theme;
  return theme || DEFAULT_THEME;
}

function themeHasFont(theme) {
  return !!(THEME_REGISTRY[theme] && THEME_REGISTRY[theme].fonts);
}

module.exports = { exportList, buildExport, buildEmbed, embedSnippet, themeOf, themeHasFont };
