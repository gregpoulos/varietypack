'use strict';
// The header fields every puzzle shares, and the top-level keys the studio doesn't know
// (kept so an import-then-export doesn't drop them).

const OPTIONAL = ['author', 'date', 'theme', 'themeTokens', 'instructions'];
const KNOWN = ['kind', 'title', ...OPTIONAL];

// → { title, author?, date?, theme?, instructions?, extra }
function headerFromYaml(puzzle, kindKeys) {
  const header = { title: puzzle.title ?? '', extra: {} };
  for (const key of OPTIONAL) {
    if (puzzle[key] !== undefined) header[key] = puzzle[key];
  }
  for (const [k, v] of Object.entries(puzzle)) {
    if (!KNOWN.includes(k) && !kindKeys.includes(k)) header.extra[k] = v;
  }
  return header;
}

function headerToYaml(header) {
  const out = { title: header.title };
  for (const key of OPTIONAL) {
    if (header[key] !== undefined) out[key] = header[key];
  }
  return Object.assign(out, header.extra);
}

// '' (or an empty map) deletes an optional field; the title is kept even when ''.
function setHeaderField(header, field, value) {
  const next = { ...header };
  const empty = value === '' || (value && typeof value === 'object' && !Object.keys(value).length);
  if (empty && OPTIONAL.includes(field)) delete next[field];
  else next[field] = value;
  return next;
}

module.exports = { headerFromYaml, headerToYaml, setHeaderField };
