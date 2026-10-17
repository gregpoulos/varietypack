import { sha256hex } from './sha256hex.mjs';
import { joinCells } from './boardString.mjs';

// Shared browser-engine game state: the solve-tracking cores every puzzle tool's
// engine.js builds on — the active-solve timer, the one-shot completion latch,
// multi-letter (rebus) composition, and board-state/answer checking. Unlike
// engine-chrome.mjs, nothing here creates page elements: every DOM touch goes through
// an accessor or element the engine supplies, which is what lets node:test drive
// these with plain closures and mocks. Each engine imports what it needs and
// shared/build/engineBundle.js bundles it into the page script.

// The default clock is performance.now(), not Date.now(): only durations are kept, and
// unlike the wall clock it never jumps when the computer's clock is changed mid-solve.
function setupTimer({ onPause, listenVisibility, now: _now = () => performance.now() } = {}) {
  let activeMs = 0;
  let runningSince = null;
  let started = false;
  let stopped = false;

  function onFirstInput() {
    if (started || stopped) return;
    started = true;
    runningSince = _now();
  }

  // Resets all timer state to initial values — used by resetBoard in each
  // engine so a cleared puzzle starts timing fresh from the next keystroke.
  function reset() {
    started = false;
    stopped = false;
    runningSince = null;
    activeMs = 0;
  }

  // Freezes the clock on a solve: banks the running stretch, and nothing (a tab switch,
  // more input) adds time until reset().
  function stop() {
    if (runningSince !== null) activeMs += _now() - runningSince;
    runningSince = null;
    started = false;
    stopped = true;
  }

  function getElapsedMs() {
    return activeMs + (runningSince !== null ? _now() - runningSince : 0);
  }

  function restoreMs(ms) {
    activeMs = (typeof ms === 'number' && ms >= 0) ? ms : 0;
  }

  function handleVisibility(hidden) {
    if (hidden) {
      if (runningSince !== null) {
        activeMs += _now() - runningSince;
        runningSince = null;
      }
      // Only flush to storage if the clock was ever started — an idle tab that
      // never received input has nothing new to persist.
      if (started && onPause) onPause();
    } else {
      // Guard against unpaired visible events (bfcache, iOS app-switcher) that
      // would overwrite runningSince and silently drop accumulated time.
      if (started && runningSince === null) runningSince = _now();
    }
  }

  const register = listenVisibility ??
    (fn => document.addEventListener('visibilitychange', () => fn(document.hidden)));
  register(handleVisibility);

  return { onFirstInput, reset, stop, getElapsedMs, restoreMs };
}

function makeCompletionLatch({
  puzzleRoot, kind, title, date, getBoardHash, getSolution, getElapsedMs,
  onComplete, embedOrigin,
  _postMessage,
}) {
  let fired = false;
  const pm = _postMessage ?? ((msg, targetOrigin) => window.parent?.postMessage(msg, targetOrigin));

  function sealIfSolved(isSolved) {
    if (isSolved) fired = true;
  }

  function reset() { fired = false; }

  function check(isSolved) {
    if (fired || !isSolved) return;
    fired = true;
    const timeMs = getElapsedMs();
    const solution = getSolution();
    const boardHash = getBoardHash();
    const detail = { boardHash, kind, title, date, timeMs, solution };
    puzzleRoot.dispatchEvent(new CustomEvent('varietypack:complete', {
      bubbles: true, composed: true, detail,
    }));
    // Exactly one message either way, so a host never counts a solve twice. With
    // embedOrigin the named host alone receives it, solution included; otherwise the
    // unchanged default.
    const base = { type: 'varietypack:complete', boardHash, kind, title, date, timeMs };
    if (embedOrigin) pm({ ...base, solution }, embedOrigin);
    else pm(base, '*');
    if (onComplete) onComplete(timeMs);
  }

  return { check, sealIfSolved, reset, get solved() { return fired; } };
}

// Builds the timer and completion latch every engine wires the same way: the timer saves
// on pause, and when the puzzle is solved the latch stops the timer (so the solve time is
// the one that stays) and calls onComplete. The engine passes its congrats dialog's
// `.open` as onComplete, which keeps this file from calling into engine-chrome.mjs.
// `now`, `listenVisibility` and `_postMessage` pass through to setupTimer and
// makeCompletionLatch so a test can stand in for the clock and the page.
function setupSolveTracking({
  puzzleRoot, data, getSolution, saveState, onComplete,
  now, listenVisibility, _postMessage,
}) {
  const timer = setupTimer({ onPause: saveState, now, listenVisibility });
  const latch = makeCompletionLatch({
    puzzleRoot,
    kind:         data.kind,
    title:        data.title,
    date:         data.date,
    getBoardHash: () => data.boardHash,
    getSolution,
    getElapsedMs: () => timer.getElapsedMs(),
    onComplete:   timeMs => { timer.stop(); if (onComplete) onComplete(timeMs); },
    embedOrigin:  data.embedOrigin,
    _postMessage,
  });
  return { timer, latch };
}

