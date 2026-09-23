'use strict';

const { validateCommonHeader, entryCells } = require('../../shared/build/builderUtils');
const { validateEntry, checkMuddledGuard } = require('../../shared/build/validateEntry');
const { deriveSlots, isSymmetric, isConnected, uncluedCells } = require('./grid');

// Deliberately a LETTER count, not a cell count. The "no very short entries"
// convention is about the word being too slight to be interesting, and in a rebus
// grid that tracks letters: a 2-cell entry like "[AIL]S" is the 4-letter word AILS
// and is perfectly sound, while a 2-letter entry is thin however it is bracketed.
// Counting cells here warns on eight legitimate entries in crushword.yaml alone;
// the "minimum-length convention counts letters" test pins that. Every other length
// in this file, and `entryLength` generally, is a cell count — this warning is the
// deliberate exception.
const MIN_ANSWER_LETTERS = 3;

// The hasher applies the same default, so an unset field and an explicit
// `maxCellLetters: 3` validate and render identically.
const DEFAULT_MAX_CELL_LETTERS = 3;

function validateGridShape(puzzle, errors) {
  const grid = puzzle.grid;
  if (!Array.isArray(grid) || grid.length === 0) {
    errors.push('"grid" must be a non-empty array of strings');
    return null;
  }
  const width = typeof grid[0] === 'string' ? grid[0].length : 0;
  if (width === 0) {
    errors.push('"grid[0]" must be a non-empty string');
    return null;
  }
  let ok = true;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (typeof row !== 'string' || row.length !== width) {
      errors.push(`"grid[${r}]" must be a string of length ${width} (row 0's length)`);
      ok = false;
      continue;
    }
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '.' && row[c] !== '#') {
        errors.push(`"grid[${r}][${c}]" must be "." or "#", got "${row[c]}"`);
        ok = false;
      }
    }
  }
  if (!ok) return null;
  if (!grid.some(row => row.includes('.'))) {
    errors.push('"grid" must contain at least one open (".") cell');
    return null;
  }
  return grid;
}

// Entry keys must be the canonical decimal spelling of their number. The grid's
// derived numbering is numeric and every lookup below is `entriesObj[slot.num]`, so
// a key like "04" or "5.0" — which coerces to the same number but is a different
// property — would satisfy a Number()-keyed set comparison and then never be looked
// up by any slot, leaving its entry wholly unvalidated.
function checkNumberingMatch(slots, entriesObj, label, errors) {
  const keys = Object.keys(entriesObj);
  const malformed = keys.filter(k => String(Number(k)) !== k);
  if (malformed.length > 0) {
    errors.push(
      `"${label}" has a malformed clue key (${malformed.map(k => `"${k}"`).join(', ')}) ` +
      '— use plain integers (e.g. 6, not "06")'
    );
    return false;
  }
  const derived = new Set(slots.map(s => s.num));
  const given = new Set(keys.map(Number));
  const missing = [...derived].filter(n => !given.has(n)).sort((a, b) => a - b);
  const extra = [...given].filter(n => !derived.has(n)).sort((a, b) => a - b);
  if (missing.length === 0 && extra.length === 0) return true;
  const parts = [];
  if (missing.length > 0) parts.push(`missing: ${missing.join(', ')}`);
  if (extra.length > 0) parts.push(`unexpected: ${extra.join(', ')}`);
  errors.push(`"${label}" does not match the grid's derived numbering (${parts.join('; ')})`);
  return false;
}

/**
 * Validates every slot's entry and captures its parsed cells in a single pass.
 *
 * `cells` is null for a muddled entry (which has no plaintext) and for an entry
 * that failed validation. validateEntry returns a non-null length for a source
 * entry only after parseAnswerCells has succeeded on it, so that return value is
 * what makes the entryCells call here safe: entryCells throws on a non-string
 * answer, which an entry written `answer:` with no value in YAML supplies as null.
 *
 * @returns {Array<{slot: object, cells: string[]|null}>} One item per slot, in slot order.
 */
function collectSlotEntries(slots, entriesObj, label, isMuddled, errors, warnings) {
  return slots.map(slot => {
    const entry = entriesObj[slot.num];
    const len = validateEntry(entry, `${label}[${slot.num}]`, isMuddled, errors, warnings);
    if (len !== null && len !== slot.len) {
      errors.push(`${label}[${slot.num}]: grid slot has ${slot.len} cells but answer has ${len}`);
    }
    return { slot, cells: !isMuddled && len !== null ? entryCells(entry) : null };
  });
}

