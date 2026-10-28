'use strict';

// Driving letter input: prefer `page.locator('#hidden-input').fill('A')` — it fires the
// `input` event the engines listen to directly. `page.keyboard.type()` works in the
// common case but breaks after a native <dialog> interaction, where focus-restoration
// timing interferes with CDP key injection.

// Enters one cell's content. A multi-letter cell is composed: Enter to open, one fill()
// per letter, Enter to commit, then an explicit ArrowRight to advance the cursor —
// committing a multi-letter cell does not itself advance it (see
// docs/CROSS_TOOL_SPEC.md → "Enter / Rebus button") — which keeps board-filling loops
// that iterate REBUS_CELLS in traversal order working. A single-letter cell is just
// typed, which advances on its own via the typing auto-advance.
//
// ArrowRight matches the typing auto-advance exactly in Snake Charmer (it's the ring's
// own advanceCell) and Spiral (it's nextInDir in the current direction). In Marching
// Bands, ArrowRight is spatial rather than the mode-aware nextCell the auto-advance
// uses — the two agree everywhere except across a row/band boundary, so this only
// holds while composing cells stay off that boundary.
async function typeCell(page, cell) {
  if (cell.length > 1) {
    await page.keyboard.press('Enter');
    for (const ch of cell) await page.locator('#hidden-input').fill(ch);
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
  } else {
    await page.locator('#hidden-input').fill(cell);
  }
}

// { id, letter } pairs for every open Crushword cell, id matching the engine's
// 1-indexed row-major SVG cell id (r*cols+c+1 = flat letters[] index + 1). A Crushword
// board has no uniform typing order (some cells belong to only one direction), so it is
// filled cell by cell by id.
function cellLetterPairs(letters) {
  const pairs = [];
  letters.forEach((letter, i) => { if (letter !== null) pairs.push({ id: i + 1, letter }); });
  return pairs;
}

// Clicks Crushword cell `id`, types `letter` (each character through toTyped), and
// commits with Enter: a cell short of maxCellLetters stays composing until something
// commits it, which the last cell of a solve needs.
async function fillCrushwordCell(page, id, letter, toTyped = ch => ch.toUpperCase()) {
  await page.locator(`#cell-${id}`).click();
  for (const ch of letter) await page.locator('#hidden-input').fill(toTyped(ch));
  await page.keyboard.press('Enter');
}

// Fills every Crushword cell: with `letters` (a hashed page ships none, so its caller
// supplies them), or else the page's own PUZZLE_DATA.letters.
async function solveCrushwordBoard(page, { letters, toTyped } = {}) {
  const board = letters || await page.evaluate(() => window.PUZZLE_DATA.letters);
  for (const { id, letter } of cellLetterPairs(board)) await fillCrushwordCell(page, id, letter, toTyped);
}

// A single-letter, keyboard-driven board solve: reads PUZZLE_DATA.letters (nulls
// filtered out, for Marching Bands' center cell) and presses each as a named key, from
// whatever cell is active, so the caller places the cursor first. With `wrong`, presses
// that letter in every cell instead, filling the board wrong. For the ring tools and
// Marching Bands, whose plain fixtures carry no multi-letter cells: no typeCell()
// rebus-composing machinery needed.
async function solveRingBoard(page, { wrong } = {}) {
  const letters = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const l of letters) await page.keyboard.press(`Key${(wrong || l).toUpperCase()}`);
}

module.exports = { typeCell, cellLetterPairs, fillCrushwordCell, solveCrushwordBoard, solveRingBoard };
