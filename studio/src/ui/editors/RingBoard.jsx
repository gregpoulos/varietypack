import { useMemo } from 'preact/hooks';
import layout from '../../../../snake-charmer/src/layout.js';
import * as ringMod from '../../../../snake-charmer/src/template/shapes/ring.mjs';
import * as stadium from '../../../../snake-charmer/src/template/shapes/stadium.mjs';
import * as turn from '../../../../snake-charmer/src/template/shapes/turn.mjs';
import * as doubleTurn from '../../../../snake-charmer/src/template/shapes/double-turn.mjs';
import constants from '../../../../snake-charmer/src/ringConstants.js';
import { entryAt } from '../../model/starts.js';
import { SHAPE_LABEL } from './shapeLabels.js';

const { ringFor } = layout;
const { makeRingRenderer, arcSection } = ringMod;
const RENDERERS = {
  circle: stadium.getStadiumRenderer,
  stadium: stadium.getStadiumRenderer,
  turn: turn.getTurnRenderer,
  'double-turn': doubleTurn.getDoubleTurnRenderer,
};
const fmt = (n) => n.toFixed(3);

// A plain circle of N cells, for when no shape fits: the editing carries on, drawn
// simply.
function plainCircle(N) {
  const { W_CELL, H_CELL } = constants;
  const R = Math.max(N * W_CELL / (2 * Math.PI), H_CELL);
  const pad = 20;
  const c = R + H_CELL / 2 + pad;
  const band = { rOut: R + H_CELL / 2, rIn: R - H_CELL / 2, rc: R };
  return {
    name: null,
    ring: { svgWidth: 2 * c, svgHeight: 2 * c },
    renderer: makeRingRenderer([arcSection(N, c, c, band, -Math.PI / 2, 2 * Math.PI / N)]),
    fallback: true,
  };
}

// The ring to draw for N cells: the builder's own choice (layout.js's ringFor), or a
// plain circle when that shape's geometry doesn't exist for N. Exported for the size
// preview.
export function resolveRing(N, shape) {
  let chosen;
  try { chosen = ringFor(N, shape || undefined); } catch { return plainCircle(N); }
  return { name: chosen.shape, ring: chosen.ring, renderer: RENDERERS[chosen.shape](chosen.ring), fallback: false };
}

// The real ring, drawn with the solver's own shape renderers. Positions run 0..2N-1 over
// two laps; the active lap is the caret's. Cells are ring cells k = 0..N-1.
//   props: { ring, shape, caret, composing, starts, circles (Set), onCellClick(k), onGapClick(k) }
export function RingBoard({ ring: cells, shape, caret, composing, starts, circles, onCellClick, onGapClick }) {
  const N = cells.length;
  const R = useMemo(() => resolveRing(N, shape), [N, shape]);
  const rend = R.renderer;
  const lap = caret < N ? 1 : 2;
  const base = (lap - 1) * N;
  const entryAtPos = (p) => entryAt(starts, p);
  const caretEntry = entryAtPos(caret);
  const [cs, ce] = [starts[caretEntry], starts[caretEntry + 1] ?? 2 * N];
  const activeCells = new Set();
  for (let p = cs; p < ce; p++) activeCells.add(p % N);
  const startSet = new Set(starts);

  const paths = [];
  const letters = [];
  const marks = [];
  const hits = [];
  for (let k = 0; k < N; k++) {
    paths.push(
      <path key={k} class={`rc shade-${entryAtPos(base + k) % 2}` + (activeCells.has(k) ? ' active' : '')}
        data-k={k} d={rend.cellPath(k)} onClick={() => onCellClick(k)} />,
    );
    const v = cells[k];
    if (v) {
      const { tx, ty } = rend.letterCenter(k);
      const size = v.length >= 3 ? 7 : v.length === 2 ? 10 : 15;
      letters.push(<text key={`l${k}`} class="rl" data-k={k} x={fmt(tx)} y={fmt(ty)} font-size={size}>{v.toUpperCase()}</text>);
    }
    if (circles.has(k)) {
      const { tx, ty } = rend.letterCenter(k);
      marks.push(<circle key={`c${k}`} class="rcirc" cx={fmt(tx)} cy={fmt(ty)} r="15" />);
    }
    const e = rend.edgeAfter((k - 1 + N) % N);                   // the edge before cell k
    const mid = { x: (e.outer.x + e.inner.x) / 2, y: (e.outer.y + e.inner.y) / 2 };
    if (startSet.has(k)) {
      marks.push(<line key={`s1-${k}`} class={'rsplit c1' + (lap === 1 ? '' : ' weak')}
        x1={fmt(mid.x)} y1={fmt(mid.y)} x2={fmt(e.outer.x)} y2={fmt(e.outer.y)} />);
    }
    if (startSet.has(N + k)) {
      marks.push(<line key={`s2-${k}`} class={'rsplit c2' + (lap === 2 ? '' : ' weak')}
        x1={fmt(e.inner.x)} y1={fmt(e.inner.y)} x2={fmt(mid.x)} y2={fmt(mid.y)} />);
    }
    hits.push(
      <line key={`h${k}`} class="rgap" data-gap={k}
        x1={fmt(e.inner.x)} y1={fmt(e.inner.y)} x2={fmt(e.outer.x)} y2={fmt(e.outer.y)}
        onClick={() => onGapClick(k)}>
        <title>Split or join on lap {lap}, before this cell</title>
      </line>,
    );
  }

  // Entry numbers: one label per ring cell where any entry starts (1/2 when two share
  // it).
  const byCell = new Map();
  starts.forEach((s, j) => {
    const k = s % N;
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(j);
  });
  const labels = [...byCell].map(([k, js]) => {
    const { lx, ly } = rend.labelPos(k);
    const cls = js.length > 1 ? 'clash' : starts[js[0]] < N ? 'l1' : 'l2';
    return <text key={`n${k}`} class={`rnum ${cls}`} x={fmt(lx)} y={fmt(ly)}>{js.map(j => j + 1).join('/')}</text>;
  });

  return (
    <>
      {R.fallback && (
        <p id="board-note" class="board-note">
          {shape ? `The ${SHAPE_LABEL[shape] ?? shape} shape doesn’t fit` : 'No shape fits'} {N} cells per lap{N % 2 ? ' (every shape needs an even count)' : ''},
          so the ring is drawn as a plain circle until one does.
        </p>
      )}
      <svg id="board-svg" viewBox={`0 0 ${fmt(R.ring.svgWidth)} ${fmt(R.ring.svgHeight)}`} role="img" aria-label={`Ring of ${N} cells`}>
        <g>{paths}</g>
        <g>{marks}</g>
        <g>{letters}{labels}</g>
        <path class={'rcaret' + (composing ? ' composing' : '')} d={rend.cellPath(caret % N)} />
        <g>{hits}</g>
      </svg>
    </>
  );
}
