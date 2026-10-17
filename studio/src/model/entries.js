'use strict';
// An entry's metadata, and its conversion to and from a YAML entry. The cells an entry
// covers live in the kind's model, not here.
const { parseAnswerCells } = require('../../../shared/build/cells');
const { STYLE_SCOPES } = require('../../../shared/build/validateEntry');
const { formatAnswer, sameCells } = require('./cells');

function newEntry(id) {
  return { id, clue: '', extra: {}, extraStyles: {} };
}

// → { id, clue, displayAnswer?, extra, extraStyles }
//   displayAnswer: the author's text when it differs from the canonical form ('LIE TO')
//   extra:         keys other than clue/answer/styles, in source order
//   extraStyles:   styles that aren't cell-scoped (those become model.circles)
function entryFromYaml(yamlEntry, id, cells) {
  const entry = { id, clue: yamlEntry.clue ?? '', extra: {}, extraStyles: {} };
  if (yamlEntry.answer !== formatAnswer(cells)) entry.displayAnswer = yamlEntry.answer;
  for (const [k, v] of Object.entries(yamlEntry)) {
    if (k !== 'clue' && k !== 'answer' && k !== 'styles') entry.extra[k] = v;
  }
  for (const [name, v] of Object.entries(yamlEntry.styles || {})) {
    if (STYLE_SCOPES[name] !== 'cell') entry.extraStyles[name] = v;
  }
  return entry;
}

// → { clue, answer, styles?, ...extra }. Throws if a cell is empty (callers check
// completeness first).
function entryToYaml(entry, cells, circled, readsBackward) {
  const canonical = formatAnswer(cells);
  const shown = entry.displayAnswer;
  const answer = shown !== undefined && sameCells(parseAnswerCells(shown).cells || [], cells, readsBackward) ? shown : canonical;
  const out = { clue: entry.clue, answer };
  const styles = {};
  if (circled.length) styles.circle = [...circled].sort((a, b) => a - b);
  Object.assign(styles, entry.extraStyles);
  if (Object.keys(styles).length) out.styles = styles;
  return Object.assign(out, entry.extra);
}

// The positions p within an entry whose cell key is circled, ascending.
function circledPositions(cellKeys, circles) {
  const set = new Set(circles);
  const out = [];
  cellKeys.forEach((key, p) => { if (set.has(key)) out.push(p); });
  return out;
}

module.exports = { newEntry, entryFromYaml, entryToYaml, circledPositions };
