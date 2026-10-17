import { useMemo } from 'preact/hooks';
import * as layout from '../../../../spiral/src/layout.mjs';
import { entryAt } from '../../model/starts.js';

const PAD = 18;
const fmt = (n) => n.toFixed(3);

// The real spiral, drawn from the solver's own geometry (spiral/src/layout.mjs), so the
// editor and the puzzle page can't draw it differently. A change in the cell count
// redraws everything.
//   props: { cells, caret, composing, activeCut, inStarts, outStarts, circles (Set),
//            onCellClick(i), onGapClick(g) }
// Gap g sits between cells g-1 and g. An inward break there is drawn on the outer half of
// the boundary and an outward one on the inner half.
export function SpiralBoard({ cells, caret, composing, activeCut, inStarts, outStarts, circles, onCellClick, onGapClick }) {
  const T = cells.length;
  const geo = useMemo(() => {
    const opts = layout.geometryFor(T);
    return { opts, geom: layout.computeCells(T, opts), sizes: layout.sizesFor(opts) };
  }, [T]);
  const { opts, geom, sizes } = geo;
  const starts = { inward: inStarts, outward: outStarts };
  const readPos = (cut, i) => (cut === 'inward' ? i : T - 1 - i);
  const entryOfCell = (cut, i) => entryAt(starts[cut], readPos(cut, i));
  const activeEntry = entryOfCell(activeCut, Math.min(caret, T - 1));
  const vb = opts.R_MAX + PAD;
  const breakWidth = fmt(sizes.band * 0.11);
  const hitWidth = fmt(sizes.band * 0.3);

  const outGaps = new Set(outStarts.filter(s => s > 0).map(s => T - s));
  const inGaps = new Set(inStarts.filter(s => s > 0));

  const cellPaths = [];
  for (let i = T - 1; i >= 0; i--) {   // innermost first, so strokes layer correctly
    const j = entryOfCell(activeCut, i);
    const cls = `sp-cell shade-${j % 2}` + (j === activeEntry ? ' active' : '') + (i === caret ? ' caret' : '');
    cellPaths.push(<path key={i} class={cls} data-index={i} d={layout.cellPath(geom[i])} onClick={() => onCellClick(i)} />);
  }

  const marks = [];
  for (const i of circles) {
    if (i >= T) continue;
    const [x, y] = layout.circleCenter(geom[i]);
    marks.push(<circle key={`c${i}`} class="sp-circle" cx={fmt(x)} cy={fmt(y)} r={fmt(sizes.circleRadius * 0.84)} />);
  }
  const hits = [];
  for (let g = 1; g < T; g++) {
    const b = layout.boundaryPoints(geom[g - 1]);
    if (inGaps.has(g)) {
      marks.push(<line key={`i${g}`} class={'sp-break in' + (activeCut === 'inward' ? '' : ' weak')} data-gap={g}
        x1={fmt(b.mid[0])} y1={fmt(b.mid[1])} x2={fmt(b.outer[0])} y2={fmt(b.outer[1])} stroke-width={breakWidth} />);
    }
    if (outGaps.has(g)) {
      marks.push(<line key={`o${g}`} class={'sp-break out' + (activeCut === 'outward' ? '' : ' weak')} data-gap={g}
        x1={fmt(b.inner[0])} y1={fmt(b.inner[1])} x2={fmt(b.mid[0])} y2={fmt(b.mid[1])} stroke-width={breakWidth} />);
    }
    hits.push(
      <line key={`h${g}`} class="sp-gap" data-gap={g}
        x1={fmt(b.inner[0])} y1={fmt(b.inner[1])} x2={fmt(b.outer[0])} y2={fmt(b.outer[1])} stroke-width={hitWidth}
        onClick={() => onGapClick(g)}>
        <title>Split or join between cells {g} and {g + 1}</title>
      </line>,
    );
  }

  const texts = [];
  for (let i = 0; i < T; i++) {
    const [nx, ny] = layout.numberPosition(geom[i]);
    texts.push(<text key={`n${i}`} class="sp-num" x={fmt(nx)} y={fmt(ny)} font-size={fmt(sizes.numSize)}>{i + 1}</text>);
    const v = cells[i];
    if (v) {
      const [tx, ty] = layout.letterCenter(geom[i]);
      const size = sizes.letterSize * (v.length >= 3 ? 0.5 : v.length === 2 ? 0.7 : 1);
      texts.push(<text key={`l${i}`} class="sp-ltr" data-index={i} x={fmt(tx)} y={fmt(ty)} font-size={fmt(size)}>{v.toUpperCase()}</text>);
    }
  }

  return (
    <svg id="board-svg" viewBox={`${-vb} ${-vb} ${2 * vb} ${2 * vb}`} role="img" aria-label={`Spiral board with ${T} cells`}>
      <path class="sp-curl" d={layout.curlPath(geom[T - 1])} />
      <g>{cellPaths}</g>
      <g>{marks}</g>
      <g>{texts}</g>
      {caret < T && <path class={'sp-caret' + (composing ? ' composing' : '')} d={layout.cellPath(geom[caret])} />}
      <g>{hits}</g>
    </svg>
  );
}
