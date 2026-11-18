import { sha256hex } from './sha256hex.mjs';
import { joinCells } from './boardString.mjs';

// The game state every engine shares: cells and marks, composition, checking, the
// timer and completion latch, and saving. Nothing here creates page elements; every DOM
// touch goes through an accessor the engine supplies, so node:test can drive it all.

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

// How much help the solver used: counts of Check and Reveal actions, kept apart so a
// later feature can tell "only checked" from "revealed too". Part of one attempt's
// progress: saved with the board, zeroed with it (resetAndRefocus), reported on the
// completion event. It never enters the board string, so it cannot touch boardHash.
function makeHelpRecord() {
  let checks = 0;
  let reveals = 0;

  // A hand-edited save may hold anything: only a non-negative integer counts, everything
  // else reads as zero.
  const asCount = v => (Number.isInteger(v) && v >= 0 ? v : 0);

  return {
    countCheck()  { checks++; },
    countReveal() { reveals++; },
    reset()       { checks = 0; reveals = 0; },
    get()         { return { checks, reveals }; },
    saveFields()  { return { help: { checks, reveals } }; },
    restoreFields(saved) {
      const h = saved.help !== null && typeof saved.help === 'object' ? saved.help : {};
      checks = asCount(h.checks);
      reveals = asCount(h.reveals);
    },
  };
}

