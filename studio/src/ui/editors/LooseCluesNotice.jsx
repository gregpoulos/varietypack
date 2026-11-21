// Shown after a board edit has left clues unattached; it links to the Clues phase, where
// the tray is. Hidden when there are none.
export function LooseCluesNotice({ count, onShow }) {
  return (
    <p id="loose-clues-notice" class="note" hidden={count === 0}>
      {count === 1 ? '1 clue lost its entry' : `${count} clues lost their entry`}
      {' '}<button type="button" class="btn" onClick={onShow}>Show in Clues</button>
    </p>
  );
}
