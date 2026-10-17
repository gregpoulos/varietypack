import geometry from './gridGeometry.js';

const { CELL, GUTTER, cellOrigin, cellCenter, svgSize } = geometry;
const fmt = (n) => n.toFixed(2);

// The shared 2-D board, free of anything kind-specific (Marching Bands and Crushword both
// use it). Layers, bottom to top: cells (and blocks), `underlay`, circles / letters /
// numbers / row numbers, the caret, `overlay`.
//   rows, cols
//   cellAt(r, c) → { content, block, number?, circled, shade?: 0|1, active?, over? }
//     over: draw the letters in the error color (a cell holding more than the puzzle allows)
//   caret: { r, c }, composing
//   textCaret?: the cursor's position within the caret cell's content, drawn as a thin line
//     between letters. Omitted, nothing is drawn (Marching Bands omits it).
//   onBlockClick?(r, c): makes blocks clickable (Crushword puts the caret on one so # can open it)
//   rowNumbers?: draw 1..rows in the left margin, as the Marching Bands solver does
//   underlay?, overlay?: VNodes (the editor's loops and click targets)
//   onCellClick(r, c)
export function GridBoard({ rows, cols, cellAt, caret, composing, textCaret, rowNumbers = false, underlay, overlay, onCellClick, onBlockClick }) {
  const { width, height } = svgSize(rows, cols);
  const cells = [];
  const marks = [];
  const texts = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cellAt(r, c);
      const { x, y } = cellOrigin(r, c);
      if (cell.block) {
        cells.push(<rect key={`${r},${c}`} class={'grid-block' + (onBlockClick ? ' pick' : '')} data-r={r} data-c={c} x={x} y={y} width={CELL} height={CELL}
          onClick={onBlockClick ? () => onBlockClick(r, c) : undefined} />);
        continue;
      }
      const cls = 'grid-cell' + (cell.shade !== undefined ? ` shade-${cell.shade}` : '') + (cell.active ? ' active' : '');
      cells.push(<rect key={`${r},${c}`} class={cls} data-r={r} data-c={c} x={x} y={y} width={CELL} height={CELL}
        onClick={() => onCellClick(r, c)} />);
      const mid = cellCenter(r, c);
      if (cell.circled) marks.push(<circle key={`o${r},${c}`} class="grid-circle" cx={fmt(mid.x)} cy={fmt(mid.y)} r={CELL / 2 - 5} />);
      if (cell.content) {
        const size = cell.content.length >= 3 ? 8.5 : cell.content.length === 2 ? 12 : 19;
        texts.push(<text key={`l${r},${c}`} class={'grid-letter' + (cell.over ? ' over' : '')} data-r={r} data-c={c} x={fmt(mid.x)} y={fmt(mid.y + 1)} font-size={size}>{cell.content.toUpperCase()}</text>);
      }
      if (cell.number !== undefined) {
        texts.push(<text key={`n${r},${c}`} class="grid-num" x={x + 3} y={y + 10}>{cell.number}</text>);
      }
    }
  }
  if (rowNumbers) {
    for (let r = 0; r < rows; r++) {
      texts.push(<text key={`rn${r}`} class="grid-rownum" x={GUTTER - 7} y={cellCenter(r, 0).y}>{r + 1}</text>);
    }
  }
  const at = cellOrigin(caret.r, caret.c);
  const here = cellAt(caret.r, caret.c);
  let bar = null;
  if (textCaret !== undefined && !here.block) {
    // Letters are centerd, so the cursor sits (pos - n/2) letter-widths from the middle.
    const n = here.content.length;
    const size = n >= 3 ? 8.5 : n === 2 ? 12 : 19;
    const mid = cellCenter(caret.r, caret.c);
    const x = mid.x + (textCaret - n / 2) * size * 0.62;
    bar = <line class="text-caret" x1={fmt(x)} x2={fmt(x)} y1={fmt(mid.y - size * 0.62)} y2={fmt(mid.y + size * 0.62)} />;
  }
  return (
    <svg id="board-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${rows} by ${cols} grid`}>
      <g>{cells}</g>
      <g>{underlay}</g>
      <g>{marks}</g>
      <g>{texts}</g>
      <rect class={'grid-caret' + (composing ? ' composing' : '') + (here.block ? ' on-block' : '')} x={at.x + 1.5} y={at.y + 1.5} width={CELL - 3} height={CELL - 3} />
      {bar}
      <g>{overlay}</g>
    </svg>
  );
}