function makeCompletionLatch({
  puzzleRoot, kind, title, date, getBoardHash, getSolution, getElapsedMs, getHelp,
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
    const { checks, reveals } = getHelp();
    const detail = { boardHash, kind, title, date, timeMs, solution, checks, reveals };
    puzzleRoot.dispatchEvent(new CustomEvent('varietypack:complete', {
      bubbles: true, composed: true, detail,
    }));
    // Exactly one message either way, so a host never counts a solve twice. With
    // embedOrigin the named host alone receives it, solution included; otherwise the
    // unchanged default.
    const base = { type: 'varietypack:complete', boardHash, kind, title, date, timeMs, checks, reveals };
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
  const helpRecord = makeHelpRecord();
  const latch = makeCompletionLatch({
    puzzleRoot,
    kind:         data.kind,
    title:        data.title,
    date:         data.date,
    getBoardHash: () => data.boardHash,
    getSolution,
    getElapsedMs: () => timer.getElapsedMs(),
    getHelp:      () => helpRecord.get(),
    onComplete:   timeMs => { timer.stop(); if (onComplete) onComplete(timeMs); },
    embedOrigin:  data.embedOrigin,
    _postMessage,
  });
  return { timer, latch, helpRecord };
}

// What every engine hands setupStorage: { getState, fits, applyState } over the cell
// store, help record, timer and composer. The payload is the cells' fields, `help`,
// `activeMs` and `composing`. Restoring runs the composer last, after the letters are
// painted, so the composing cell shows its partial content.
function makeSavePayload({ cells, helpRecord, timer, composer }) {
  return {
    getState() {
      return {
        ...cells.saveFields(), ...helpRecord.saveFields(),
        activeMs: timer.getElapsedMs(), composing: composer.getComposing(),
      };
    },
    fits: cells.fitsSave,
    applyState(saved) {
      cells.restoreFields(saved);
      timer.restoreMs(saved.activeMs);
      helpRecord.restoreFields(saved);
      composer.restore(saved.composing);
    },
  };
}

// The board's solve state, for syncUI: the done-wrong banner shows only on a filled
// board that isn't solved, a solved board is painted (markSolved, idempotent), and the
// latch hears whether it is solved (it decides whether that is news). Painting here,
// where the solve is detected, means no path can announce a solve without painting it;
// painting first means the congrats card opens over a painted board. DOM-coupled,
// tested via mocks.
function syncSolveState({ checker, latch, doneWrong }) {
  const solved = checker.isSolved();
  doneWrong.hidden = !(checker.isBoardFilled() && !solved);
  if (solved) checker.markSolved();
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
// `show` calls it too), so a cell can never keep a stale size class. It also pins the
// scale's origin to the letter's own x,y (see .cell-letter in theme-components.css).
function setLetterText(el, text) {
  if (!el) return;
  el.textContent = text.toUpperCase();
  el.style.transformOrigin = `${el.getAttribute('x')}px ${el.getAttribute('y')}px`;
  const want = letterLenClass(text);
  for (const c of LEN_CLASSES) el.classList.toggle(c, c === want);
}

// A cell's mark: what is known about its content. One value per cell, held in
// `data-mark` on the cell and its letter; absent means unmarked.
//   checked  → confirmed right by a Check. The solve marks no cell; it paints the board
//              (each engine's markSolved).
//   revealed → confirmed right by a Reveal, whether it wrote the answer or found the
//              cell already holding it: the solver asked for the answer either way.
//   wrong    → a Check found the content wrong; it stays until the cell is edited.
// The first two count as right (isConfirmedRight, RIGHT_MARKS); `wrong` does not. A
// save's other values are ignored on restore, so a mark a later page adds can neither
// paint as right nor count as anything here.
const RIGHT_MARKS = new Set(['checked', 'revealed']);
const KNOWN_MARKS = new Set([...RIGHT_MARKS, 'wrong']);

// Writes `mark` (null for none) to one element's data-mark: the one writer, so the
// grid's cells and letters (makeCellStore) and the phone list's mirror can't drift.
function applyMark(el, mark) {
  if (mark) el.dataset.mark = mark;
  else delete el.dataset.mark;
}

// One engine's cells: each one's letter and mark, and the save's view of them. `ids`
// lists every cell that holds a letter (Marching Bands' center and Crushword's blocks are
// left out); `cellEl(n)` and `letterEl(n)` return its elements, accessors so the store
// can be made before the SVG is built; `show(el, text)` displays a letter (Crushword's
// also fits a long one to its cell); `drawMark(n, mark)` draws or removes the mark's
// shape (the engine's setupMarkLayer), called for every mark written, null included.
// setCellLetter is the only writer of a cell's letter.
function makeCellStore({ ids, cellEl, letterEl, show = setLetterText, drawMark = () => {} }) {
  const letters = new Map();
  const known = new Set(ids);

  // Sets (or, with null, clears) cell n's mark on its cell and letter elements together,
  // so the two can never drift out of sync.
  function setMark(n, mark) {
    for (const el of [cellEl(n), letterEl(n)]) applyMark(el, mark);
    drawMark(n, mark);
  }

  function getMark(n) { return cellEl(n).dataset.mark || null; }

  function isConfirmedRight(n) { return RIGHT_MARKS.has(getMark(n)); }

  function isMarkedWrong(n) { return getMark(n) === 'wrong'; }

  // A locked cell is confirmed right, and keystrokes can't change it: it behaves like any
  // filled cell, except that a typed letter, Space and Backspace leave its content alone
  // while the cursor moves as if the key had landed (Backspace treats it as empty, so it
  // steps past), and composition (Enter, the Rebus button) refuses it. Only Clear and
  // Play again empty it. Each engine's key paths consult this for where the cursor goes,
  // the composer refuses it, and setCellLetter won't write it.
  function isLocked(n) { return isConfirmedRight(n); }

  function getCellLetter(n) { return letters.get(n) || ''; }

  // A new letter hasn't been confirmed, so it clears the cell's mark. A locked cell is
  // left alone: the lock's backstop, so a key path that forgot isLocked can neither
  // overwrite a checked or revealed cell nor unlock it. Only clearCells empties one.
  function setCellLetter(n, letter) {
    if (isLocked(n)) return;
    if (letter) letters.set(n, letter);
    else letters.delete(n);
    show(letterEl(n), letter);
    setMark(n, null);
  }

  // The save's `marks` (cell id → value) as [id, mark] pairs; none unless it is a map.
  function savedMarks(saved) {
    const { marks } = saved;
    if (marks === null || typeof marks !== 'object' || Array.isArray(marks)) return [];
    return Object.entries(marks).map(([k, mark]) => [Number(k), mark]);
  }

  return {
    getCellLetter, setCellLetter, setMark, getMark, isConfirmedRight, isMarkedWrong, isLocked,
    // Clear and Play again: unmark first, so locked cells empty too.
    clearCells() {
      for (const n of ids) {
        setMark(n, null);
        setCellLetter(n, '');
      }
    },
    // The save's `letters` (an object keyed by cell id) and `marks` (cell id → value,
    // marked cells only).
    saveFields() {
      const marks = {};
      for (const n of ids) {
        const mark = getMark(n);
        if (mark) marks[n] = mark;
      }
      return { letters: Object.fromEntries(letters), marks };
    },
    // Whether every cell a save names (its letters, marks and composing cell) is one of
    // this board's: setupStorage's `fits`. Two boards can share a storageKey, and
    // restoring the other's save would write to cells that don't exist here.
    fitsSave(saved) {
      const composing = saved.composing;
      return saved.letters !== null && typeof saved.letters === 'object'
        && Object.keys(saved.letters).every(k => known.has(Number(k)))
        && savedMarks(saved).every(([n]) => known.has(n))
        && (composing === null || composing === undefined || known.has(composing));
    },
    // saveFields' inverse. Letters first: each one clears its cell's mark.
    restoreFields(saved) {
      for (const [k, letter] of Object.entries(saved.letters)) setCellLetter(Number(k), letter);
      for (const [n, mark] of savedMarks(saved)) if (KNOWN_MARKS.has(mark)) setMark(n, mark);
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
// by the focusCell invariant (see docs/CROSS_TOOL_SPEC.md → "Focus management"), it is
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
//   isLocked(n)      → the cell store's isLocked; a locked cell never composes
function makeComposer({ getContent, setContent, onCommit, isSolved, isLocked = () => false }) {
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

  // Returns true when the caller should advance the cursor. A locked cell takes no letter
  // but the cursor still moves on, as if it had landed.
  function typeLetter(n, text) {
    if (isLocked(n)) return true;
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
  // the one place a solved board, or a locked cell, refuses it.
  function toggle(n) {
    if (isComposing(n)) { commit(); return; }
    if (!canCompose(n)) return;
    composingId = n;
  }

  // Whether composition may open on n: not on a solved board or a locked cell. The Rebus
  // button reads it for its disabled state.
  function canCompose(n) { return !isSolved() && !isLocked(n); }

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

  // `n` is the save's `composing`: a cell id, or null (or absent) for none.
  function restore(n) {
    if (n === null || n === undefined) return;
    composingId = n;
  }

  return {
    isCellFilled, isComposing, canCompose, typeLetter, backspace, toggle, commitIfMoved,
    reset, getComposing, restore,
  };
}

// The board-state and answer-checking core, shared by every tool: pure state logic,
// covered by node:test.
//
// The tool supplies only what genuinely differs:
//   cellIds             → cell ids in canonical traversal order (the board-string order)
//   getContent(n)       → the cell's current string
//   isCellFilled(n)     → composer.isCellFilled — content present AND not composing
//   isCellConfirmedRight(n) → whether cell n's mark says right (the cell store's
//                         isConfirmedRight)
//   isCellMarkedWrong(n) → whether cell n carries a wrong mark (the cell store's
//                         isMarkedWrong)
//   checkComposing      → Check may take a composing cell holding content (Crushword,
//                         whose every typed cell composes until committed, and whose
//                         beforeCheck commits it into the check); default false
//   hashed              → picks the evidence source, nothing else
//   getExpected(n)      → the cell's answer string (non-hashed builds only)
//   getBoardHash()      → the stored board hash
//   markSolved()        → paint the solved board: `.solved` on the board SVG, and clue
//                         items if the tool marks them. It marks no cell, and must be
//                         idempotent: syncSolveState repaints on every syncUI of a solved
//                         board.
//   syncUI()            → the engine's syncUI
//
// One checkIfFilled() serves both modes. That is what keeps them symmetric by
// construction rather than by two hand-maintained copies: the guard, the syncUI calls
// and markSolved() are shared, and `hashed` chooses only how correctness is evidenced.
function makeBoardChecker({
  cellIds, getContent, isCellFilled, isCellConfirmedRight, isCellMarkedWrong = () => false,
  checkComposing = false, hashed, getExpected, getBoardHash, markSolved, syncUI,
}) {
  function isBoardFilled() { return cellIds.every(n => isCellFilled(n)); }

  // Whether every cell of one entry is filled: the definition of a "filled" clue
  // (`.filled` on its clue item). Fill, not correctness: a wrong entry is filled too, as
  // when a solver crosses a clue off by hand. Only for tools whose clues own known cells
  // — see docs/CROSS_TOOL_SPEC.md → "Active-clue banner".
  function isEntryFilled(cells) { return cells.every(n => isCellFilled(n)); }

  // Solved means the board's content is filled and correct, whatever its marks: the
  // solve marks no cell, and a checked cell can sit beside a wrong one. "Filled" excludes
  // a composing cell, so a half-typed rebus can't solve the board (or fire the latch from
  // syncSolveState); filled is tested first, so a hashed page hashes only a full board.
  function isSolved() { return isBoardFilled() && boardIsCorrect(); }

  // Normalize each cell, then join — never normalize a joined string. Cells are stored
  // normalized (lowercase), so they join as they are. joinCells inserts CELL_DELIM so a
  // solver's ["ha","ro"] cannot hash identically to a correct ["har","o"].
  function getSolution() {
    return joinCells(cellIds.map(n => getContent(n)));
  }

  // Check Cell (non-hashed builds): the one place that decides whether a cell may be
  // checked, so Check marks only a filled cell by construction. canCheck also drives the
  // button's disabled state. checkCell returns null when the cell can't be checked
  // (empty, composing unless checkComposing, already confirmed right, or marked wrong —
  // unchanged since its check, as any edit clears the mark), else whether its content is
  // right; the engine does its own marking.
  function canCheck(n) {
    const hasContent = checkComposing ? getContent(n) !== '' : isCellFilled(n);
    return hasContent && !isCellConfirmedRight(n) && !isCellMarkedWrong(n);
  }

  function checkCell(n) {
    return canCheck(n) ? getContent(n) === getExpected(n) : null;
  }

  // Check Clue and Check Puzzle: checkCell over a set of cells in one pass. A cell that
  // cannot be checked (empty, composing, already confirmed right) is skipped, so a set
  // with nothing checkable returns two empty lists. The engine marks `right` checked and
  // flashes `wrong`; neither is marked here, as checkCell marks nothing.
  function checkCells(ids) {
    const right = [];
    const wrong = [];
    // Each cell once: Snake Charmer's entry list holds a ring position twice when an
    // entry is longer than the ring.
    for (const n of new Set(ids)) {
      const ok = checkCell(n);
      if (ok === true) right.push(n);
      else if (ok === false) wrong.push(n);
    }
    return { right, wrong };
  }

  // Reveal Cell may act on any cell not already confirmed right: empty, wrong or
  // composing (revealCells ends the composition). The button's disabled state comes from
  // this.
  function canReveal(n) { return !isCellConfirmedRight(n); }

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

  // Restore-time repaint, called once after restoreState(): the auto-save payload holds
  // no solved flag, so this re-adjudicates the restored content (isSolved) and re-runs
  // markSolved() on a solved board. It must not call syncUI() (which reaches
  // latch.check()), so it stays safe under any restore ordering; pinned by
  // engine-state.checker.test.js.
  // Called by restoreAndSeal, which fixes the order.
  function repaintIfSolved() { if (isSolved()) markSolved(); }

  return {
    isBoardFilled, isEntryFilled, isSolved, markSolved, getSolution, canCheck, checkCell,
    checkCells,
    canReveal, getContent, getExpected, cellIds, checkIfFilled, repaintIfSolved,
  };
}

// Reveal Cell, Clue and Puzzle, over each cell of `ids` that `canReveal` accepts. Each
// is marked revealed. A cell whose content already equals its answer (`getExpected(n)`)
// keeps its letter; any other gets its answer written. There is no "filled" condition:
// Crushword composes every cell as it is typed, so a just-typed right letter is
// composing when Reveal arrives, and it must come out unrewritten there as in the other
// tools.
//
// The order is the point. Composition ends first, without onCommit: committing would
// adjudicate the half-typed prefix as an answer and could complete or wrong-flag the
// board before the reveal lands, and comparing content commits nothing (a prefix simply
// differs from the answer and is revealed). A cell the composer still held would end up
// marked and composing at once, so the next keystroke would append to it. Only a
// composing cell that is itself revealed loses its composition here. Each write comes
// before its mark because the writer clears the mark. The caller then counts the reveal,
// runs the completion path (checkIfFilled, syncUI) and only then saves; `makeHelpActions`
// says why.
function revealCells({ ids, composer, getContent, getExpected, canReveal, setCellLetter, setMark }) {
  const composing = composer.getComposing();
  if (composing !== null && ids.includes(composing) && canReveal(composing)) composer.reset();
  for (const n of ids) {
    if (!canReveal(n)) continue;
    if (getContent(n) !== getExpected(n)) setCellLetter(n, getExpected(n));
    setMark(n, 'revealed');
  }
}

// The check and reveal actions behind the help menu's rows, shared so the order that
// matters exists once. Every row, for a cell, a clue or the whole board, is one of two
// calls over a set of cells: checkSet(ids) and revealSet(ids).
//
// The order in each is the point: count, the completion path (checkIfFilled, which paints
// `.solved` and the clues on a board these cells finished), and only then save, so the
// save holds every mark the action made. Solved-ness itself comes from content, so a save
// can't unsolve a board.
//
// The engine supplies what differs:
//   flashWrong(wrong) → flash the wrong cells (and the phone list's); `wrong` is cell ids
//   beforeCheck()     → runs before a check, so Crushword can commit a typed cell into it
//   afterReveal()     → ends a reveal; the default syncs and refocuses, and Crushword's
//                       lands its cursor after the revealed content instead
// A set with nothing to check or reveal, or a solved board, counts nothing, writes
// nothing and only refocuses: the buttons' disabled state is UX only, so the action
// guards itself.
function makeHelpActions({
  checker, composer, helpRecord, setCellLetter, setMark, saveState, syncUI, refocus,
  flashWrong, beforeCheck = () => {}, afterReveal = () => { syncUI(); refocus(); },
}) {
  function checkSet(ids) {
    // After beforeCheck: the commit it makes can itself solve the board.
    beforeCheck();
    if (checker.isSolved()) { refocus(); return; }
    const { right, wrong } = checker.checkCells(ids);
    if (right.length + wrong.length === 0) { refocus(); return; }
    helpRecord.countCheck();
    for (const n of right) setMark(n, 'checked');
    for (const n of wrong) setMark(n, 'wrong');
    checker.checkIfFilled();
    saveState();
    flashWrong(wrong);
    syncUI();
    refocus();
  }

  function revealSet(ids) {
    if (checker.isSolved() || !ids.some(checker.canReveal)) { refocus(); return; }
    revealCells({
      ids, composer, getContent: checker.getContent, getExpected: checker.getExpected,
      canReveal: checker.canReveal, setCellLetter, setMark,
    });
    helpRecord.countReveal();
    checker.checkIfFilled();
    saveState();
    afterReveal();
  }

  return { checkSet, revealSet };
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
// teardown: letters, cell marks, flash overlays, navigation sub-mode.
function resetAndRefocus({ composer, clearBoard, clearState, timer, latch, helpRecord, focusInitial }) {
  composer.reset();
  clearBoard();
  clearState();
  timer.reset();
  latch.reset();
  helpRecord.reset();
  focusInitial();
}

// Where Tab / Shift+Tab (and the phone's prev / next clue) land. From entry `from`, walks
// `order` (entry keys, wrapping) in `dir` (+1 / -1) to the first entry with an unfilled
// cell, and returns { entry, cell } with that entry's first unfilled cell. The starting
// entry is the last one tried, so a lone incomplete entry is its own target. When every
// entry is filled there is nothing to skip to, so it steps plainly: the neighbor's first
// cell. `cellsOf(entry)` lists an entry's cells in reading order and `isFilled(cell)` is
// the board checker's notion of a filled cell.
function stepToUnfilled(order, from, dir, cellsOf, isFilled) {
  const n = order.length;
  const at = order.indexOf(from);
  for (let k = 1; k <= n; k++) {
    const entry = order[(((at + dir * k) % n) + n) % n];
    const cell = cellsOf(entry).find(c => !isFilled(c));
    if (cell !== undefined) return { entry, cell };
  }
  const entry = order[(((at + dir) % n) + n) % n];
  return { entry, cell: cellsOf(entry)[0] };
}

export {
  setupTimer, makeHelpRecord, makeCompletionLatch, makeComposer, setLetterText, letterLenClass, applyMark,
  makeCellStore,
  makeBoardChecker, revealCells, makeHelpActions, stepToUnfilled,
  setupSolveTracking, makeSavePayload, syncSolveState, restoreAndSeal, resetAndRefocus,
};
