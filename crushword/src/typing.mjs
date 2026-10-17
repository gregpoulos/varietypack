// Crushword's pure typing and navigation rules: the cell<->entry maps, stepping between
// cells and entries, arrow-key targets, and the two edits a keystroke can make. They live
// here, not inside engine.js's init(), so the studio's editor types with exactly the
// rules the puzzle page does (the studio can't bundle engine.js: loading it starts a
// puzzle page).
//
// An ES module like grid.mjs: the engine imports it, and Node tests and the studio
// `require` it. Ids are 1-based, row-major over the WHOLE grid including blocks
// (row*cols + col + 1), matching the SVG element id convention (docs/CROSS_TOOL_SPEC.md
// -> SVG element IDs).
import { deriveSlots, slotCells } from './grid.mjs';

// Derives the cell<->entry mapping from the grid's block pattern via grid.mjs's
// deriveSlots, the same numbering the validator uses, so entry boundaries can never drift
// from it. Returns { across, down }, each { at, cellsOf, order }: `at[id]` is the entry
// through cell id as { num, pos, len } (undefined if none), `cellsOf[num]` that entry's
// cell ids, and `order` the entry numbers in traversal order.
function buildEntryMaps(grid) {
  const cols = grid[0].length;
  const idOf = (r, c) => r * cols + c + 1;
  const { acrossSlots, downSlots } = deriveSlots(grid);

  function mapDir(slots, dir) {
    const at = {}, cellsOf = {};
    for (const slot of slots) {
      cellsOf[slot.num] = slotCells(slot, dir).map(({ r, c }) => idOf(r, c));
      cellsOf[slot.num].forEach((id, i) => { at[id] = { num: slot.num, pos: i, len: slot.len }; });
    }
    return { at, cellsOf, order: slots.map(s => s.num) };
  }

  return { across: mapDir(acrossSlots, 'across'), down: mapDir(downSlots, 'down') };
}

// The entry number `step` (±1) places from num in traversal order, wrapping. Used for Tab
// navigation and typing-driven auto-advance across an entry boundary.
function stepInOrder(order, num, step) {
  return order[(order.indexOf(num) + step + order.length) % order.length];
}

// The cell after / before n along its entry in `dir` ('across' | 'down'); past an entry's
// end, the next entry's first cell / the previous entry's last cell, wrapping. `maps` is
// buildEntryMaps' result.
function nextCell(maps, n, dir) {
  const { at, cellsOf, order } = maps[dir];
  const info = at[n];
  if (info.pos < info.len - 1) return cellsOf[info.num][info.pos + 1];
  return cellsOf[stepInOrder(order, info.num, 1)][0];
}

function prevCell(maps, n, dir) {
  const { at, cellsOf, order } = maps[dir];
  const info = at[n];
  if (info.pos > 0) return cellsOf[info.num][info.pos - 1];
  const prevCells = cellsOf[stepInOrder(order, info.num, -1)];
  return prevCells[prevCells.length - 1];
}

// The cell an arrow key (dr, dc) from n lands on. Skips over block runs, matching a
// solver's expectation that arrow keys jump to the next open square rather than stopping
// dead at a block; null past the grid's edge.
function arrowTarget(grid, n, dr, dc) {
  const rows = grid.length, cols = grid[0].length;
  let r = Math.floor((n - 1) / cols) + dr, c = (n - 1) % cols + dc;
  while (r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] !== '.') { r += dr; c += dc; }
  if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
  return r * cols + c + 1;
}

// The hidden input's per-character rule: insert at `pos` while the cell has room (`cap`
// is maxCellLetters), and overwrite once it's full: the letter at `pos`, or at the cell's
// very end the last one, so retyping a full one-letter cell replaces it. The caller moves
// on when the returned `pos` reaches `cap`.
function typeAt(content, pos, ch, cap) {
  if (content.length < cap) return { content: content.slice(0, pos) + ch + content.slice(pos), pos: pos + 1 };
  const at = Math.min(pos, content.length - 1);
  return { content: content.slice(0, at) + ch + content.slice(at + 1), pos: at + 1 };
}

// Backspace's edit: the letter before `pos`, or with `toStart` (Alt) everything before
// it. The caller still steps back a cell first when pos is 0.
function deleteBefore(content, pos, toStart) {
  const cut = toStart ? 0 : pos - 1;
  return { content: content.slice(0, cut) + content.slice(pos), pos: cut };
}

export { buildEntryMaps, stepInOrder, nextCell, prevCell, arrowTarget, typeAt, deleteBefore };
