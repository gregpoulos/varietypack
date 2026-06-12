'use strict';

const normalize = require('../normalize');
const { validateEntryStyles } = require('./builderUtils');

/**
 * Validates a single puzzle entry (source or muddled) and pushes messages to
 * `errors`/`warnings`.
 *
 * @param {*}        entry      - The entry object to validate.
 * @param {string}   label      - Human-readable label, e.g. "entries[2]" or "inward[0]".
 * @param {boolean}  isMuddled  - True when the puzzle has a top-level boardHash.
 * @param {string[]} errors     - Array to push error messages into.
 * @param {string[]} warnings   - Array to push warning messages into.
 * @returns {number|null} The entry's cell count on success, or null when the
 *   entry is invalid and should be excluded from any cell-count totals.
 */
function validateEntry(entry, label, isMuddled, errors, warnings) {
  if (!entry || typeof entry !== 'object') {
    errors.push(`${label} must be an object`);
    return null;
  }
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
    return entry.length;
  }

  // Source entry
  if (!entry.answer || typeof entry.answer !== 'string' || !entry.answer.trim()) {
    errors.push(`${label}.answer must be a non-empty string`);
    return null;
  }
  const norm = normalize(entry.answer);
  if (!norm.length) {
    errors.push(`${label}.answer must contain at least one letter`);
    return null;
  }
  validateEntryStyles(entry, label, norm.length, errors, warnings);
  return norm.length;
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

module.exports = { validateEntry, hasLengthWithoutHash };
