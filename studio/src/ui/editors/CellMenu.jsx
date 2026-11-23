import { usePopover } from '../usePopover.js';

// The Cell… button and its menu of things done to the cell at the caret: one component
// for all four editors, so they offer the same menu in the same place. A choice closes
// the menu and hands focus back to the board, so typing carries on.
//   items: [{ id, label, hint?, checked?, disabled?, onSelect }]
//     checked: a boolean makes the item a menuitemcheckbox with an LED (circle, rebus
//     mode, block); leave it out for a plain action (insert, delete). hint is the key
//     that does the same, if any.
//   focus: puts focus back on the board.
export function CellMenu({ items, focus }) {
  const pop = usePopover();
  return (
    <span class="anchor" ref={pop.ref}>
      <button type="button" id="btn-cell" class="btn" aria-haspopup="menu" aria-expanded={pop.open} onClick={pop.toggle}>Cell…</button>
      {pop.open && (
        <div id="cell-menu" class="pop cell-pop" role="menu" aria-label="Cell">
          {items.map(({ id, label, hint, checked, disabled, onSelect }) => (
            <button type="button" key={id} id={id} class="btn quiet menu-item" role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={checked === undefined ? undefined : checked} disabled={disabled}
              onClick={() => { pop.close(); onSelect(); focus(); }}>
              {checked !== undefined && <span class={'led amber' + (checked ? ' lit' : '')} aria-hidden="true"></span>}
              <span class="menu-label">{label}</span>
              {hint && <kbd>{hint}</kbd>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// The circle and rebus items of a board whose cells take one letter unless composed:
// `circled` is the caret cell's circle, `onCircle` toggles it, and `moveTo` is
// useBoardEditing's.
export function circleAndRebusItems({ circled, onCircle, composing, moveTo }) {
  return [
    { id: 'btn-circle', label: 'Toggle circle', checked: circled, onSelect: onCircle },
    { id: 'btn-rebus', label: composing ? 'Leave rebus mode' : 'Enter rebus mode', hint: 'Enter', checked: !!composing, onSelect: () => moveTo({ composing: !composing }) },
  ];
}
