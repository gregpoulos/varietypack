'use strict';
// The Crushword editor's keyboard and click rules as pure functions of (model, ui), so
// node:test covers them. The rules themselves are the puzzle page's
// (crushword/src/typing.mjs); this adds the editor's own: blocks, the symmetry lock, and
// what a click does.
//
//   ui: { r, c, dir: 'A'|'D', pos (the cursor within the caret cell's content), col (the sticky column for ↑/↓) }
//   every function returns { handled, calls: [{ name, args, typing? }], ui, message? }:
//   the commands to run (typing: true joins the current undo run), the ui after them, and a
//   line to show. `apply` folds `calls` into a model.
const cw = require('./kinds/crushword');
const { nextCell, prevCell, arrowTarget, typeAt, deleteBefore, stepInOrder } = require('../../../crushword/src/typing.mjs');

const BLOCK_MESSAGE = 'This cell is a block. Press # to open it.';
const LAST_OPEN_MESSAGE = 'A puzzle needs at least one open cell.';
const NAME = { A: 'across', D: 'down' };
const OTHER = { A: 'D', D: 'A' };

const idOf = (m, r, c) => r * m.cols + c + 1;
const rcOf = (m, id) => ({ r: Math.floor((id - 1) / m.cols), c: (id - 1) % m.cols });
const content = (m, id) => m.cells[id - 1];
const blockAt = (m, r, c) => m.blocks[r * m.cols + c];
const entryAt = (maps, id, dir) => maps[NAME[dir]].at[id];

// The ui on cell `id`, flipping the direction when the cell has no entry in it but has
// one the other way (an open cell has one of the two, or the validator would reject the
// grid).
function land(model, maps, ui, id, { pos, keepCol = false } = {}) {
  const { r, c } = rcOf(model, id);
  const p = pos !== undefined ? pos : content(model, id).length;
  let dir = ui.dir;
  if (!entryAt(maps, id, dir) && entryAt(maps, id, OTHER[dir])) dir = OTHER[dir];
  return { r, c, dir, pos: p, col: keepCol ? ui.col : p };
}

const done = (ui, calls = [], extra = {}) => ({ handled: true, calls, ui, ...extra });

function apply(model, result) {
  return result.calls.reduce((m, call) => cw.commands[call.name](m, ...call.args), model);
}

function typeLetter(model, ui, ch) {
  if (blockAt(model, ui.r, ui.c)) return done(ui, [], { message: BLOCK_MESSAGE });
  const id = idOf(model, ui.r, ui.c);
  const cap = cw.capOf(model);
  const res = typeAt(content(model, id), ui.pos, ch, cap);
  const maps = cw.entryMaps(model);
  let next = { ...ui, pos: res.pos, col: res.pos };
  if (res.pos >= cap && entryAt(maps, id, ui.dir)) next = land(model, maps, next, nextCell(maps, id, NAME[ui.dir]), { pos: 0 });
  return done(next, [{ name: 'setCell', args: [ui.r, ui.c, res.content], typing: true }]);
}

// The first open cell after (r, c) in reading order, wrapping; (r, c) itself if none
// other.
function nextOpen(model, r, c) {
  const total = model.rows * model.cols;
  const from = r * model.cols + c;
  for (let k = 1; k <= total; k++) {
    const i = (from + k) % total;
    if (!model.blocks[i]) return i + 1;
  }
  return from + 1;
}

