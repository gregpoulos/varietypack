import { useEffect, useRef } from 'preact/hooks';
import { normalize } from '../../../../shared/normalize.mjs';

// Keys the board handles itself; the editor's onKey decides what each one does and calls
// preventDefault for the ones it uses.
const BOARD_KEYS = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete', 'Enter', 'Tab', '|', '.', '#', ' ',
]);

function isBoardKey(e) {
  if (e.ctrlKey || e.metaKey) return e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y';
  return BOARD_KEYS.has(e.key);
}

// ⌘← and ⌘→ are the browser's Back and Forward, but in a focused text field the browser
// reads them as "caret to line start/end" and never navigates, so the hidden input
// forwards them itself. The studio keeps its screens in the URL hash, so
// history.back()/forward() is the same step the browser would take. → true when `e` was
// one of them.
function browserHistoryKey(e) {
  if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
  e.preventDefault();
  if (e.key === 'ArrowLeft') history.back(); else history.forward();
  return true;
}

// Whether the board holds focus only because opening the document gave it (see
// maybeFocusBoard in StructuredShell). Such focus is not the author's own, so the first
// click on the caret cell must still just select; it counts as focus only once the
// author has pressed a key or clicked. Module-global, so useBoardInput clears it when the
// input unmounts (a removed focused input fires no blur).
let focusedByOpen = false;
export function focusBoardOnOpen() {
  const input = document.getElementById('board-input');
  if (!input) return;
  input.focus({ preventScroll: true });
  focusedByOpen = document.activeElement === input;
}

// The hidden input a board types through, like the engines' #hidden-input. Returns
// { inputProps, focus }; render
// <input id="board-input" aria-label="Board input" {...inputProps}>.
//   onLetter(ch): once per letter typed (a–z or 0–9), normalized as the build path does (é → e)
//   onKey(event): for the keys above. Space reaches it from keydown and also from a space typed on
//     a soft keyboard, which arrives as input with no usable keydown (then `event` is a bare
//     { key: ' ' } with no modifiers). Only a space that is the whole input counts: one inside
//     longer text (a pasted "LIE TO") is part of the text, skipped as the puzzle page skips it.
// `focus()` is the author's own focus (the #board click handler, toolbar buttons), so it
// ends the open-focus state: a click on a gap in the board keeps focus without a blur.
export function useBoardInput({ onLetter, onKey }) {
  const ref = useRef(null);
  useEffect(() => () => { focusedByOpen = false; }, []);
  const inputProps = {
    ref,
    class: 'board-input',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    onBlur() { focusedByOpen = false; },
    onInput(e) {
      focusedByOpen = false;
      const text = e.currentTarget.value;
      e.currentTarget.value = '';
      if (text === ' ') {
        onKey({ key: ' ', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} });
        return;
      }
      for (const ch of text) for (const letter of normalize(ch)) onLetter(letter);
    },
    onKeyDown(e) {
      focusedByOpen = false;
      if (browserHistoryKey(e)) return;
      if (isBoardKey(e)) onKey(e);
    },
  };
  return { inputProps, focus: () => { focusedByOpen = false; if (ref.current) ref.current.focus(); } };
}

// onMouseDown for a board's container. A mousedown on the (unfocusable) SVG would blur
// the hidden input before the click lands, so "click the selected cell again" couldn't
// tell the board had focus; keeping focus on the input fixes that.
export function keepBoardFocus(e) {
  if (e.target.id !== 'board-input') e.preventDefault();
}

// Whether the board's hidden input has focus. "Click the selected cell again" switches
// direction only once the board has focus: the first click just selects.
export function boardHasFocus() {
  const had = !focusedByOpen && !!document.activeElement && document.activeElement.id === 'board-input';
  focusedByOpen = false;
  return had;
}