// The board's solve state, for syncUI: the done-wrong banner shows only on a filled
// board that isn't solved, and the latch hears whether it is solved (it decides whether
// that is news). DOM-coupled, tested via mocks.
function syncSolveState({ checker, latch, doneWrong }) {
  const solved = checker.isSolved();
  doneWrong.hidden = !(checker.isBoardFilled() && !solved);
  latch.check(solved);
}

// Length class for a cell-letter element, derived from the *typed* content's length —
// never from the answer's capacity. Deriving it from capacity would put a len-3 class
// on an empty cell in a non-hashed build, advertising which squares are rebus, and is
// impossible in a hashed build where the engine has no capacity to read.
const LEN_CLASSES = ['len-2', 'len-3', 'len-long'];
function letterLenClass(text) {
  if (text.length < 2)  return null;
  if (text.length === 2) return 'len-2';
  if (text.length === 3) return 'len-3';
  return 'len-long';
}

// Sets a cell-letter element's text and its length class together. Cells are stored in
// their normalized lowercase form, so this is where they become capitals: uppercasing
// first would turn ß into SS, but a normalized cell has no such letter. makeCellStore's
// setCellLetter, the only writer of a cell's letter, goes through this (Crushword's
// `show` calls it too), so a cell can never keep a stale size class.
function setLetterText(el, text) {
  if (!el) return;
  el.textContent = text.toUpperCase();
  const want = letterLenClass(text);
  for (const c of LEN_CLASSES) el.classList.toggle(c, c === want);
}

// One engine's cells: each one's letter and correct mark, and the save's view of them.
// `ids` lists every cell that holds a letter (Marching Bands' center and Crushword's
// blocks are left out); `cellEl(n)` and `letterEl(n)` return its elements, accessors so
// the store can be made before the SVG is built; `show(el, text)` displays a letter
// (Crushword's also fits a long one to its cell). setCellLetter is the only writer of a
// cell's letter.
function makeCellStore({ ids, cellEl, letterEl, show = setLetterText }) {
  const letters = new Map();
  const known = new Set(ids);

  // Marks (or unmarks) cell n's correct state on its cell and letter elements
  // together, so the two can never drift out of sync.
  function setCorrect(n, on) {
    cellEl(n).classList.toggle('correct', on);
    letterEl(n).classList.toggle('correct', on);
  }

  function isCorrect(n) { return cellEl(n).classList.contains('correct'); }

  function getCellLetter(n) { return letters.get(n) || ''; }

  // A new letter hasn't been checked, so it clears the cell's correct mark.
  function setCellLetter(n, letter) {
    if (letter) letters.set(n, letter);
    else letters.delete(n);
    show(letterEl(n), letter);
    setCorrect(n, false);
  }

  return {
    getCellLetter, setCellLetter, setCorrect, isCorrect,
    markAllCorrect() { for (const n of ids) setCorrect(n, true); },
    clearCells()     { for (const n of ids) setCellLetter(n, ''); },
    // The save's `letters` (an object keyed by cell id) and `correct` (cell ids).
    saveFields() {
      return { letters: Object.fromEntries(letters), correct: ids.filter(n => isCorrect(n)) };
    },
    // Whether every cell a save names (its letters, correct marks and composing cell) is
    // one of this board's: setupStorage's `fits`. Two boards can share a storageKey, and
    // restoring the other's save would write to cells that don't exist here.
    fitsSave(saved) {
      const composing = saved.composing;
      return Object.keys(saved.letters).every(k => known.has(Number(k)))
        && saved.correct.every(n => known.has(n))
        && (composing === null || composing === undefined || known.has(composing));
    },
    // saveFields' inverse. Letters first: each one clears its cell's correct mark.
    restoreFields(saved) {
      for (const [k, letter] of Object.entries(saved.letters)) setCellLetter(Number(k), letter);
      for (const n of saved.correct) setCorrect(n, true);
    },
  };
}

// Upper bound on a composing cell's content. Real rebus groups are 2-4 letters and the
// shared validator already warns at 5, so this can never truncate legitimate content —
// it exists because the composing branch appends without limit and nothing clips a cell's
// text, so a long paste or a held key would spill over neighboring cells. Input past the
// cap is dropped silently; Backspace still works.
const MAX_COMPOSE_LEN = 12;

