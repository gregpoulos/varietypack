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

// Opens the help menu and clicks one of its rows (`#check-btn`, ...). A real user's path:
// the rows are in a closed panel until #help-btn opens it.
async function clickHelpRow(page, rowId) {
  await page.locator('#help-btn').click();
  await page.locator('#help-panel ' + rowId).click();
}

// Clicks a studio gap line (Snake Charmer's `.rgap`, Marching Bands' `.split-hit`). These
// lines are axis-aligned, so their boxes have zero width and Playwright calls them
// hidden: the click must be forced, which also skips its wait for the target to stop
// moving. Do that wait here. Right after a clue fill the board pane is still settling,
// and a forced click lands where the line was (about 1 run in 8 in Firefox).
async function clickGapLine(line) {
  await line.scrollIntoViewIfNeeded();
  await line.evaluate(el => new Promise(resolve => {
    let prev = '', still = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const at = r.x + ',' + r.y;
      still = at === prev ? still + 1 : 0;
      prev = at;
      if (still >= 3) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  }));
  await line.click({ force: true });
}

// Rewrites the puzzle's auto-save on the next load: `edit` mutates the saved payload, and
// an init script writes it back as the reloaded document starts. It has to be that late:
// leaving the page saves again (the timer's visibility flush), which would overwrite an
// edit made before the reload. The init script only writes, never reads, because a read
// at document start can see an empty store: Chromium flushes the leaving page's writes
// asynchronously (the save went missing in about 1 run in 5 when this read it there).
async function rewriteSaveOnNextLoad(page, edit) {
  const [key, saved] = await page.evaluate(() => {
    const k = Object.keys(localStorage)[0];
    return [k, JSON.parse(localStorage.getItem(k))];
  });
  edit(saved);
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(saved)]);
}

module.exports = { rewriteSaveOnNextLoad, clickGapLine, clickHelpRow, typeCell, cellLetterPairs, fillCrushwordCell, solveCrushwordBoard, solveRingBoard };