function pressKey(model, ui, e, symmetric) {
  const maps = cw.entryMaps(model);
  const isBlock = blockAt(model, ui.r, ui.c);
  const id = idOf(model, ui.r, ui.c);
  const dirName = NAME[ui.dir];
  const here = isBlock ? null : entryAt(maps, id, ui.dir);
  const text = isBlock ? '' : content(model, id);

  switch (e.key) {
    case ' ': {
      if (isBlock) return done(ui, [], { message: BLOCK_MESSAGE });
      const calls = ui.pos < text.length ? [{ name: 'setCell', args: [ui.r, ui.c, text.slice(0, ui.pos)], typing: true }] : [];
      return done(here ? land(model, maps, ui, nextCell(maps, id, dirName), { pos: 0 }) : ui, calls);
    }
    case 'Enter':
      if (!here) return done(ui);
      return done(land(model, maps, ui, e.shiftKey ? prevCell(maps, id, dirName) : nextCell(maps, id, dirName)));
    case 'Backspace': {
      let cur = ui;
      if (here && ui.pos === 0) cur = land(model, maps, ui, prevCell(maps, id, dirName));
      const calls = [];
      if (cur.pos > 0 && !blockAt(model, cur.r, cur.c)) {
        const r = deleteBefore(content(model, idOf(model, cur.r, cur.c)), cur.pos, e.altKey);
        calls.push({ name: 'setCell', args: [cur.r, cur.c, r.content], typing: true });
        cur = { ...cur, pos: r.pos, col: r.pos };
      }
      return done(cur, calls);
    }
    case 'ArrowLeft':
    case 'ArrowRight': {
      const dc = e.key === 'ArrowRight' ? 1 : -1;
      const edge = dc > 0 ? text.length : 0;
      if (ui.pos !== edge) {
        const pos = e.altKey ? edge : ui.pos + dc;
        return done({ ...ui, pos, col: pos });
      }
      const t = arrowTarget(gridOf(model), id, 0, dc);
      if (t === null) return done(ui);
      const landAtEnd = (dc < 0) !== !!e.altKey;
      return done(land(model, maps, { ...ui, dir: 'A' }, t, { pos: landAtEnd ? content(model, t).length : 0 }));
    }
    case 'ArrowUp':
    case 'ArrowDown': {
      const t = arrowTarget(gridOf(model), id, e.key === 'ArrowDown' ? 1 : -1, 0);
      if (t === null) return { handled: false, calls: [], ui };
      return done(land(model, maps, { ...ui, dir: 'D' }, t, { pos: Math.min(ui.col, content(model, t).length), keepCol: true }));
    }
    case '.':
      return done(!isBlock && entryAt(maps, id, OTHER[ui.dir]) ? { ...ui, dir: OTHER[ui.dir] } : ui);
    case 'Tab': {
      const d = here ? ui.dir : isBlock ? null : OTHER[ui.dir];
      const info = d && entryAt(maps, id, d);
      if (!info) return done(ui);
      const { order, cellsOf } = maps[NAME[d]];
      const num = stepInOrder(order, info.num, e.shiftKey ? -1 : 1);
      return done(land(model, maps, { ...ui, dir: d }, cellsOf[num][0]));
    }
    case '#': {
      const after = cw.commands.toggleBlock(model, ui.r, ui.c, symmetric);
      if (after === model) return done(ui, [], { message: LAST_OPEN_MESSAGE });
      const calls = [{ name: 'toggleBlock', args: [ui.r, ui.c, symmetric] }];
      const maps2 = cw.entryMaps(after);
      const target = blockAt(after, ui.r, ui.c) ? nextOpen(after, ui.r, ui.c) : id;
      return done(land(after, maps2, ui, target, { pos: 0 }), calls);
    }
    default:
      return { handled: false, calls: [], ui };
  }
}

function gridOf(model) { return cw.gridStrings(model); }

// A click on (r, c): an open cell takes the caret to the end of its content; the caret's
// own cell, once the board has focus, switches direction; a block takes the caret so #
// can open it.
function clickCell(model, ui, r, c, focused) {
  if (blockAt(model, r, c)) return done({ ...ui, r, c, pos: 0, col: 0 });
  const maps = cw.entryMaps(model);
  const id = idOf(model, r, c);
  if (r === ui.r && c === ui.c && focused) {
    return done(entryAt(maps, id, OTHER[ui.dir]) ? { ...ui, dir: OTHER[ui.dir] } : ui);
  }
  return done(land(model, maps, ui, id));
}

// The ui for a slot picked in the clue list: its first cell, in its direction.
function selectSlot(model, key) {
  const slot = cw.slots(model).find(s => s.key === key);
  if (!slot) return null;
  return land(model, cw.entryMaps(model), { r: 0, c: 0, dir: slot.dir, pos: 0, col: 0 }, idOf(model, slot.r, slot.c));
}

// The first open cell, Across.
function initialUi(model) {
  const i = model.blocks.findIndex(b => !b);
  const id = (i < 0 ? 0 : i) + 1;
  return land(model, cw.entryMaps(model), { r: 0, c: 0, dir: 'A', pos: 0, col: 0 }, id, { pos: 0 });
}

// The ui made valid for the model again after something else changed it (a resize, an
// undo): on the grid, with a direction the cell has, and a cursor inside its content.
function repair(model, ui) {
  const r = Math.min(ui.r, model.rows - 1), c = Math.min(ui.c, model.cols - 1);
  const id = idOf(model, r, c);
  const pos = blockAt(model, r, c) ? 0 : Math.min(ui.pos, content(model, id).length);
  return land(model, cw.entryMaps(model), ui, id, { pos, keepCol: true });
}

module.exports = { BLOCK_MESSAGE, LAST_OPEN_MESSAGE, apply, typeLetter, pressKey, clickCell, selectSlot, initialUi, repair };
