import core from '../../core/index.js';
import { SHAPE_LABEL } from './shapeLabels.js';

// The ring-shape <select>: Auto (labeled with what it resolves to), then the shapes whose
// geometry exists for N cells. `value` is the explicit shape or ''. With keepUnfit, an
// explicit shape that no longer fits N stays listed (selected, and flagged) so the picker
// never shows a value the model doesn't hold; the size prompt has no such shape to keep.
export function ShapeSelect({ id, N, value, onChange, keepUnfit = false, disabled = false }) {
  const feasible = disabled ? [] : core.feasibleShapes(N);
  const auto = disabled ? null : core.autoShape(N);
  const autoLabel = auto && feasible.includes(auto) ? SHAPE_LABEL[auto] : 'no shape fits';
  return (
    <select id={id} value={value} disabled={disabled} onChange={e => onChange(e.currentTarget.value)}>
      <option value="">Auto{disabled ? '' : ` (${autoLabel})`}</option>
      {core.SHAPE_NAMES.map(s => {
        const fits = feasible.includes(s);
        if (!fits && !(keepUnfit && s === value)) return null;
        return <option value={s} key={s}>{SHAPE_LABEL[s]}{fits ? '' : ` (doesn’t fit ${N} cells)`}</option>;
      })}
    </select>
  );
}
