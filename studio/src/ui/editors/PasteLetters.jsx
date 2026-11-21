import { usePopover } from '../usePopover.js';

// The Paste letters… button and its popover around `children` (the kind's SequenceField
// or LineField). It stays open after applying, and closes on Escape or an outside press.
// The popover is hidden rather than unmounted, so a half-typed draft survives a close; it
// lives in the Board phase's tools, so switching to Clues drops an unapplied draft.
// `disabled` (with a `title` saying why) is for a kind with nothing to paste into at the
// caret: the button stays, so the tools don't change shape as the caret moves.
export function PasteLetters({ children, disabled = false, title }) {
  const pop = usePopover();
  const open = pop.open && !disabled;
  return (
    <span class="anchor" ref={pop.ref}>
      <button type="button" id="btn-paste-letters" class="btn" aria-expanded={open} disabled={disabled}
        title={disabled ? title : undefined} onClick={pop.toggle}>Paste letters…</button>
      <div id="paste-letters" class="pop paste-pop" hidden={!open}>{children}</div>
    </span>
  );
}
