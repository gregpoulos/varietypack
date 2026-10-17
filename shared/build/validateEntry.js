'use strict';

const { parseAnswerCells } = require('./cells');

// What each style decorates. A 'cell' style belongs to a board cell, so every entry
// covering a styled cell must list it (checkCellStyles below).
const STYLE_SCOPES = { circle: 'cell' };
const KNOWN_STYLES = new Set(Object.keys(STYLE_SCOPES));

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

// The keys an entry may have; warnUnknownKeys warns about any other.
const ENTRY_KEYS = ['clue', 'answer', 'length', 'styles'];

/**
 * Validates a single puzzle entry (source or muddled) and pushes messages to
 * `errors`/`warnings`.
 *
 * @param {*}        entry      - The entry object to validate.
 * @param {string}   label      - Human-readable label, e.g. "entries[2]" or "inward[0]".
 * @param {boolean}  isMuddled  - True when the puzzle has a top-level boardHash.
 * @param {string[]} errors     - Array to push error messages into.
 * @param {string[]} warnings   - Array to push warning messages into.
 * @returns {{length: number, cells: string[]|null}|null} The entry's cell count and
 *   its normalized per-cell strings (null `cells` for a muddled entry, which has no
 *   plaintext), or null when the entry is invalid and should be excluded from any
 *   cell-count totals.
 */
function validateEntry(entry, label, isMuddled, errors, warnings) {
  if (!entry || typeof entry !== 'object') {
    errors.push(`${label} must be an object`);
    return null;
  }
  warnUnknownKeys(entry, ENTRY_KEYS, label, warnings);
  if (!entry.clue || typeof entry.clue !== 'string' || !entry.clue.trim()) {
    errors.push(`${label}.clue must be a non-empty string`);
  }

  if (isMuddled) {
    if (entry.answer !== undefined) {
      errors.push(`${label}: muddled entry must use length:, not answer:`);
      return null;
    }
    if (!Number.isInteger(entry.length) || entry.length < 1) {
      errors.push(`${label}: muddled entry must have an integer length >= 1`);
      return null;
    }
    validateEntryStyles(entry, label, entry.length, errors, warnings);
    return { length: entry.length, cells: null };
  }

  // Source entry
  if (!entry.answer || typeof entry.answer !== 'string' || !entry.answer.trim()) {
    errors.push(`${label}.answer must be a non-empty string`);
    return null;
  }
  const { cells, error } = parseAnswerCells(entry.answer);
  if (error) {
    errors.push(`${label}.answer: ${error}`);
    return null;
  }
  if (!cells.length) {
    errors.push(`${label}.answer must contain at least one letter`);
    return null;
  }
  // A group this long is nearly always a typo or an unclosed bracket. Individual
  // tools may impose stricter limits as errors.
  for (const cell of cells) {
    if (cell.length >= 5) {
      warnings.push(`${label}.answer: bracketed group "${cell}" has ${cell.length} letters — is that intended?`);
    }
  }
  validateEntryStyles(entry, label, cells.length, errors, warnings);
  return { length: cells.length, cells };
}

/**
 * Integrity guard shared by all validators: detects muddled entries
 * (length: without answer:) that appear without a top-level boardHash.
 * Pushes an error and returns true when the inconsistency is found,
 * so callers can bail early.
 *
 * @param {Array}    allEntries - Flat array of all entry objects in the puzzle.
 * @param {boolean}  isMuddled  - True when puzzle.boardHash !== undefined.
 * @param {string[]} errors     - Array to push error messages into.
 * @returns {boolean} True when the inconsistency was detected (bail).
 */
function hasLengthWithoutHash(allEntries, isMuddled, errors) {
  const hasLengthEntries = allEntries.some(
    e => e && typeof e === 'object' && e.answer === undefined && typeof e.length === 'number'
  );
  if (hasLengthEntries && !isMuddled) {
    errors.push("Muddled entries (length: without answer:) require a top-level boardHash. Use 'varietypack muddle' to produce this format.");
    return true;
  }
  return false;
}

