import { useEffect, useState } from 'preact/hooks';
import core from '../../core/index.js';
import sc from '../../model/kinds/snake-charmer.js';
import { fieldValue } from '../../model/doc.js';
import { resolveRing } from './RingBoard.jsx';
import { ShapeSelect } from './ShapeSelect.jsx';

const [field] = sc.sizeFields;

// The New puzzle size prompt's preview: the ring the typed cell count makes, and a choice
// of the shapes that fit it. The choice goes back through setExtra({ shape }) (null for
// Auto).
export function SnakeCharmerSizePreview({ values, setExtra }) {
  const N = fieldValue(field, values.cells);
  const feasible = N === null ? [] : core.feasibleShapes(N);
  const [choice, setChoice] = useState('');
  const effective = feasible.includes(choice) ? choice : '';   // a shape that stopped fitting reverts to Auto

  useEffect(() => { setExtra({ shape: effective || null }); }, [effective]);

  if (N === null) {
    return (
      <>
        <p class="hint">Every shape needs an even number of cells per lap, from {field.min} to {field.max}.</p>
        <label class="fld"><span>Shape</span><ShapeSelect id="size-shape" N={0} value="" disabled onChange={() => {}} /></label>
      </>
    );
  }
  const R = resolveRing(N, effective || null);
  return (
    <>
      <svg viewBox={`0 0 ${R.ring.svgWidth.toFixed(1)} ${R.ring.svgHeight.toFixed(1)}`} class="thumb" aria-hidden="true">
        {Array.from({ length: N }, (_, k) => <path key={k} class="t-cell" d={R.renderer.cellPath(k)} />)}
      </svg>
      <label class="fld"><span>Shape</span>
        <ShapeSelect id="size-shape" N={N} value={effective} onChange={setChoice} />
      </label>
    </>
  );
}
