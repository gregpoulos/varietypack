// Shared modules: browser globals from getSharedBundle()'s concatenation order
// (normalize → sha256hex → isCellCorrect → boardString → this file); require()'d when
// loaded under node:test. Same dual-mode preamble the engines use.
if (typeof sha256hex === 'undefined' && typeof require !== 'undefined')
  var sha256hex = require('./sha256hex');
if (typeof isCellCorrect === 'undefined' && typeof require !== 'undefined')
  var isCellCorrect = require('./isCellCorrect');
if (typeof joinCells === 'undefined' && typeof require !== 'undefined')
  var { joinCells } = require('./boardString');

// Shared browser-engine game state: the solve-tracking cores every puzzle tool's
// engine.js builds on — the active-solve timer, the one-shot completion latch,
// multi-letter (rebus) composition, and board-state/answer checking. Unlike
// engine-chrome.js, nothing here creates page elements: every DOM touch goes through
// an accessor or element the engine supplies, which is what lets node:test drive
// these with plain closures and mocks. Injected into the HTML bundle as browser
// globals by getSharedBundle().

function setupTimer({ onPause, listenVisibility, now: _now = Date.now } = {}) {
  let activeMs = 0;
  let runningSince = null;
  let started = false;

  function onFirstInput() {
    if (started) return;
    started = true;
    runningSince = _now();
  }

  // Resets all timer state to initial values — used by resetBoard in each
  // engine so a cleared puzzle starts timing fresh from the next keystroke.
  function reset() {
    started = false;
    runningSince = null;
    activeMs = 0;
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

  return { onFirstInput, reset, getElapsedMs, restoreMs };
}

function makeCompletionLatch({
  puzzleRoot, kind, title, date, getBoardHash, getSolution, getElapsedMs,
  onComplete,
  _postMessage,
}) {
  let fired = false;
  const pm = _postMessage ?? ((msg) => window.parent?.postMessage(msg, '*'));

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
    pm({ type: 'varietypack:complete', boardHash, kind, title, date, timeMs });
    if (onComplete) onComplete(timeMs);
  }

  return { check, sealIfSolved, reset, get solved() { return fired; } };
}

