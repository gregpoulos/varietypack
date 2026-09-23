'use strict';

// Enters one cell's content. A multi-letter cell is composed: Enter to open, one fill()
// per letter, Enter to commit, then an explicit ArrowRight to advance the cursor —
// committing a multi-letter cell does not itself advance it (see
// docs/CROSS_TOOL_SPEC.md → "Enter / Rebus button") — which keeps board-filling loops
// that iterate REBUS_CELLS in traversal order working. A single-letter cell is just
// typed, which advances on its own via the typing auto-advance. fill() is used rather
// than keyboard.type() per the repo's e2e note — it fires the input event the engines
// listen to directly.
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

module.exports = { typeCell };
