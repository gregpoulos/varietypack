import { useEffect } from 'preact/hooks';
import cw from '../../model/kinds/crushword.js';
import { fieldValue } from '../../model/doc.js';

const [rowsField, colsField] = cw.sizeFields;
const T = 10;   // thumbnail cell size

// An outline of the grid, one rect per cell: blocks dark, and cells a resize would add
// tinted.
export function CrushwordThumb({ rows, cols, blocks, fresh }) {
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const cls = blocks && blocks[i] ? 't-blk' : fresh && fresh[i] ? 't-new' : 't-cell';
      rects.push(<rect key={i} class={cls} x={c * T} y={r * T} width={T} height={T} />);
    }
  }
  return <svg viewBox={`-1 -1 ${cols * T + 2} ${rows * T + 2}`} class="thumb" aria-hidden="true">{rects}</svg>;
}

// The New puzzle size prompt's preview: the empty grid the typed size makes.
export function CrushwordSizePreview({ values, setExtra }) {
  useEffect(() => { setExtra({}); }, []);
  const rows = fieldValue(rowsField, values.rows);
  const cols = fieldValue(colsField, values.cols);
  if (rows === null || cols === null) {
    return <p id="size-summary" class="hint">Rows and columns must be whole numbers from {rowsField.min} to {rowsField.max}.</p>;
  }
  return (
    <>
      <CrushwordThumb rows={rows} cols={cols} />
      <p id="size-summary">{rows} × {cols}: {rows * cols} open cells. Make the block pattern next, with #.</p>
    </>
  );
}
