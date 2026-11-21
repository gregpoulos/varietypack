import { usePopover } from '../usePopover.js';

// A one-line strip under the board: the essential keys, and a Keys button that opens the
// kind's full list above it.
//   essential: a line of <kbd> items.   full: the whole key list (a KeyList).
export function KeyStrip({ essential, full }) {
  const pop = usePopover();
  return (
    <div id="key-strip" class="key-strip">
      <span class="keys">{essential}</span>
      <span class="anchor" ref={pop.ref}>
        <button type="button" id="btn-keys" class="btn quiet" aria-expanded={pop.open} onClick={pop.toggle}>Keys</button>
        {pop.open && <div id="keys" class="pop right up">{full}</div>}
      </span>
    </div>
  );
}

// The full key list as rows: the key or keys, then what they do. `intro` and `notes` are
// the sentences before and after the list.
//   items: [[keys, text]]   keys is a node (one or more <kbd>); text is a string.
export function KeyList({ intro, items, notes }) {
  return (
    <div class="keys keys-full">
      {intro && <p>{intro}</p>}
      <ul class="keys-list">
        {items.map(([keys, text], i) => <li key={i}><span class="keys-k">{keys}</span><span>{text}</span></li>)}
      </ul>
      {notes && <p>{notes}</p>}
    </div>
  );
}
