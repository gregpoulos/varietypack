'use strict';
// A studio document, and the pure transitions on it. No Date.now(), no Math.random(), no
// DOM: callers pass in `now` and `id`.
//
//   { v: 1, id, kind: string|null, mode: 'yaml'|'muddled'|'structured',
//     yaml: string|null,         // 'yaml': the author's text; 'muddled': the file as opened
//     muddled: object|null,      // 'muddled': the parsed file (theme may be edited)
//     model: object,             // 'structured' only: the kind's cells-first model
//     options: { font: 'embed'|'link', hashedPreview: boolean, phoneWidth: boolean },
//     ui?: { symmetric?: boolean },   // editor settings; absent means the defaults
//     updatedAt: number }
const core = require('../core');
const { STRUCTURED } = require('./kinds');
const { StructureError } = require('./errors');

const OPTION_KEYS = ['font', 'hashedPreview', 'phoneWidth'];
// Editor settings kept with the doc but outside the model and the undo history
// (Crushword's symmetry lock).
const UI_KEYS = ['symmetric'];

function defaultOptions() {
  return { font: 'embed', hashedPreview: false, phoneWidth: false };
}

// With `yaml`, a YAML-mode document. Without it, a structured one: `kind` must have a
// structured editor and `size` maps each of its sizeFields to a number.
function newDoc({ id, now, kind, yaml, size }) {
  const base = { v: 1, id, kind: kind ?? null, muddled: null, options: defaultOptions(), updatedAt: now };
  if (typeof yaml === 'string') return { ...base, mode: 'yaml', yaml };
  if (!STRUCTURED[kind]) throw new Error(`"${kind}" has no structured editor`);
  if (!size) throw new Error('a structured document needs a size');
  return { ...base, mode: 'structured', yaml: null, model: STRUCTURED[kind].newModel(size) };
}

// Checks the text a user typed into the New puzzle size prompt against a kind's
// sizeFields. → { size } (numbers, merged with `extra`) or { error }.
// The number a size field accepts from typed text (a whole number within its range, and a
// multiple of its step from the minimum), or null. The one home for the rule: parseSize
// reports it, and size previews use it to know whether to draw.
function fieldValue(field, text) {
  const t = String(text ?? '').trim();
  const value = /^\d+$/.test(t) ? Number(t) : NaN;
  const stepOk = !field.step || (value - field.min) % field.step === 0;
  return value >= field.min && value <= field.max && stepOk ? value : null;
}

function parseSize(kindModule, raw, extra = {}) {
  const size = {};
  for (const f of kindModule.sizeFields) {
    const value = fieldValue(f, raw[f.name]);
    if (value === null) {
      const steps = f.step ? `, in steps of ${f.step}` : '';
      return { error: `${f.label} must be a whole number from ${f.min} to ${f.max}${steps}.` };
    }
    size[f.name] = value;
  }
  return { size: { ...size, ...extra } };
}

function importNotice(warnings) {
  if (!warnings.length) return null;
  return `Imported with ${warnings.length} change${warnings.length === 1 ? '' : 's'}: ${warnings.join(' · ')}`;
}

function structuredFrom(base, puzzle) {
  const { model, warnings } = STRUCTURED[puzzle.kind].fromYaml(puzzle);
  const { yaml, ...rest } = base;
  return { doc: { ...rest, kind: puzzle.kind, mode: 'structured', yaml: null, model }, notice: importNotice(warnings) };
}

// → { doc, notice }. A muddled file opens build-only; a source file for a kind with a
// structured editor opens there unless it can't be represented as cells (then YAML mode).
function openText(text, { id, now }) {
  let puzzle = null;
  try { puzzle = core.parseYaml(text); } catch { /* opens anyway; diagnostics show the parse error */ }
  const kind = puzzle && typeof puzzle.kind === 'string' ? puzzle.kind : null;
  const base = newDoc({ id, now, kind, yaml: text });
  if (puzzle && puzzle.boardHash !== undefined) {
    return { doc: { ...base, mode: 'muddled', muddled: puzzle }, notice: null };
  }
  if (puzzle && Object.hasOwn(STRUCTURED, kind)) {
    try {
      return structuredFrom(base, puzzle);
    } catch (err) {
      if (!(err instanceof StructureError)) throw err;
      return { doc: base, notice: `Opened as YAML: ${err.message}` };
    }
  }
  return { doc: base, notice: null };
}

function setYaml(doc, text, now) {
  return { ...doc, yaml: text, updatedAt: now };
}

function setOption(doc, key, value, now) {
  if (!OPTION_KEYS.includes(key)) throw new Error(`"${key}" is not a document option`);
  return { ...doc, options: { ...doc.options, [key]: value }, updatedAt: now };
}

function setUi(doc, key, value, now) {
  if (!UI_KEYS.includes(key)) throw new Error(`"${key}" is not an editor setting`);
  return { ...doc, ui: { ...doc.ui, [key]: value }, updatedAt: now };
}

function setMuddledTheme(doc, theme, now) {
  return { ...doc, muddled: { ...doc.muddled, theme }, updatedAt: now };
}

// The puzzle as YAML text; null for a structured document that isn't complete yet (it
// can't be expressed as puzzle YAML until every cell and clue is filled in).
function puzzleText(doc) {
  if (doc.mode === 'muddled') return core.dumpYaml(doc.muddled);
  if (doc.mode === 'structured') {
    const kind = STRUCTURED[doc.kind];
    return kind.completeness(doc.model).length ? null : core.dumpYaml(kind.toYaml(doc.model));
  }
  return doc.yaml;
}

// Structured → YAML mode. Refused while the puzzle is incomplete.
function toYamlMode(doc) {
  const text = puzzleText(doc);
  if (text === null) throw new Error('the puzzle is incomplete: finish the cells and clues first');
  const { model, ...rest } = doc;
  return { ...rest, mode: 'yaml', yaml: text };
}

// YAML → structured mode. Throws a parse error, or a StructureError when the file can't
// be represented as cells. → { doc, notice }
function toStructuredMode(doc) {
  const puzzle = core.parseYaml(doc.yaml);
  if (!Object.hasOwn(STRUCTURED, puzzle.kind)) throw new Error(`"${puzzle.kind}" has no structured editor`);
  return structuredFrom(doc, puzzle);
}

module.exports = {
  defaultOptions, newDoc, fieldValue, parseSize, openText, setYaml, setOption, setUi, setMuddledTheme,
  puzzleText, toYamlMode, toStructuredMode,
};
