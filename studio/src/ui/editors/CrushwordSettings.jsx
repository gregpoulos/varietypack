import { useState } from 'preact/hooks';
import cw from '../../model/kinds/crushword.js';
import { fieldValue } from '../../model/doc.js';
import { CrushwordThumb } from './CrushwordSizePreview.jsx';
import { plural } from './plural.js';
import { Fader } from './Fader.jsx';

const [rowsField, colsField] = cw.sizeFields;

// What a resize does, in words: the cells it adds or removes, the clues it would orphan
// and whether the pattern stays symmetric. Counted from the resize's own result, `after`.
function resizeSummary(model, after) {
  const { rows: R2, cols: C2 } = after;
  const parts = [];
  if (R2 < model.rows) parts.push(`Removes the bottom ${plural(model.rows - R2, 'row', 'rows')}.`);
  if (C2 < model.cols) parts.push(`Removes the right ${plural(model.cols - C2, 'column', 'columns')}.`);
  if (R2 > model.rows) parts.push(`Adds ${plural(R2 - model.rows, 'empty row', 'empty rows')} at the bottom.`);
  if (C2 > model.cols) parts.push(`Adds ${plural(C2 - model.cols, 'empty column', 'empty columns')} on the right.`);
  const lost = after.orphans.length - model.orphans.length;
  if (lost) parts.push(lost === 1 ? '1 clue loses its entry and moves to Unattached clues.' : `${lost} clues lose their entry and move to Unattached clues.`);
  if (cw.gridChecks(model).symmetric && !cw.gridChecks(after).symmetric) parts.push('The block pattern won’t be symmetric.');
  return parts.join(' ');
}

// Crushword's settings (GridSettings): the grid's size, through a resize form that says
// what it will set aside, and the letters per cell.
export function CrushwordSettings({ model, dispatch }) {
  const { rows, cols } = model;
  const [open, setOpen] = useState(false);
  const [rowsText, setRowsText] = useState('');
  const [colsText, setColsText] = useState('');
  const R2 = fieldValue(rowsField, rowsText);
  const C2 = fieldValue(colsField, colsText);
  const valid = R2 !== null && C2 !== null;
  const unchanged = valid && R2 === rows && C2 === cols;
  const openForm = () => { setRowsText(String(rows)); setColsText(String(cols)); setOpen(true); };
  const send = (name, args, key) => dispatch({ type: 'MODEL_COMMAND', name, args, key, now: Date.now() });

  let preview = null;
  if (open && valid && !unchanged) {
    const after = cw.commands.resize(model, R2, C2);
    const fresh = Array.from({ length: R2 * C2 }, (_, i) => Math.floor(i / C2) >= rows || i % C2 >= cols);
    preview = (
      <>
        <CrushwordThumb rows={R2} cols={C2} blocks={after.blocks} fresh={fresh} />
        <p id="resize-summary">{resizeSummary(model, after)}</p>
      </>
    );
  }

  // The fader's value. Sliding onto the default stores nothing (null), so an untouched
  // puzzle and one slid back to the default export the same YAML.
  const cap = cw.capOf(model);
  const onCap = (n) => send('setMaxCellLetters', [n === cw.DEFAULT_MAX_CELL_LETTERS ? null : n], 'setting:maxCellLetters');

  return (
    <div class="size-settings">
      <div class="set-row">
        <span>Grid size</span><output class="readout" id="grid-size">{rows} × {cols}</output>
        <button type="button" id="btn-resize" class="btn" aria-expanded={open} onClick={open ? () => setOpen(false) : openForm}>Change size…</button>
      </div>
      {open && (
        <form id="resize-form" class="size-form" noValidate onSubmit={e => e.preventDefault()}>
          <div class="size-fields">
            <label class="fld"><span>Rows</span>
              <input type="number" id="resize-rows" value={rowsText} min={rowsField.min} max={rowsField.max} step="1" inputMode="numeric"
                onInput={e => setRowsText(e.currentTarget.value)} /></label>
            <label class="fld"><span>Columns</span>
              <input type="number" id="resize-cols" value={colsText} min={colsField.min} max={colsField.max} step="1" inputMode="numeric"
                onInput={e => setColsText(e.currentTarget.value)} /></label>
            <button type="button" id="resize-apply" class="btn dark" disabled={!valid || unchanged}
              onClick={() => { send('resize', [R2, C2]); setOpen(false); }}>Resize</button>
          </div>
          {!valid && <p id="resize-summary" class="hint">Rows and columns must be whole numbers from {rowsField.min} to {rowsField.max}.</p>}
          {preview}
        </form>
      )}
      <Fader id="max-cell-letters" label="Max. letters per cell" min={1} max={cw.MAX_CELL_LETTERS_LIMIT} value={cap} onChange={onCap} />
    </div>
  );
}
