'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const normalize = require('../normalize');

function loadPuzzle(yamlPath) {
  let raw;
  try {
    raw = fs.readFileSync(yamlPath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read file "${yamlPath}": ${err.message}`);
  }
  let puzzle;
  try {
    puzzle = yaml.load(raw);
  } catch (err) {
    throw new Error(`YAML parse error in "${yamlPath}": ${err.message}`);
  }
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    throw new Error(`"${yamlPath}" does not contain a valid YAML object`);
  }
  return puzzle;
}

function validatePuzzle(puzzle, sourcePath, validate) {
  const { errors, warnings } = validate(puzzle);
  if (warnings.length > 0) {
    const label = sourcePath ? `"${sourcePath}"` : 'puzzle';
    process.stderr.write(
      `Warnings for ${label}:\n` +
      warnings.map(w => `  • ${w}`).join('\n') + '\n'
    );
  }
  if (errors.length > 0) {
    const label = sourcePath ? `"${sourcePath}"` : 'puzzle';
    throw new Error(
      `Validation failed for ${label}:\n` +
      errors.map(e => `  • ${e}`).join('\n')
    );
  }
}

const SHARED_DIR = path.join(__dirname, '..');

function buildFontCss(themeName, themeEntry, fontMode) {
  if (!themeEntry || !themeEntry.fonts) return '';
  if (!fontMode) {
    const supported = [
      themeEntry.fonts.faces ? '--font embed' : null,
      themeEntry.fonts.cdn   ? '--font link'  : null,
    ].filter(Boolean);
    throw new Error(`theme '${themeName}' uses custom fonts; pass ${supported.join(' or ')}`);
  }
  if (fontMode === 'link') {
    if (!themeEntry.fonts.cdn) {
      throw new Error(`theme '${themeName}' has no CDN font source; --font link is not supported`);
    }
    return `@import url('${themeEntry.fonts.cdn.url}');\n`;
  }
  if (!themeEntry.fonts.faces) {
    throw new Error(`theme '${themeName}' has no local font files declared; --font embed is not supported`);
  }
  return themeEntry.fonts.faces.map(face => {
    const filePath = path.isAbsolute(face.file)
      ? face.file
      : path.join(SHARED_DIR, 'themes', face.file);
    let data;
    try {
      data = fs.readFileSync(filePath);
    } catch {
      throw new Error(`theme '${themeName}' embed failed: file not found: ${face.file}`);
    }
    const b64 = data.toString('base64');
    return `@font-face {\n  font-family: '${face.family}';\n  font-weight: ${face.weight};\n  font-style: ${face.style};\n  src: url('data:font/woff2;base64,${b64}') format('woff2');\n}\n`;
  }).join('\n');
}

// Assembles the full inlined stylesheet for a tool build, in cascade order:
//   shared base → shared header → tool base
//   → theme-base (neutral --theme-* defaults) → <theme>-tokens (overrides)
//   → theme-components (tool-agnostic + per-tool namespaced rules)
//   → shared print → tool print.
// Owns theme defaulting (→ broadsheet) and validation against THEME_REGISTRY, so
// builders don't repeat it. Adding a theme = drop a <theme>-tokens.css here and add
// an entry in themeRegistry.js; no branch in this function.
function composeThemeCss(templateDir, theme, fontMode) {
  theme = theme ?? 'broadsheet';
  const themeEntry = THEME_REGISTRY[theme];
  if (themeEntry === undefined) {
    throw new Error(`Unknown theme "${theme}". Must be one of: ${VALID_THEMES.join(', ')}.`);
  }
  const fontCss = buildFontCss(theme, themeEntry, fontMode);
  const shared = (rel) => fs.readFileSync(path.join(SHARED_DIR, rel), 'utf8');
  const tool   = (rel) => fs.readFileSync(path.join(templateDir, rel), 'utf8');

  return fontCss
    + shared('base.css') + '\n' + shared('base-header.css') + '\n'
    + tool('base.css') + '\n'
    + shared('themes/theme-base.css') + '\n'
    + shared(`themes/${theme}-tokens.css`) + '\n'
    + shared('themes/theme-components.css') + '\n'
    + shared('themes/print-base.css') + '\n'
    + tool('print.css');
}

function getSharedBundle() {
  const normalizeJs     = fs.readFileSync(path.join(SHARED_DIR, 'normalize.js'),      'utf8');
  const sha256hexJs     = fs.readFileSync(path.join(SHARED_DIR, 'sha256hex.js'),      'utf8');
  const isCellCorrectJs = fs.readFileSync(path.join(SHARED_DIR, 'isCellCorrect.js'),  'utf8');
  const engineChromeJs  = fs.readFileSync(path.join(SHARED_DIR, 'engine-chrome.js'),  'utf8');
  return normalizeJs + '\n' + sha256hexJs + '\n' + isCellCorrectJs + '\n' + engineChromeJs;
}

function defaultOutputPath(inputPath) {
  const dir  = path.dirname(inputPath);
  const base = path.basename(inputPath).replace(/\.ya?ml$/, '.html');
  return path.join(dir, base);
}

const KNOWN_STYLES = new Set(['circle']);

// Validates entry.styles in place, pushing to errors/warnings.
// entryLabel: e.g. "inward[0]" or "entries[3]" — used as error message prefix.
// normLength: normalized answer length (for position bounds checking).
function validateEntryStyles(entry, entryLabel, normLength, errors, warnings) {
  if (entry.styles === undefined) return;
  if (!entry.styles || typeof entry.styles !== 'object' || Array.isArray(entry.styles)) {
    errors.push(`${entryLabel}.styles must be an object`);
    return;
  }
  for (const [styleName, positions] of Object.entries(entry.styles)) {
    if (!KNOWN_STYLES.has(styleName)) {
      warnings.push(`${entryLabel}.styles: unrecognized style "${styleName}"`);
    }
    if (!Array.isArray(positions)) {
      errors.push(`${entryLabel}.styles["${styleName}"] must be an array`);
    } else {
      positions.forEach((pos, j) => {
        if (!Number.isInteger(pos) || pos < 0 || pos >= normLength) {
          errors.push(
            `${entryLabel}.styles["${styleName}"][${j}]: position ${pos} is out of range (answer has ${normLength} cells)`
          );
        }
      });
    }
  }
}

// Validates the header fields common to every puzzle kind: the object itself,
// `kind`, `title`, and optional `instructions`. Pushes user-readable messages
// to `errors`. Returns false when the puzzle is not a usable object (the
// caller should bail), true otherwise. Tool-specific fields (e.g.
// snake-charmer's `loops`/`shape`) are validated separately by each tool.
// `hashed:` is only valid in muddled format (requires top-level `boardHash:`);
// in source puzzles, use `varietypack build --muddle` instead.
function validateCommonHeader(puzzle, kind, errors, warnings) {
  if (!puzzle || typeof puzzle !== 'object') {
    errors.push('Puzzle must be a YAML object');
    return false;
  }
  if (puzzle.kind !== kind) {
    errors.push(`"kind" must be "${kind}", got: ${JSON.stringify(puzzle.kind)}`);
  }
  if (!puzzle.title || typeof puzzle.title !== 'string' || !puzzle.title.trim()) {
    errors.push('"title" must be a non-empty string');
  }
  if (puzzle.hashed !== undefined && puzzle.boardHash === undefined) {
    errors.push('"hashed:" is not valid in source puzzles; use \'varietypack build --muddle\' to produce a hashed build');
  }
  if (puzzle.instructions !== undefined &&
      (typeof puzzle.instructions !== 'string' || !puzzle.instructions.trim())) {
    errors.push('"instructions" must be a non-empty string');
  }
  // js-yaml parses unquoted ISO dates (e.g. date: 2026-05-01) as Date objects.
  // Coerce to YYYY-MM-DD so the storage key and byline are consistent regardless
  // of quoting. The warning tells the author how to avoid the ambiguity.
  if (puzzle.date instanceof Date) {
    if (warnings) warnings.push('"date" was parsed as a Date object — wrap it in quotes (e.g., date: "2026-05-01") to avoid ambiguity');
    puzzle.date = puzzle.date.toISOString().slice(0, 10);
  }
  return true;
}

// Routes reading an entry's length: source entries (which have `answer:`) compute from
// it, muddled entries fall back to the `length:` field. Keyed on `answer` presence — not
// `length` presence — so it stays consistent with entryNorm and with the validator when a
// stray `length` accompanies an `answer`.
function entryLength(entry) {
  return entry.answer !== undefined ? normalize(entry.answer).length : entry.length;
}

// Routes reading an entry's normalized answer to either null for muddled entries
// (which have no plaintext) or returns the normalized form for source entries.
function entryNorm(entry) {
  return entry.answer !== undefined ? normalize(entry.answer) : null;
}

// Normalizes a list of YAML entries into the shape every hasher needs:
// { clue, length, _norm } plus styles passed through verbatim when present.
// `_norm` (the normalized answer) is retained for callers that need the letters
// (e.g. building a letters array or hashing); strip it before it reaches PUZZLE_DATA.
// styles is included on presence (`!== undefined`), never by truthiness.
function processEntries(entries) {
  return entries.map(entry => {
    const norm = entryNorm(entry);
    const out  = { clue: entry.clue, length: entryLength(entry), _norm: norm };
    if (entry.styles !== undefined) out.styles = entry.styles;
    return out;
  });
}

// Returns the fields common to every tool's PUZZLE_DATA object.
// Required fields (title, kind, hashed) are always included.
// Optional fields (author, date, instructions, letters, boardHash) are
// included only when !== undefined, so JSON.stringify never emits them as null.
function commonPuzzleData(prepared) {
  const data = {
    title:  prepared.title,
    kind:   prepared.kind,
    hashed: prepared.hashed,
  };
  if (prepared.author       !== undefined) data.author       = prepared.author;
  if (prepared.date         !== undefined) data.date         = prepared.date;
  if (prepared.instructions !== undefined) data.instructions = prepared.instructions;
  if (prepared.letters      !== undefined) data.letters      = prepared.letters;
  if (prepared.boardHash    !== undefined) data.boardHash    = prepared.boardHash;
  return data;
}

const { THEME_REGISTRY, VALID_THEMES } = require('./themeRegistry');

module.exports = { loadPuzzle, validatePuzzle, composeThemeCss, buildFontCss, getSharedBundle, defaultOutputPath, validateEntryStyles, processEntries, validateCommonHeader, entryLength, entryNorm, commonPuzzleData };
