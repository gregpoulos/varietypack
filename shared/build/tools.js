'use strict';
// The one list of puzzle tools, and each tool's build hooks. Build-path code (the studio
// bundles it): no Node API. A tool is required on first use, never at load, so
// `validate` doesn't pull in all four builders.

// kind → a function returning that tool's HOOKS
const TOOL_HOOKS = {
  'snake-charmer':  () => require('../../snake-charmer/src/builder').HOOKS,
  'spiral':         () => require('../../spiral/src/builder').HOOKS,
  'marching-bands': () => require('../../marching-bands/src/builder').HOOKS,
  'crushword':      () => require('../../crushword/src/builder').HOOKS,
};

const KINDS = Object.keys(TOOL_HOOKS);

// Own-property check, not `TOOL_HOOKS[kind]`: every plain object inherits `toString`,
// `constructor`, … from Object.prototype, so a truthiness lookup would accept
// `kind: toString` and crash further down.
function isKnownKind(kind) {
  return typeof kind === 'string' && Object.hasOwn(TOOL_HOOKS, kind);
}

// The { validateFn, prepareFn, buildHtmlFn } that `kind`'s tool hands to
// buildFromObject. Throws on a kind that isKnownKind rejects.
function hooksFor(kind) {
  if (!isKnownKind(kind)) throw new Error(`unknown kind "${kind}"`);
  return TOOL_HOOKS[kind]();
}

// Why `puzzle` can't be built, as the message every entry point (CLI and studio) shows:
// no usable `kind`, or one that names no tool. null when the kind is known.
function kindError(puzzle) {
  const kind = puzzle && puzzle.kind;
  if (typeof kind !== 'string') return 'missing or invalid "kind" field';
  if (!isKnownKind(kind)) return `unknown kind "${kind}"`;
  return null;
}

module.exports = { KINDS, isKnownKind, hooksFor, kindError };
