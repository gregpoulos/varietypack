import { usePopover } from '../usePopover.js';

// The kind's puzzle settings (grid resize, letters per cell) behind a Grid… button beside
// Cell… in the Board toolbar. They live here and nowhere else, so they can't be triggered
// by accident, and each form is its own confirmation: it says what it will set aside
// before it applies.
export function GridSettings({ Settings, model, dispatch }) {
  const grid = usePopover();
  return (
    <span class="anchor grid-anchor" ref={grid.ref}>
      <button type="button" id="btn-grid" class="btn" aria-expanded={grid.open} onClick={grid.toggle}>Grid…</button>
      {grid.open && (
        <div id="grid-settings" class="pop grid-pop" role="dialog" aria-label="Grid">
          <div id="puzzle-settings"><Settings model={model} dispatch={dispatch} /></div>
        </div>
      )}
    </span>
  );
}
