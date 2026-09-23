'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const normalize = require('../normalize');
const sha256hex = require('../sha256hex');
const { joinCells } = require('../boardString');
const { renderClueMarkdown, renderInstructionsMarkdown } = require('./renderMarkdown');
const injectTemplate = require('./injectTemplate');
const { THEME_REGISTRY, VALID_THEMES } = require('./themeRegistry');

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
  const boardStringJs   = fs.readFileSync(path.join(SHARED_DIR, 'boardString.js'),    'utf8');
  const engineStateJs   = fs.readFileSync(path.join(SHARED_DIR, 'engine-state.js'),   'utf8');
  const engineChromeJs  = fs.readFileSync(path.join(SHARED_DIR, 'engine-chrome.js'),  'utf8');
  return normalizeJs + '\n' + sha256hexJs + '\n' + isCellCorrectJs + '\n' + boardStringJs + '\n'
    + engineStateJs + '\n' + engineChromeJs;
}

// Shared skeleton for every tool's buildHtml(): read the tool's index.html
// template, compose its theme CSS, concatenate the shared browser bundle
// with the tool's own JS files, and inject title/css/js/puzzleData into the
// template. jsFiles is an ordered list of absolute paths (tool-specific JS,
// engine.js last) — callers own everything about *which* fields end up in
// puzzleData (commonPuzzleData(prepared) plus tool fields); this only owns
// the file I/O and injection that is byte-for-byte identical across tools.
function buildToolHtml(templateDir, { title, theme, font, jsFiles, puzzleData }) {
  const template = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf8');
  const css = composeThemeCss(templateDir, theme, font);
  const js  = getSharedBundle() + '\n' + jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  return injectTemplate(template, { title, css, js, puzzleData });
}

function defaultOutputPath(inputPath) {
  const dir  = path.dirname(inputPath);
  const base = path.basename(inputPath).replace(/\.ya?ml$/, '.html');
  return path.join(dir, base);
}

const KNOWN_STYLES = new Set(['circle']);

