import { keepBoardFocus } from './useBoardInput.js';

// The paper frame every structured board sits in, with the hidden #board-input it types
// through: a click anywhere on the frame focuses the board. `channel` (1 or 2) is the
// active direction, which tints the board's marks.
export function BoardFrame({ channel, focus, inputProps, children }) {
  return (
    <div id="board" class={'board ' + (channel === 1 ? 'in' : 'out')} onClick={focus} onMouseDown={keepBoardFocus}>
      <input id="board-input" aria-label="Board input" {...inputProps} />
      {children}
    </div>
  );
}
