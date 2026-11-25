// The crossings panel's model, kept pure so node:test covers it. It reads the engine's
// entry maps (typing.mjs's buildEntryMaps) rather than re-deriving slots, so the panel
// can't disagree with the grid about where entries start or end.
//
// An ES module like typing.mjs: the engine imports it and Node tests `require` it.

// The active entry through `cell` in `dir` ('across' | 'down'), and for each of its
// cells the entry crossing it the other way. `rows` follows the entry's cell order;
// `crossing` is { num, cells } or null where no entry crosses (possible in Crushword).
// The result depends only on the entry, not on which of its cells is passed.
function crossingRows(maps, cell, dir) {
  const here = maps[dir];
  const other = maps[dir === 'across' ? 'down' : 'across'];
  const num = here.at[cell].num;
  const cells = here.cellsOf[num];
  const rows = cells.map(c => {
    const x = other.at[c];
    return { cell: c, crossing: x ? { num: x.num, cells: other.cellsOf[x.num] } : null };
  });
  return { num, cells, rows };
}

export { crossingRows };
