import { useRef } from 'preact/hooks';
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

// The hidden input a board types through, like the engines' #hidden-input. Returns
// { inputProps, focus }; render
// <input id="board-input" aria-label="Board input" {...inputProps}>.
//   onLetter(ch): once per letter typed (a–z or 0–9), normalized as the build path does (é → e)
//   onKey(event): for the keys above. Space reaches it from keydown and also from a space typed on
//     a soft keyboard, which arrives as input with no usable keydown (then `event` is a bare
//     { key: ' ' } with no modifiers).
export function useBoardInput({ onLetter, onKey }) {
  const ref = useRef(null);
  const inputProps = {
    ref,
    class: 'board-input',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    onInput(e) {
      const text = e.currentTarget.value;
      e.currentTarget.value = '';
      for (const ch of text) {
        if (ch === ' ') onKey({ key: ' ', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} });
        else for (const letter of normalize(ch)) onLetter(letter);
      }
    },
    onKeyDown(e) {
      if (isBoardKey(e)) onKey(e);
    },
  };
  return { inputProps, focus: () => { if (ref.current) ref.current.focus(); } };
}

// onMouseDown for a board's container. A mousedown on the (unfocusable) SVG would blur
// the hidden input before the click lands, so "click the selected cell again" couldn't
// tell the board had focus; keeping focus on the input fixes that.
export function keepBoardFocus(e) {
  if (e.target.id !== 'board-input') e.preventDefault();
}