// Validates entry.styles in place, pushing to errors/warnings.
// entryLabel: e.g. "inward[0]" or "entries[3]" — used as error message prefix.
// cellCount: the entry's cell count (for position bounds checking).
function validateEntryStyles(entry, entryLabel, cellCount, errors, warnings) {
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
        if (!Number.isInteger(pos) || pos < 0 || pos >= cellCount) {
          errors.push(
            `${entryLabel}.styles["${styleName}"][${j}]: position ${pos} is out of range (answer has ${cellCount} cells)`
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
  // format: 2 — see root CLAUDE.md -> "Muddled YAML format" for the full rule.
  const isMuddled = puzzle.boardHash !== undefined;
  if (puzzle.format !== undefined && !isMuddled) {
    errors.push('"format:" is not valid in source puzzles; it is written by \'varietypack muddle\'');
  }
  if (isMuddled && puzzle.format !== 2) {
    errors.push(
      'Muddled file is missing "format: 2". It was produced by an older version whose ' +
      'boardHash cannot be verified — re-run \'varietypack muddle\' on the source puzzle.'
    );
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

// Parses an answer string into normalized per-cell strings using bracket notation:
// unmarked characters are one cell each; a [...] group is exactly one cell.
// A BARE character that normalizes to empty is dropped (this is what preserves the
// pre-rebus behavior of spaces, hyphens and apostrophes). A BRACKETED group that
// normalizes to empty is an error — the author explicitly marked a cell there.
// Returns { cells, error }; exactly one is non-null.
function parseAnswerCells(answer) {
  if (typeof answer !== 'string') {
    throw new TypeError(`parseAnswerCells: answer must be a string, got ${JSON.stringify(answer)}`);
  }
  const cells = [];
  let i = 0;
  while (i < answer.length) {
    const ch = answer[i];
    if (ch === '[') {
      const end = answer.indexOf(']', i + 1);
      if (end === -1) return { cells: null, error: 'unclosed "[" in answer' };
      const inner = answer.slice(i + 1, end);
      if (inner.includes('[')) return { cells: null, error: 'nested "[" in answer' };
      const norm = normalize(inner);
      if (!norm) return { cells: null, error: `bracketed group "[${inner}]" contains no letters` };
      cells.push(norm);
      i = end + 1;
    } else if (ch === ']') {
      return { cells: null, error: 'unmatched "]" in answer' };
    } else {
      const norm = normalize(ch);
      if (norm) cells.push(norm);
      i++;
    }
  }
  return { cells, error: null };
}

// An entry's normalized per-cell strings, or null for a muddled entry (no plaintext)
// and for invalid bracket grammar. validateEntry rejects bad grammar at validate time;
// the null here, and cellsOrThrow's throw below, only matter for callers that reach a
// hasher without validating first (e.g. hand-built objects in tests).
function entryCells(entry) {
  if (entry.answer === undefined) return null;
  return parseAnswerCells(entry.answer).cells;
}

// Parses an answer's cells or throws on invalid bracket grammar — strictly better than
// silently hashing an empty board. `caller` names the function in the error message.
function cellsOrThrow(answer, caller) {
  const cells = parseAnswerCells(answer).cells;
  if (cells === null) {
    throw new TypeError(`${caller}: answer has invalid bracket grammar: ${JSON.stringify(answer)}`);
  }
  return cells;
}

// An entry's length — ALWAYS a cell count, never a letter count. Keyed on `answer`
// presence, not `length`, so it agrees with entryCells when a stray `length`
// accompanies an `answer`.
function entryLength(entry) {
  if (entry.answer === undefined) return entry.length;
  return cellsOrThrow(entry.answer, 'entryLength').length;
}

// Normalizes a list of YAML entries into the shape every hasher needs:
// { clue, length, _cells } plus styles, passed through on presence (`!== undefined`).
// `_cells` is for hashing/letters and must be stripped before it reaches PUZZLE_DATA.
// clue is rendered as inline markdown here — the one place every tool's entries funnel
// through — and a muddled entry still has clue text, so this runs unconditionally.
function processEntries(entries) {
  return entries.map(entry => {
    let cells, length;
    if (entry.answer === undefined) {
      cells = null;
      length = entry.length;
    } else {
      cells = cellsOrThrow(entry.answer, 'processEntries');
      length = cells.length;
    }
    const out = { clue: renderClueMarkdown(entry.clue), length, _cells: cells };
    if (entry.styles !== undefined) out.styles = entry.styles;
    return out;
  });
}

// The optional `instructions` field for a hasher's prepared object, rendered as
// block-level markdown (blank-line paragraphs become separate <p>s — see
// shared/build/renderMarkdown.js). Returns {} when absent, so hashers spread it
// and never emit the key as undefined.
function instructionsField(puzzle) {
  return puzzle.instructions !== undefined
    ? { instructions: renderInstructionsMarkdown(puzzle.instructions) }
    : {};
}

// Shared board-computation guard + metadata header, called once per hasher's
// preparePuzzle(). A muddled puzzle (puzzle.boardHash !== undefined) passes
// its boardHash through untouched and computeBoard is never invoked — this
// is what keeps entryCells' "null for a muddled entry" contract safe: nothing
// downstream of computeBoard (processEntries' _cells, entryCells itself) ever
// runs for a muddled puzzle, because computeBoard simply isn't called. For a
// source puzzle, computeBoard() runs and returns { boardCells, letters }:
// boardCells is joined (joinCells) and hashed to produce boardHash; letters
// is the array assigned to PUZZLE_DATA.letters when the puzzle isn't hashed.
// The two differ when a tool's letters array carries positions boardCells
// omits (e.g. marching-bands' odd-N center cell, which is null in letters
// but absent from boardCells and thus from the hash preimage).
function prepareCommon(puzzle, kind, computeBoard) {
  const hashed = puzzle.hashed ?? false;
  const prepared = {
    title:  puzzle.title,
    kind,
    author: puzzle.author,
    date:   puzzle.date,
    hashed,
    ...instructionsField(puzzle),
  };

  if (puzzle.boardHash !== undefined) {
    prepared.boardHash = puzzle.boardHash;
    return prepared;
  }

  const { boardCells, letters } = computeBoard();
  prepared.boardHash = sha256hex(joinCells(boardCells));
  if (!hashed) prepared.letters = letters;
  return prepared;
}

// Returns the fields common to every tool's PUZZLE_DATA object.
// Required fields (title, kind, hashed) are always included.
// Optional fields (author, date, instructions, letters, boardHash) are
// included only when !== undefined, so JSON.stringify never emits them as null.
// instructions arrives already rendered to HTML (instructionsField, at prepare time).
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

module.exports = { loadPuzzle, validatePuzzle, composeThemeCss, buildFontCss, getSharedBundle, buildToolHtml, defaultOutputPath, validateEntryStyles, processEntries, validateCommonHeader, entryLength, parseAnswerCells, entryCells, cellsOrThrow, commonPuzzleData, instructionsField, prepareCommon };
