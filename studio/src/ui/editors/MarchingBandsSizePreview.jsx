import { useEffect } from 'preact/hooks';
import mb from '../../model/kinds/marching-bands.js';
import { fieldValue } from '../../model/doc.js';

const [field] = mb.sizeFields;
const T = 10;   // thumbnail cell size

// An N × N outline: bands shaded alternately, and the center a block when N is odd.
export function GridThumb({ n }) {
  const rects = [];
  const center = n % 2 ? ((n - 1) / 2) * n + (n - 1) / 2 : -1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const band = Math.min(r, c, n - 1 - r, n - 1 - c);
      rects.push(<rect key={r * n + c} class={r * n + c === center ? 't-blk' : `t-b${band % 2}`} x={c * T} y={r * T} width={T} height={T} />);
    }
  }
  return <svg viewBox={`-1 -1 ${n * T + 2} ${n * T + 2}`} class="thumb" aria-hidden="true">{rects}</svg>;
}

export function sizeSummary(n) {
  const bands = Math.floor(n / 2);
  const letters = n * n - (n % 2);
  return `${n} × ${n}: ${n} rows and ${bands} band${bands === 1 ? '' : 's'}, ${letters} letters.${n % 2 ? ' Odd sizes black out the center square.' : ''}`;
}

// The New puzzle size prompt's preview: the grid the typed size makes, and what it holds.
export function MarchingBandsSizePreview({ values, setExtra }) {
  useEffect(() => { setExtra({}); }, []);
  const n = fieldValue(field, values.size);
  if (n === null) return <p class="hint">Choose a whole number from {field.min} to {field.max}.</p>;
  return (
    <>
      <GridThumb n={n} />
      <p id="size-summary">{sizeSummary(n)}</p>
    </>
  );
}
