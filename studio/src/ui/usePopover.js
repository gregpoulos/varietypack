import { createContext } from 'preact';
import { useState, useEffect, useLayoutEffect, useContext, useRef } from 'preact/hooks';

// The document and view a popover belongs to, for the ones that aren't given a `resetKey`
// (the structured editor's, which sit inside its shell).
export const PopoverScope = createContext(null);

// One popover's open state. It closes on a press or focus outside its own anchor, on
// Escape, and whenever `resetKey` changes (so a popover never outlives the document or
// view it was opened on). Put the returned `ref` on the element wrapping the popover's
// button and panel: a press on, or Tab to, another popover's button counts as outside,
// so at most one is open.
export function usePopover(resetKey) {
  const scope = useContext(PopoverScope);
  resetKey = resetKey ?? scope;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setOpen(false); }, [resetKey]);

  // A layout effect, so the listeners exist as soon as the popover is on screen.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const away = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('focusin', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('focusin', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return { open, ref, toggle: () => setOpen(o => !o), close: () => setOpen(false) };
}
