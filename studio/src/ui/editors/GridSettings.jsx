import { undoRedoKeys } from './useBoardEditing.js';
import { usePopover } from '../usePopover.js';

// The kind's puzzle settings (grid resize, letters per cell) behind a Grid… button at the
// end of the Board toolbar. They live here and nowhere else, so they can't be triggered
// by accident; the form says what it will set aside before it applies. The popover opens
// inward (`right`) because the button sits at the row's right end.
export function GridSettings({ Settings, model, dispatch }) {
  const grid = usePopover();
  // Undo and redo act on the model, as in the Puzzle box.
  const onKeyDown = undoRedoKeys(dispatch);
  return (
    <span class="anchor grid-anchor" ref={grid.ref}>
      <button type="button" id="btn-grid" class="btn" aria-expanded={grid.open} onClick={grid.toggle}>Grid…</button>
      {grid.open && (
        <div id="grid-settings" class="pop right grid-pop" role="dialog" aria-label="Grid" onKeyDown={onKeyDown}>
          <div id="puzzle-settings"><Settings model={model} dispatch={dispatch} /></div>
        </div>
      )}
    </span>
  );
}