function validate(puzzle) {
  const errors = [];
  const warnings = [];

  if (!validateCommonHeader(puzzle, 'crushword', errors, warnings)) return { errors, warnings };

  const grid = validateGridShape(puzzle, errors);
  if (!grid) return { errors, warnings };

  let maxCellLetters = DEFAULT_MAX_CELL_LETTERS;
  if (puzzle.maxCellLetters !== undefined) {
    if (!Number.isInteger(puzzle.maxCellLetters) || puzzle.maxCellLetters < 1) {
      errors.push(`"maxCellLetters" must be a positive integer, got: ${JSON.stringify(puzzle.maxCellLetters)}`);
    } else {
      maxCellLetters = puzzle.maxCellLetters;
    }
  }

  if (!puzzle.across || typeof puzzle.across !== 'object' || Array.isArray(puzzle.across)) {
    errors.push('"across" must be an object keyed by clue number');
    return { errors, warnings };
  }
  if (!puzzle.down || typeof puzzle.down !== 'object' || Array.isArray(puzzle.down)) {
    errors.push('"down" must be an object keyed by clue number');
    return { errors, warnings };
  }

  const { acrossSlots, downSlots } = deriveSlots(grid);

  if (acrossSlots.length === 0 || downSlots.length === 0) {
    errors.push('"grid" produces no across/down entries — check the block pattern');
    return { errors, warnings };
  }

  // Not just a connectivity warning: nothing downstream can represent such a cell.
  // The hasher has no content to hash for it and the engine has no entry to
  // highlight when it is clicked, so a build would be unsolvable and crash on click.
  for (const { r, c } of uncluedCells(grid)) {
    errors.push(`Cell (${r + 1}, ${c + 1}) is open but belongs to no across or down entry — block it or open a neighbor`);
  }

  const acrossNumsOk = checkNumberingMatch(acrossSlots, puzzle.across, 'across', errors);
  const downNumsOk   = checkNumberingMatch(downSlots, puzzle.down, 'down', errors);
  if (!acrossNumsOk || !downNumsOk) return { errors, warnings };

  const isMuddled = puzzle.boardHash !== undefined;
  const allEntries = [...Object.values(puzzle.across), ...Object.values(puzzle.down)];
  if (checkMuddledGuard(allEntries, isMuddled, errors, warnings)) return { errors, warnings };

  const acrossEntries = collectSlotEntries(acrossSlots, puzzle.across, 'across', isMuddled, errors, warnings);
  const downEntries   = collectSlotEntries(downSlots, puzzle.down, 'down', isMuddled, errors, warnings);

  if (!isMuddled) {
    for (const [label, collected] of [['across', acrossEntries], ['down', downEntries]]) {
      for (const { slot, cells } of collected) {
        if (!cells) continue;
        for (const cell of cells) {
          if (cell.length > maxCellLetters) {
            errors.push(`${label}[${slot.num}]: cell "${cell}" has ${cell.length} letters, exceeding maxCellLetters (${maxCellLetters})`);
          }
        }
        const letterCount = cells.join('').length;
        if (letterCount < MIN_ANSWER_LETTERS) {
          warnings.push(`${label}[${slot.num}]: answer is only ${letterCount} letters long (convention is ${MIN_ANSWER_LETTERS}+)`);
        }
      }
    }
  }

  if (!isSymmetric(grid)) {
    warnings.push('grid does not have 180-degree rotational symmetry');
  }
  if (!isConnected(grid)) {
    warnings.push("grid's open cells are not fully connected (contains a disconnected region)");
  }

  if (!isMuddled && errors.length === 0) {
    // Zero errors implies every slot's entry validated, so every `cells` is non-null.
    const board = {};
    for (const { slot, cells } of acrossEntries) {
      cells.forEach((cell, i) => {
        const key = `${slot.r},${slot.c + i}`;
        (board[key] = board[key] || {}).across = { num: slot.num, cell };
      });
    }
    for (const { slot, cells } of downEntries) {
      cells.forEach((cell, i) => {
        const key = `${slot.r + i},${slot.c}`;
        (board[key] = board[key] || {}).down = { num: slot.num, cell };
      });
    }
    for (const [key, val] of Object.entries(board)) {
      const [r, c] = key.split(',').map(Number);
      if (val.across && val.down && val.across.cell !== val.down.cell) {
        errors.push(
          `Cell (${r + 1}, ${c + 1}): across[${val.across.num}] has "${val.across.cell}" but down[${val.down.num}] has "${val.down.cell}" — they disagree`
        );
      }
      if (val.across && !val.down) {
        warnings.push(`across[${val.across.num}]: cell (${r + 1}, ${c + 1}) has no crossing down entry`);
      }
      if (val.down && !val.across) {
        warnings.push(`down[${val.down.num}]: cell (${r + 1}, ${c + 1}) has no crossing across entry`);
      }
    }
  }

  return { errors, warnings };
}

module.exports = { validate, DEFAULT_MAX_CELL_LETTERS };
