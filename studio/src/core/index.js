'use strict';
// The studio's API over the repo's build path. Runs in the browser (bundled by
// studio/build.js) and in Node (studio tests). Must not require anything Node-only.
const yaml = require('js-yaml');
const { buildFromObject } = require('../../../shared/build/buildFromObject');
const { validateEmbedOrigin } = require('../../../shared/build/validation');
const { muddlePuzzle, MUDDLED_DUMP_OPTIONS } = require('../../../shared/build/muddleUtils');

const HOOKS = {
  'snake-charmer':  require('../../../snake-charmer/src/builder').HOOKS,
  'spiral':         require('../../../spiral/src/builder').HOOKS,
  'marching-bands': require('../../../marching-bands/src/builder').HOOKS,
  'crushword':      require('../../../crushword/src/builder').HOOKS,
};
const KINDS = Object.keys(HOOKS);

const { SHAPES, SHAPE_NAMES, autoShape } = require('../../../snake-charmer/src/layout');

/**
 * Shapes whose geometry exists for a ring of N cells (spec §6 layer 3, used ahead of
 * time).
 */
function feasibleShapes(N) {
  return SHAPE_NAMES.filter(name => { try { SHAPES[name].computeRing(N); return true; } catch { return false; } });
}

// Same messages as shared/cli/toolRegistry.js's kind check.
function kindError(puzzle) {
  const kind = puzzle && puzzle.kind;
  if (typeof kind !== 'string') return 'missing or invalid "kind" field';
  if (!Object.hasOwn(HOOKS, kind)) return `unknown kind "${kind}"`;
  return null;
}

function parseYaml(text) {
  const puzzle = yaml.load(text);
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    throw new Error('the YAML does not contain a puzzle object');
  }
  return puzzle;
}

function dumpYaml(obj) { return yaml.dump(obj, MUDDLED_DUMP_OPTIONS); }

function validate(puzzle) {
  const err = kindError(puzzle);
  if (err) return { errors: [err], warnings: [] };
  return HOOKS[puzzle.kind].validateFn(puzzle);
}

function build(puzzle, options = {}) {
  const err = kindError(puzzle);
  if (err) throw new Error(err);
  return buildFromObject(puzzle, options, HOOKS[puzzle.kind]);
}

function muddle(puzzle) {
  const err = kindError(puzzle);
  if (err) return { errors: [err], warnings: [], muddled: null, text: null };
  const r = muddlePuzzle(puzzle, HOOKS[puzzle.kind]);
  return { ...r, text: r.muddled ? dumpYaml(r.muddled) : null };
}

/**
 * Validate and build, collecting everything; never throws.
 * @returns {{ kind: string|null, muddled: boolean, theme: string|null,
 *             title: string|null, html: string|null, errors: string[],
 *             warnings: string[], notes: string[] }}
 */
function checkPuzzle(puzzle, options = {}) {
  const base = {
    kind: puzzle && typeof puzzle.kind === 'string' ? puzzle.kind : null,
    muddled: !!(puzzle && puzzle.boardHash !== undefined),
    theme: puzzle && typeof puzzle.theme === 'string' ? puzzle.theme : null,  // for the theme shown above the preview and in Export
    title: null, html: null, errors: [], warnings: [], notes: [],
  };
  const err = kindError(puzzle);
  if (err) return { ...base, errors: [err] };
  try {
    const r = build(puzzle, options);
    return { ...base, title: r.title, html: r.html, warnings: r.warnings, notes: r.notes };
  } catch (e) {
    return { ...base, errors: e.errors || [e.message], warnings: e.warnings || [], notes: e.notes || [] };
  }
}

/** checkPuzzle for YAML text; a parse failure is reported, not thrown. */
function checkText(text, options = {}) {
  let puzzle;
  try { puzzle = parseYaml(text); }
  catch (e) {
    return { parseError: e.message, kind: null, muddled: false, theme: null, title: null,
             html: null, errors: [], warnings: [], notes: [] };
  }
  return { parseError: null, ...checkPuzzle(puzzle, options) };
}

module.exports = { validateEmbedOrigin, KINDS, parseYaml, dumpYaml, validate, build, muddle, checkPuzzle, checkText, feasibleShapes, autoShape, SHAPE_NAMES };
