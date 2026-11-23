'use strict';
// What the Export panel offers and how each file is produced. Pure: it builds strings
// from a document and returns them; the UI turns them into downloads.
const core = require('../core');
const { puzzleText } = require('./doc');
const { THEME_REGISTRY, VALID_THEMES } = require('../../../shared/build/themeRegistry');
const { serializeDraft } = require('./drafts');

const DEFAULT_THEME = 'broadsheet';

// 'draft' when Download YAML saves the studio's JSON draft instead of puzzle YAML: a
// structured puzzle with cells or clues still missing can't be written as YAML (an answer
// is a string of letters, so an empty cell has no spelling).
function yamlSaves(doc) {
  return doc.mode === 'structured' && puzzleText(doc) === null ? 'draft' : 'yaml';
}

function failWith(errors) {
  const err = new Error(errors.join('\n'));
  err.errors = errors;
  return err;
}

// Puts `theme` in the text's own top-level `theme:` line, so comments and layout survive.
// With no such line it goes right after `kind:`, else first.
function setThemeLine(text, theme) {
  const line = `theme: ${theme}`;
  if (/^theme:.*$/m.test(text)) return text.replace(/^theme:.*$/m, line);
  if (/^kind:.*$/m.test(text)) return text.replace(/^kind:.*$/m, m => `${m}\n${line}`);
  return `${line}\n${text}`;
}

const themeIn = (puzzle) => (typeof puzzle.theme === 'string' ? puzzle.theme : DEFAULT_THEME);

// → { text, mime, type }. `target` is 'page' or 'yaml'. The theme is written only when it
// differs from the file's own. Throws (with `.errors` when the puzzle is the problem) for
// a page, or a hidden-answers YAML, that can't be built; plain YAML never throws for
// problems, since it is the text as it stands.
function buildExport(target, doc, { font, theme, hideAnswers, savedAtIso }) {
  if (target === 'yaml' && yamlSaves(doc) === 'draft') {
    return { text: serializeDraft(doc, savedAtIso), mime: 'application/json', type: 'draft' };
  }
  const muddledDoc = doc.mode === 'muddled';
  const hide = muddledDoc || !!hideAnswers;
  const text = puzzleText(doc);
  if (text === null) throw failWith(['the puzzle is incomplete: finish the cells and clues first']);

  // Page: the build, with the chosen theme, hashed when the answers are hidden.
  if (target === 'page') {
    const puzzle = muddledDoc ? doc.muddled : core.parseYaml(text);
    const r = core.checkPuzzle(puzzle, { font, theme, ...(hide && !muddledDoc ? { muddle: true } : {}) });
    if (r.errors.length) throw failWith(r.errors);
    return { text: r.html, mime: 'text/html', type: hide ? 'hashed' : 'html' };
  }

  // Answers-hidden YAML: the muddled file, carrying the chosen theme.
  if (hide) {
    if (muddledDoc) {
      const out = theme === themeIn(doc.muddled) ? doc.muddled : { ...doc.muddled, theme };
      return { text: core.dumpYaml(out), mime: 'text/yaml', type: 'muddled' };
    }
    const puzzle = core.parseYaml(text);
    const r = core.muddle(theme === themeIn(puzzle) ? puzzle : { ...puzzle, theme });
    if (r.errors.length) throw failWith(r.errors);
    return { text: r.text, mime: 'text/yaml', type: 'muddled' };
  }

  // Plain YAML: the text, with the theme line changed only if the theme differs. Text
  // that doesn't parse is returned as it is.
  let parsed;
  try { parsed = core.parseYaml(text); } catch { return { text, mime: 'text/yaml', type: 'source' }; }
  if (theme === themeIn(parsed)) return { text, mime: 'text/yaml', type: 'source' };
  // The line splice only understands a plain column-0 `theme:`; a quoted key, a
  // `theme :`, a leading `---` or a block value would corrupt the file. So the splice
  // must reparse to the chosen theme, else the file is rewritten whole (comments lost,
  // but correct).
  const spliced = setThemeLine(text, theme);
  // Everything but the theme must also be unchanged: a leading BOM, say, would end up
  // mid-file and silently rename the first key.
  const rest = ({ theme: _t, ...others }) => JSON.stringify(others);
  let ok = false;
  try {
    const re = core.parseYaml(spliced);
    ok = re.theme === theme && rest(re) === rest(parsed);
  } catch { /* corrupt splice */ }
  return { text: ok ? spliced : core.dumpYaml({ ...parsed, theme }), mime: 'text/yaml', type: 'source' };
}

// The theme the file itself names (null when it names none): the muddled file's own, the
// structured header's, or what the last check read from the YAML text.
function fileTheme(doc, check) {
  const theme = doc.mode === 'muddled' ? doc.muddled.theme
    : doc.mode === 'structured' ? doc.model.header.theme
    : check && check.theme;
  return VALID_THEMES.includes(theme) ? theme : null;
}

// Whether the Export theme can change what is saved: not for a draft (the studio's
// JSON file carries no theme), nor for YAML-mode text that doesn't parse (it saves as
// typed). Reads the text itself, not the debounced check, so it is right while a check
// is pending.
function themeApplies(doc) {
  if (yamlSaves(doc) === 'draft') return false;
  if (doc.mode !== 'yaml') return true;
  try { core.parseYaml(puzzleText(doc)); return true; } catch { return false; }
}

// The theme the preview shows: the picker's choice, else the file's, else the default.
function previewTheme(doc, check) {
  return doc.options.previewTheme ?? fileTheme(doc, check) ?? DEFAULT_THEME;
}

function themeHasFont(theme) {
  return !!(THEME_REGISTRY[theme] && THEME_REGISTRY[theme].fonts);
}

module.exports = { yamlSaves, setThemeLine, buildExport, themeHasFont, themeApplies, fileTheme, previewTheme };
