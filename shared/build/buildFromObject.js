'use strict';

const { formatValidationErrors, validateBuildOptions } = require('./validation');

/**
 * Build from an already-parsed puzzle: validate → hashed → prepare → buildHtmlFn.
 * Reads no puzzle file, writes nothing, prints nothing; the hooks do read the
 * tool's template and asset files (in the studio, from its in-memory fs).
 * The CLI wraps it as runBuildPuzzle (shared/cli/runBuildPuzzle.js); the studio calls it
 * directly.
 *
 * @param {object} rawPuzzle   Parsed source or muddled YAML object.
 * @param {object} [options]   { muddle?, theme?, font?, embedOrigin?, ...tool options }. `minify` is
 *                             ignored here; the CLI's runBuildPuzzle applies it.
 * @param {{validateFn, prepareFn, buildHtmlFn}} hooks
 *   validateFn:  (puzzle, options) => { errors, warnings }. `options` is for a check that
 *     depends on a flag (Snake Charmer's --shape); `varietypack validate` passes none.
 *   prepareFn:   (rawPuzzle) => prepared
 *   buildHtmlFn: (prepared, rawPuzzle, options, notes) => html. rawPuzzle is the
 *     pre-prepare YAML object, for a tool that needs a raw field unavailable on
 *     `prepared` (Snake Charmer's explicit `shape`). `notes` is an array the hook may
 *     push complete lines into (no trailing newline).
 * @param {{label?: string}} [ctx]  How messages name the puzzle; default 'puzzle'.
 * @returns {{ html: string, title: string, warnings: string[], notes: string[] }}
 * @throws {Error} on validation errors, the puzzle's (validateFn) then its options'
 *   (validateBuildOptions): message = formatValidationErrors(errors, label), with
 *   err.errors and err.warnings attached. Errors thrown by buildHtmlFn propagate with
 *   err.warnings and err.notes attached.
 */
function buildFromObject(rawPuzzle, options = {}, { validateFn, prepareFn, buildHtmlFn }, { label = 'puzzle' } = {}) {
  const { errors: puzzleErrors, warnings } = validateFn(rawPuzzle, options);
  const errors = [...puzzleErrors, ...validateBuildOptions(options)];
  if (errors.length > 0) {
    const err = new Error(formatValidationErrors(errors, label));
    err.errors = errors;
    err.warnings = warnings;
    throw err;
  }

  const hashed   = !!(options.muddle || rawPuzzle.boardHash !== undefined);
  const prepared = prepareFn({ ...rawPuzzle, hashed });

  // Theme precedence: options.theme (the --theme flag), then the YAML's theme:, then
  // composeThemeCss's own default.
  const effective = { ...options, theme: options.theme ?? rawPuzzle.theme, themeTokens: rawPuzzle.themeTokens };

  const notes = [];
  if (options.embedOrigin !== undefined) {
    prepared.embedOrigin = options.embedOrigin;
    // A plain page ships its letters, so its "solution" proves nothing (spec §10).
    if (!hashed) notes.push('Note: embedOrigin is set on a plain build; the page ships its answers, so a posted solution proves nothing. Build with --muddle for verifiable solves.');
  }
  let html;
  try {
    html = buildHtmlFn(prepared, rawPuzzle, effective, notes);
  } catch (err) {
    err.warnings = warnings;
    err.notes = notes;
    throw err;
  }
  return { html, title: prepared.title, warnings, notes };
}

module.exports = { buildFromObject };
