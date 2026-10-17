import { useState } from 'preact/hooks';
import cw from '../../model/kinds/crushword.js';
import { fieldValue } from '../../model/doc.js';
import { CrushwordThumb } from './CrushwordSizePreview.jsx';
import { useKeyedDraft } from './useKeyedDraft.js';

const [rowsField, colsField] = cw.sizeFields;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// What a resize does, in words: the cells it adds or removes, the clues it would orphan
// and whether the pattern stays symmetric. Counted from the resize's own result.
function resizeSummary(model, R2, C2) {
  const parts = [];
  if (R2 < model.rows) parts.push(`Removes the bottom ${plural(model.rows - R2, 'row', 'rows')}.`);
  if (C2 < model.cols) parts.push(`Removes the right ${plural(model.cols - C2, 'column', 'columns')}.`);
  if (R2 > model.rows) parts.push(`Adds ${plural(R2 - model.rows, 'empty row', 'empty rows')} at the bottom.`);
  if (C2 > model.cols) parts.push(`Adds ${plural(C2 - model.cols, 'empty column', 'empty columns')} on the right.`);
  const lost = cw.resizeLosses(model, R2, C2);
  if (lost) parts.push(lost === 1 ? '1 clue loses its entry and moves to Unattached clues.' : `${lost} clues lose their entry and move to Unattached clues.`);
  if (cw.gridChecks(model).symmetric && !cw.gridChecks(cw.commands.resize(model, R2, C2)).symmetric) parts.push('The block pattern won’t be symmetric.');
  return parts.join(' ');
}

// The grid's size and letters-per-cell live in the puzzle's settings, away from the
// editing controls so a resize isn't triggered by accident (spec §5.2). The resize form
// is the confirmation: it says what it will set aside before it applies.
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
        <p id="resize-summary">{resizeSummary(model, R2, C2)}</p>
      </>
    );
  }

  const cap = useKeyedDraft(String(model.maxCellLetters));
  const capText = cap.value ?? (model.maxCellLetters ?? '');
  const badCap = cap.value !== null && cap.value !== '' && !/^[1-9]$/.test(cap.value);   // the same rule onCap applies
  function onCap(text) {
    cap.set(text);
    if (text === '') send('setMaxCellLetters', [null], 'setting:maxCellLetters');
    else if (/^[1-9]$/.test(text)) send('setMaxCellLetters', [Number(text)], 'setting:maxCellLetters');
  }

  return (
    <div class="size-settings">
      <div class="set-row">
        <span>Grid size</span><b>{rows} × {cols}</b>
        <button type="button" id="btn-resize" class="btn" onClick={openForm}>Change size…</button>
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
          </div>
          {!valid && <p id="resize-summary" class="hint">Rows and columns must be whole numbers from {rowsField.min} to {rowsField.max}.</p>}
          {unchanged && <p id="resize-summary" class="hint">That’s the current size.</p>}
          {preview}
          <div class="size-actions">
            <button type="button" id="resize-apply" class="btn primary" disabled={!valid || unchanged}
              onClick={() => { send('resize', [R2, C2]); setOpen(false); }}>Resize</button>
            <button type="button" id="resize-cancel" class="btn" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      <div class="set-row">
        <label for="max-cell-letters">Letters per cell, at most</label>
        <input type="number" id="max-cell-letters" min="1" max="9" step="1" inputMode="numeric" placeholder="3" value={capText}
          onInput={e => onCap(e.currentTarget.value)} />
        <small class={badCap ? 'err' : 'hint'}>Whole number from 1 to 9. Blank means the default, 3. Lowering it flags cells that hold more; it doesn’t trim them.</small>
      </div>
    </div>
  );
}