/**
 * Shared muddled-guard sequence run by all four validators right after they
 * compute `isMuddled`: bail (via hasLengthWithoutHash) when muddled-looking
 * entries appear without a top-level boardHash, otherwise push the
 * skip-notice warning when the puzzle is muddled.
 *
 * @param {Array}    allEntries - Flat array of all entry objects in the puzzle.
 * @param {boolean}  isMuddled  - True when puzzle.boardHash !== undefined.
 * @param {string[]} errors     - Array to push error messages into.
 * @param {string[]} warnings   - Array to push warning messages into.
 * @returns {boolean} True when the caller should bail (return { errors, warnings }).
 */
function checkMuddledGuard(allEntries, isMuddled, errors, warnings) {
  if (hasLengthWithoutHash(allEntries, isMuddled, errors)) return true;
  if (isMuddled) {
    warnings.push('note: entries are muddled; answer validation skipped');
  }
  return false;
}

/**
 * Cell-scoped styles (STYLE_SCOPES value 'cell'; today only `circle`) describe a board
 * cell, not an entry, so every entry covering a styled cell must list that cell's
 * position. Callers run this only once every entry parsed and the board's structure is
 * valid, so each entry's covered cells are right; they don't wait for unrelated errors.
 * Out-of-range positions are validateEntryStyles' job and are skipped here.
 *
 * @param {Array<{label: string, entry: object, cells: Array<string|number>}>} coverage
 *   One item per entry, in reporting order: its validator label (e.g. "inward[2]"),
 *   the entry, and the ids of the board cells it covers, so cells[i] is the cell at
 *   entry position i. Ids are opaque Map keys.
 * @param {string[]} errors
 */
function checkCellStyles(coverage, errors) {
  for (const [style, scope] of Object.entries(STYLE_SCOPES)) {
    if (scope !== 'cell') continue;
    const firstMark = new Map();   // cellId → { label, pos } of the first entry styling it
    const marked = new Set();      // `${coverageIndex}:${pos}` of every styled position
    coverage.forEach(({ label, entry, cells }, i) => {
      const positions = entry && entry.styles && Array.isArray(entry.styles[style]) ? entry.styles[style] : [];
      for (const pos of positions) {
        if (!Number.isInteger(pos) || pos < 0 || pos >= cells.length) continue;
        marked.add(`${i}:${pos}`);
        if (!firstMark.has(cells[pos])) firstMark.set(cells[pos], { label, pos });
      }
    });
    coverage.forEach(({ label, cells }, i) => {
      cells.forEach((cellId, pos) => {
        const first = firstMark.get(cellId);
        if (first && !marked.has(`${i}:${pos}`)) {
          errors.push(
            `${label}.styles.${style} is missing position ${pos}: that cell is styled by ` +
            `${first.label} position ${first.pos}, and a ${style} must be listed on every entry that covers its cell`
          );
        }
      });
    });
  }
}

/**
 * Warns about each key of `obj` not in `known`. Such a key is nearly always a typo
 * (`style:` for `styles:`) that would otherwise be silently ignored. A warning, not an
 * error, since a file may carry keys of its own, which the studio keeps on a round trip.
 *
 * @param {object}   obj      - A YAML mapping (anything else is ignored).
 * @param {string[]} known    - The keys it may have.
 * @param {string}   label    - Where it is, e.g. "inward[0]"; '' for the top level.
 * @param {string[]} warnings - Array to push warning messages into.
 */
function warnUnknownKeys(obj, known, label, warnings) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) warnings.push(`${label ? `${label}: ` : ''}unknown key "${key}" (is it a typo?)`);
  }
}

/**
 * Whether two entries' spellings of one cell agree. A cell holds one string, as the
 * entry reading it forward writes it; an entry reading the cell against that direction
 * (Spiral's outward pass, a Marching Bands band's bottom edge) may spell it backward
 * instead, so [CAT] and [TAC] name the same cell there. Only an exact reversal counts.
 *
 * @param {string}  written       - The cell as this entry spells it.
 * @param {string}  cell          - The cell as the forward entry spells it.
 * @param {boolean} readsBackward - Whether this entry reads the cell against that
 *   direction.
 */
function sameCell(written, cell, readsBackward) {
  return written === cell || (readsBackward && written === [...cell].reverse().join(''));
}

module.exports = { STYLE_SCOPES, validateEntry, validateEntryStyles, hasLengthWithoutHash, checkMuddledGuard, checkCellStyles, sameCell, warnUnknownKeys };
