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

// The most characters each field takes in the studio, so the Puzzle box can't be pushed
// into an unreadable shape. A file already past a limit opens as it is; the limit only
// stops further typing.
const HEADER_LIMITS = { title: 60, author: 40, date: 20 };

// The title's font size in px: full size up to FULL_UNTIL characters, then shrinking in a
// straight line to the floor at the title limit, so a long title wraps to a few lines of
// the side column rather than many.
const TITLE_MAX_PX = 21;
const TITLE_MIN_PX = 16;
const FULL_UNTIL = 20;
function titleSizePx(length) {
  if (length <= FULL_UNTIL) return TITLE_MAX_PX;
  const t = Math.min(1, (length - FULL_UNTIL) / (HEADER_LIMITS.title - FULL_UNTIL));
  return Math.round((TITLE_MAX_PX - t * (TITLE_MAX_PX - TITLE_MIN_PX)) * 10) / 10;
}

module.exports = { headerFromYaml, headerToYaml, setHeaderField, HEADER_LIMITS, TITLE_MAX_PX, TITLE_MIN_PX, titleSizePx };