// Builds the timer + completion-latch pair every engine wires identically: the timer
// flushes to storage on pause, and the latch's onComplete fires once, on first solve.
// `puzzleRoot`, `getSolution` and `onComplete` are supplied rather than read from module
// scope — same DOM-via-accessor discipline as makeComposer/makeBoardChecker, which is what
// keeps this file's exports callable from plain closures under node:test. The engine builds
// its own congratsDialog (shared/engine-chrome.js) separately and passes its `.open` as
// `onComplete` — this function never references a chrome helper, so engine-state.js still
// calls nothing in engine-chrome.js.
function setupSolveTracking({ puzzleRoot, data, getSolution, saveState, onComplete }) {
  const timer = setupTimer({ onPause: saveState });
  const latch = makeCompletionLatch({
    puzzleRoot,
    kind:         data.kind,
    title:        data.title,
    date:         data.date,
    getBoardHash: () => data.boardHash,
    getSolution,
    getElapsedMs: () => timer.getElapsedMs(),
    onComplete,
  });
  return { timer, latch };
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

// Sets a cell-letter element's text and its length class together. Every path that
// writes letter text goes through this — setCellLetter, applyState's restore, and
// resetBoard's clear — so a cell can never keep a stale size class.
function setLetterText(el, text) {
  if (!el) return;
  el.textContent = text;
  const want = letterLenClass(text);
  for (const c of LEN_CLASSES) if (c !== want) el.classList.remove(c);
  if (want) el.classList.add(want);
}

// Upper bound on a composing cell's content. Real rebus groups are 2-4 letters and the
// shared validator already warns at 5, so this can never truncate legitimate content —
// it exists because the composing branch appends without limit and nothing clips a cell's
// text, so a long paste or a held key would spill over neighbouring cells. Input past the
// cap is dropped silently; Backspace still works.
const MAX_COMPOSE_LEN = 12;

// Composing (multi-letter / rebus) cell state. At most one cell composes at a time and,
// by the focusCell invariant (see docs/CROSS_TOOL_SPEC.md → Focus management), it is
// always the active cell. A cell counts as *filled* only when it holds content AND is
// not composing: that exclusion is what stops a mid-composition prefix from being read
// as a solved board and sealing the one-way completion latch early.
//
// The tool supplies its own accessors because the four engines key cells differently
// (Snake Charmer by ring position, Spiral by cell number, Marching Bands and Crushword
// by grid id):
//   getContent(n)    → the cell's current string
//   setContent(n, s) → write it (the engine's setCellLetter)
//   getCellEl(n)     → the element that carries the .composing class
//   onCommit()       → runs after a commit: syncUI + the mode-appropriate check + save
function makeComposer({ getContent, setContent, getCellEl, onCommit }) {
  let composingId = null;

  function mark(n, on) {
    if (n === null) return;
    const el = getCellEl(n);
    if (!el) return;
    if (on) el.classList.add('composing');
    else    el.classList.remove('composing');
  }

  function isComposing(n) { return composingId !== null && n === composingId; }

  function isCellFilled(n) { return getContent(n) !== '' && n !== composingId; }

  function commit() {
    if (composingId === null) return;
    mark(composingId, false);
    // Clear the id *before* onCommit so the check it triggers sees the cell as filled.
    composingId = null;
    if (onCommit) onCommit();
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
  // grows into HAR without retyping and no input is ever destroyed.
  function enter(n) {
    if (isComposing(n)) { commit(); return; }
    composingId = n;
    mark(n, true);
  }

  // Drops state without firing onCommit — see resetAndRefocus for why.
  function reset() {
    mark(composingId, false);
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
    mark(n, true);
  }

  return {
    isCellFilled, isComposing, typeLetter, backspace, enter, commitIfMoved, reset,
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

  function isSolved() { return cellIds.every(n => isCellMarkedCorrect(n)); }

  // Normalize each cell, then join — never normalize a joined string. joinCells inserts
  // CELL_DELIM so a solver's ["ha","ro"] cannot hash identically to a correct ["har","o"].
  function getSolution() {
    return joinCells(cellIds.map(n => getContent(n).toLowerCase()));
  }

  function boardIsCorrect() {
    return hashed
      ? sha256hex(getSolution()) === getBoardHash()
      : cellIds.every(n => isCellCorrect(getContent(n), getExpected(n)));
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

  // Restore-time repaint, called once after restoreState(). The auto-save payload
  // records cell correctness only — deliberately, since everything else the solved
  // board shows is derivable — so a solved puzzle comes back with green cells and
  // unmarked clue items. Re-running markSolved() puts the rest of the painting back.
  //
  // Mark-driven, never evidence-driven: it re-paints from correctness already
  // established, it does not re-adjudicate the board, so hashed and non-hashed
  // behave identically.
  //
  // And it must not call syncUI(), which would reach the engine's latch.check().
  // Today's engines all seal before repainting, so such a call would in fact be
  // harmless — check() returns immediately on an already-fired latch. The rule is
  // not about today: makeBoardChecker is shared and cannot see how any future
  // engine orders its restore epilogue, so the repaint has to be safe under *any*
  // ordering. Staying out of syncUI() is what buys that; seal-first is insurance,
  // not the guarantee — pinned by shared/test/engine-state.checker.test.js. All
  // four engines call latch.sealIfSolved() then checker.repaintIfSolved(), both
  // before the first focusCell(); see docs/CROSS_TOOL_SPEC.md → "localStorage key
  // format" → Timing contract for that call-order requirement.
  function repaintIfSolved() { if (isSolved()) markSolved(); }

  return { isBoardFilled, isSolved, getSolution, checkIfFilled, repaintIfSolved };
}

// The restore-time epilogue every engine's init() runs just before its first focusCell():
// apply saved state, seal the latch if the restored board is already solved, then repaint.
// One shared call keeps the order fixed across engines (see repaintIfSolved for why the
// repaint must be safe under any order anyway). Returns the cell left mid-composition, or
// null, for the engine's resume-focus call.
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

if (typeof module !== 'undefined') {
  module.exports = {
    setupTimer, makeCompletionLatch, makeComposer, setLetterText, letterLenClass, makeBoardChecker,
    setupSolveTracking, restoreAndSeal, resetAndRefocus,
  };
}
