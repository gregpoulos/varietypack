'use strict';
// Puzzle-level validation every tool shares: the header fields, the embed origin, and
// the wording of the messages. Per-entry checks are in validateEntry.js.

const { VALID_THEMES, FONT_MODES, THEME_TOKENS } = require('./themeRegistry');

function formatWarnings(warnings, label) {
  return `Warnings for ${label}:\n` + warnings.map(w => `  • ${w}`).join('\n') + '\n';
}

function formatValidationErrors(errors, label) {
  return `Validation failed for ${label}:\n` + errors.map(e => `  • ${e}`).join('\n');
}

// Every top-level key validateCommonHeader knows, muddled-only ones included. Each
// validator adds its own and warns about the rest (warnUnknownKeys).
const HEADER_KEYS = ['kind', 'title', 'author', 'date', 'instructions', 'theme', 'themeTokens', 'hashed', 'format', 'boardHash'];

// Validates the header fields common to every puzzle kind: the object itself,
// `kind`, `title`, and optional `instructions`. Pushes user-readable messages
// to `errors`. Returns false when the puzzle is not a usable object (the
// caller should bail), true otherwise. Tool-specific fields (e.g.
// snake-charmer's `loops`/`shape`) are validated separately by each tool.
// `hashed:` is only valid in muddled format (requires top-level `boardHash:`);
// in source puzzles, use `varietypack build --muddle` instead.
function validateCommonHeader(puzzle, kind, errors) {
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
  if (puzzle.theme !== undefined && !VALID_THEMES.includes(puzzle.theme)) {
    errors.push(`"theme" must be one of: ${VALID_THEMES.join(', ')}, got: ${JSON.stringify(puzzle.theme)}`);
  }
  if (puzzle.themeTokens !== undefined) {
    const t = puzzle.themeTokens;
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      errors.push('"themeTokens" must be a map of token names to values');
    } else {
      for (const [name, value] of Object.entries(t)) {
        if (!THEME_TOKENS.includes(name)) {
          errors.push(`"themeTokens" has unknown token "${name}" (see docs/AUTHORING.md for the list)`);
        } else if (!isSafeTokenValue(value)) {
          errors.push(`"themeTokens.${name}" has an unsafe value`);
        }
      }
    }
  }
  return true;
}

// A themeTokens value is interpolated into the page's CSS, so it must not be able to end
// its declaration, open a comment or string that outlives it, or fetch anything: no
// `;{}<>@\[]`, no `/*`, balanced quotes and parentheses, and no url()/image() style
// functions.
function isSafeTokenValue(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) return false;
  if (!/^[^;{}<>@\\[\]]*$/.test(value) || value.includes('/*')) return false;
  if (/(url|image-set|image|src)\s*\(/i.test(value)) return false;
  // Walk the value: inside a quoted string only its own closing quote matters (so
  // "Georgia's" is fine); outside one, parentheses must nest and close.
  let depth = 0, open = null;
  for (const ch of value) {
    if (open) { if (ch === open) open = null; continue; }
    if (ch === '"' || ch === "'") open = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0 && open === null;
}

/**
 * An origin such as "https://hunt.example.com": http(s), no path, no trailing slash, and
 * written the way a browser serializes it (lowercase, no default port). The string ships
 * as written, so it is checked rather than silently rewritten; a value that has an
 * origin is told what to write instead. → an error message, or null.
 */
function validateEmbedOrigin(origin) {
  const msg = `embedOrigin must be an origin like https://example.com, got ${JSON.stringify(origin)}`;
  let url;
  try { url = new URL(origin); } catch { return msg; }
  if (!/^https?:$/.test(url.protocol)) return msg;
  if (url.origin !== origin) return `${msg} (did you mean ${url.origin}?)`;
  return null;
}

// The build options every tool takes, as error messages: the --theme, --font and
// --embed-origin flags arrive here unchecked (parseCliArgs allowlists no values), and
// they are options, not YAML fields, so no tool's validator sees them. A tool's own flag
// (Snake Charmer's --shape) is its validator's to check.
function validateBuildOptions({ theme, font, embedOrigin }) {
  const errors = [];
  if (theme !== undefined && !VALID_THEMES.includes(theme)) {
    errors.push(`--theme must be one of: ${VALID_THEMES.join(', ')}, got ${JSON.stringify(theme)}`);
  }
  if (font !== undefined && !FONT_MODES.includes(font)) {
    errors.push(`--font must be ${FONT_MODES.map(m => JSON.stringify(m)).join(' or ')}, got ${JSON.stringify(font)}`);
  }
  const originProblem = embedOrigin !== undefined ? validateEmbedOrigin(embedOrigin) : null;
  if (originProblem) errors.push(originProblem);
  return errors;
}

module.exports = {
  HEADER_KEYS, formatWarnings, formatValidationErrors, validateCommonHeader, validateEmbedOrigin,
  validateBuildOptions,
};