// Composing (multi-letter / rebus) cell state. At most one cell composes at a time and,
// by the focusCell invariant (see docs/CROSS_TOOL_SPEC.md → Focus management), it is
// always the active cell. A cell counts as *filled* only when it holds content AND is
// not composing: that exclusion is what stops a mid-composition prefix from being read
// as a solved board and sealing the one-way completion latch early. The composer
// holds state only: each engine's syncUI paints the .composing class from isComposing.
//
// The tool supplies its own accessors because the four engines key cells differently
// (Snake Charmer by ring position, Spiral by cell number, Marching Bands and Crushword
// by grid id):
//   getContent(n)    → the cell's current string
//   setContent(n, s) → write it (the engine's setCellLetter); only typeLetter and
//                      backspace use it, so Crushword, which edits at its own cursor
//                      and calls neither, passes none
//   onCommit()       → runs after a commit: syncUI + the mode-appropriate check + save
//   isSolved()       → latch.solved; a solved board never opens composition
function makeComposer({ getContent, setContent, onCommit, isSolved }) {
  let composingId = null;

  function isComposing(n) { return composingId !== null && n === composingId; }

  function isCellFilled(n) { return getContent(n) !== '' && n !== composingId; }

  function commit() {
    if (composingId === null) return;
    // Clear the id *before* onCommit so the check it triggers sees the cell as filled.
    composingId = null;
    onCommit();
  }

  // Called at the top of every engine's focusCell. Because the active cell is assigned
  // nowhere else, this one call site covers arrows, Tab, Space, cell clicks, clue
  // clicks and toggles. A same-cell focus (a direction/mode toggle) is a no-op, so
  // composition survives a toggle — the cursor did not move.
  function commitIfMoved(n) {
    if (composingId !== null && composingId !== n) commit();
  }

  // Returns true when the caller should advance the cursor.
  function typeLetter(n, text) {
    if (isComposing(n)) {
      setContent(n, (getContent(n) + text).slice(0, MAX_COMPOSE_LEN));
      return false;
    }
    // The non-composing path sets one character per keystroke. The composing path takes
    // the whole value instead, which is what makes paste and mobile autocorrect work
    // mid-rebus. The asymmetry is deliberate — do not "unify" these.
    setContent(n, text.slice(-1));
    return true;
  }

  // Returns true when it consumed the keystroke. Returning false on an empty composing
  // cell is what lets the engine fall through to its normal retreat, which commits.
  function backspace(n) {
    if (!isComposing(n)) return false;
    const cur = getContent(n);
    if (cur === '') return false;
    setContent(n, cur.slice(0, -1));
    return true;
  }

  // Toggles composition on n. Beginning keeps any existing content, so a cell holding H
  // grows into HAR without retyping and no input is ever destroyed. Every way into
  // composition (Enter, the Rebus button, Crushword's keystrokes) ends here, so this is
  // the one place a solved board refuses it.
  function toggle(n) {
    if (isComposing(n)) { commit(); return; }
    if (isSolved()) return;
    composingId = n;
  }

  // Drops state without firing onCommit — see resetAndRefocus for why.
  function reset() {
    composingId = null;
  }

  // Composition is part of the saved board, not just live UI state. Autosave fires at
  // every mutation site including mid-composition — and on mobile also on every app
  // switch and screen lock, via setupTimer's visibility listener — so without these two
  // a reload silently commits a half-typed prefix: the cell returns *filled*, counts
  // toward isBoardFilled, and can be adjudicated as an answer the solver never submitted.
  function getComposing() { return composingId; }

  // `n` comes straight from the parsed save, so it may be undefined (a save written
  // before this field existed) or null. Only a real cell id reopens composition — an
  // absent field is treated as "not composing" rather than bumping the schema `v`,
  // matching how `activeMs`'s addition was handled.
  function restore(n) {
    if (n === null || n === undefined) return;
    composingId = n;
  }

  return {
    isCellFilled, isComposing, typeLetter, backspace, toggle, commitIfMoved, reset,
    getComposing, restore,
  };
}

