import { useState } from 'preact/hooks';
import mb from '../../model/kinds/marching-bands.js';
import { fieldValue } from '../../model/doc.js';
import { GridThumb } from './MarchingBandsSizePreview.jsx';

const [field] = mb.sizeFields;

function resizeSummary(model, n2) {
  const n1 = model.size;
  const { rowClues, bandClues } = mb.resizeLosses(model, n2);
  const keep = n2 < n1
    ? `Keeps the letters in the top-left ${n2} × ${n2} and the row splits that still fit.`
    : 'Keeps every letter in the top-left corner; the new cells start empty.';
  const parts = [];
  if (bandClues) parts.push(`${bandClues} band clue${bandClues === 1 ? '' : 's'}`);
  if (rowClues) parts.push(`${rowClues} row clue${rowClues === 1 ? '' : 's'}`);
  const moved = parts.length ? ` ${parts.join(' and ')} will move to Unattached clues.` : '';
  return `${keep} Every band’s path changes, so each band goes back to one entry and keeps only its first clue.${moved}`;
}

// The grid's size lives in the puzzle's settings, away from the editing controls so a
// resize isn't triggered by accident (spec §5.2). The form is the confirmation: it says
// what it will set aside before it applies.
export function MarchingBandsSettings({ model, dispatch }) {
  const N = model.size;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const n2 = fieldValue(field, text);
  const openForm = () => { setText(String(Math.max(field.min, N - 2))); setOpen(true); };

  return (
    <div class="size-settings">
      <div class="set-row">
        <span>Grid size</span><b>{N} × {N}</b>
        <button type="button" id="btn-resize" class="btn" onClick={openForm}>Change size…</button>
      </div>
      {open && (
        <form id="resize-form" class="size-form" noValidate onSubmit={e => e.preventDefault()}>
          <label class="fld"><span>Resize to</span>
            <input type="number" id="resize-size" value={text} min={field.min} max={field.max} step="1" inputMode="numeric"
              onInput={e => setText(e.currentTarget.value)} />
          </label>
          {n2 === null && <p id="resize-summary" class="hint">Choose a whole number from {field.min} to {field.max}.</p>}
          {n2 === N && <p id="resize-summary" class="hint">That’s the current size.</p>}
          {n2 !== null && n2 !== N && (
            <>
              <GridThumb n={n2} />
              <p id="resize-summary">{resizeSummary(model, n2)}</p>
            </>
          )}
          <div class="size-actions">
            <button type="button" id="resize-apply" class="btn primary" disabled={n2 === null || n2 === N}
              onClick={() => { dispatch({ type: 'MODEL_COMMAND', name: 'resize', args: [n2], now: Date.now() }); setOpen(false); }}>Resize</button>
            <button type="button" id="resize-cancel" class="btn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
