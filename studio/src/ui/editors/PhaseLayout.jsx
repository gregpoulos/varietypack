// The two columns every structured editor lays out in, for the Board and Clues phases.
// The board column comes first in both and is one stable element, so the board and
// #board-input never remount on a phase switch and keep the caret and focus. It holds
// the tools row, then the bezel (the board and its key hints, which describe how to work
// the board), then in Board the checks, which describe the board. Only the tools row,
// the checks and the side column's body change: `tools`, `checks` and `side` in Board,
// `clueTools` and `clues` in Clues; `settings` (the Grid… button) follows the Board tools
// row, and `fillClues` (Fill empty clues) the Clues one. `header` (the Puzzle box) heads
// the side column in both. The board column doesn't scroll (the board shrinks to fit);
// the side column scrolls on its own (studio.css, "the phase layout").
export function PhaseLayout({ phase, toggle, tools, clueTools, board, keys, checks, header, side, clues, settings, fillClues }) {
  return (
    <div class={`phase-layout phase-${phase}`}>
      <div class="phase-board-col">
        <div class="board-tools">{toggle}{phase === 'board' ? <>{tools}{settings}</> : <>{clueTools}{fillClues}</>}</div>
        <div class="board-bezel">
          {board}
          {keys}
        </div>
        {phase === 'board' && checks}
      </div>
      <div class="phase-side-col">{header}{phase === 'board' ? side : clues}</div>
    </div>
  );
}