// The board-state and answer-checking core, shared by every tool: pure state logic,
// covered by node:test.
//
// The tool supplies only what genuinely differs:
//   cellIds             → cell ids in canonical traversal order (the board-string order)
//   getContent(n)       → the cell's current string
//   isCellFilled(n)     → composer.isCellFilled — content present AND not composing
//   isCellMarkedCorrect(n) → reads the tool's own correct marker (class or dataset)
//   hashed              → picks the evidence source, nothing else
//   getExpected(n)      → the cell's answer string (non-hashed builds only)
//   getBoardHash()      → the stored board hash
//   markSolved()        → paint the solved board (cells, letters, and clue items if the
//                         tool marks them)
//   syncUI()            → the engine's syncUI
//
// One checkIfFilled() serves both modes. That is what keeps them symmetric by
// construction rather than by two hand-maintained copies: the guard, the syncUI calls
// and markSolved() are shared, and `hashed` chooses only how correctness is evidenced.
function makeBoardChecker({
  cellIds, getContent, isCellFilled, isCellMarkedCorrect,
  hashed, getExpected, getBoardHash, markSolved, syncUI,
}) {
  function isBoardFilled() { return cellIds.every(n => isCellFilled(n)); }

  // Whether every cell of one entry is filled: the definition of a "filled" clue
  // (`.filled` on its clue item). Fill, not correctness: a wrong entry is filled too, as
  // when a solver crosses a clue off by hand. Only for tools whose clues own known cells
  // — see docs/CROSS_TOOL_SPEC.md → "Active-clue banner".
  function isEntryFilled(cells) { return cells.every(n => isCellFilled(n)); }

  function isSolved() { return cellIds.every(n => isCellMarkedCorrect(n)); }

  // Normalize each cell, then join — never normalize a joined string. Cells are stored
  // normalized (lowercase), so they join as they are. joinCells inserts CELL_DELIM so a
  // solver's ["ha","ro"] cannot hash identically to a correct ["har","o"].
  function getSolution() {
    return joinCells(cellIds.map(n => getContent(n)));
  }

  // Check Cell (non-hashed builds): the one place that decides whether a cell may be
  // checked, so "every path that applies .correct has checked isCellFilled" holds by
  // construction. canCheck also drives the button's disabled state. checkCell returns
  // null when the cell can't be checked (empty, composing, or already correct — no
  // re-save), else whether its content is right; the engine does its own marking.
  function canCheck(n) { return isCellFilled(n) && !isCellMarkedCorrect(n); }

  function checkCell(n) {
    return canCheck(n) ? getContent(n) === getExpected(n) : null;
  }

  function boardIsCorrect() {
    return hashed
      ? sha256hex(getSolution()) === getBoardHash()
      : cellIds.every(n => getContent(n) === getExpected(n));
  }

  // No feedback of any kind until every cell is filled — and a composing cell is not
  // filled, which is what stops a mid-composition prefix from sealing the completion
  // latch on a half-entered board.
  function checkIfFilled() {
    if (!isBoardFilled()) return;
    if (!boardIsCorrect()) { syncUI(); return; }
    markSolved();
    syncUI();
  }

  // Restore-time repaint, called once after restoreState(): the auto-save payload records
  // cell correctness only, so this re-runs markSolved() to put the rest of the solved
  // painting back. Mark-driven — it repaints from marks already established and does not
  // re-adjudicate the answers. It must not call syncUI() (which reaches latch.check()),
  // so it stays safe under any restore ordering; pinned by engine-state.checker.test.js.
  // Call order: docs/CROSS_TOOL_SPEC.md → "localStorage key format" → Timing contract.
  function repaintIfSolved() { if (isSolved()) markSolved(); }

  return { isBoardFilled, isEntryFilled, isSolved, getSolution, canCheck, checkCell, checkIfFilled, repaintIfSolved };
}

// The restore-time epilogue every engine's init() runs just before its first focusCell():
// apply saved state, seal the latch if the restored board is already solved, then
// repaint. One shared call keeps the order fixed across engines (see repaintIfSolved for
// why the repaint must be safe under any order anyway). Returns the cell left
// mid-composition, or null, for the engine's resume-focus call.
function restoreAndSeal({ restoreState, checker, latch, composer }) {
  restoreState();
  latch.sealIfSolved(checker.isSolved());
  checker.repaintIfSolved();
  return composer.getComposing();
}

// The in-memory board reset behind Clear and Play again, shared so its two fixed
// positions hold in every engine. composer.reset() runs first: it drops composition
// without firing onCommit, whose saveState would otherwise re-write the key clearState
// removes — and commitIfMoved can't stand in for it, being a no-op when the reset target
// is the composing cell. focusInitial() runs last, so syncUI re-derives every highlight
// and the done-wrong banner from the fully reset board. `clearBoard` is the engine's own
// teardown: letters, correct marks, flash overlays, navigation sub-mode.
function resetAndRefocus({ composer, clearBoard, clearState, timer, latch, focusInitial }) {
  composer.reset();
  clearBoard();
  clearState();
  timer.reset();
  latch.reset();
  focusInitial();
}

export {
  setupTimer, makeCompletionLatch, makeComposer, setLetterText, letterLenClass, makeCellStore,
  makeBoardChecker,
  setupSolveTracking, syncSolveState, restoreAndSeal, resetAndRefocus,
};
