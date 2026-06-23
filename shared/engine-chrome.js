// Shared browser-engine "chrome": the UI-surround logic that is identical across
// every puzzle tool's engine.js — byline, instructions, the two-click Clear
// button, scroll-key forwarding, the localStorage save/restore/clear scaffolding,
// the shared keydown guard wrapper, and the congrats dialog on solve.
// Each engine calls these from inside its own init(); the tool-specific cores
// (SVG rendering, navigation, syncUI, answer checking) stay in the engine.
// Injected into the HTML bundle as browser globals by getSharedBundle(); the
// dual-mode guard at the bottom keeps the pattern consistent with the other
// shared/ files even though no Node code requires it.

// Browser-only: create an SVG-namespaced element and apply an attribute map
// (setAttribute coerces each value to a string). Replaces the per-engine svgEl /
// makeSvgEl helpers and Snake Charmer's hand-rolled createElementNS + setAttribute
// construction, so every engine builds SVG nodes the same way.
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// author + date → `.byline`. Missing pieces are simply omitted; an empty result
// leaves the element blank.
function renderByline(data) {
  const byline = document.querySelector('.byline');
  if (!byline) return;
  const parts = [];
  if (data.author) parts.push('by ' + data.author);
  if (data.date) parts.push(String(data.date));
  byline.textContent = parts.join(' · ');
}

// instructions string → one `<p>` per blank-line-separated paragraph inside
// `#instructions`, which is revealed (hidden=false) only when content exists.
function renderInstructions(data) {
  const el = document.getElementById('instructions');
  if (!data.instructions || !el) return;
  data.instructions.split(/(?:\r?\n){2,}/).forEach(para => {
    const p = document.createElement('p');
    p.textContent = para.trim();
    el.appendChild(p);
  });
  el.hidden = false;
}

// Two-click arm/disarm Clear button. First click swaps the label to "Sure?" and
// adds `.armed` for 3s; a second click within that window calls onConfirmed(),
// which each engine supplies to perform the full in-memory board reset.
// `refocus` (optional) restores puzzle focus after the arming click so the
// document keydown BUTTON guard doesn't block the next keystroke.
function setupClearButton(clearBtn, onConfirmed, refocus) {
  let armed = false;
  let timer = null;
  clearBtn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      clearBtn.textContent = 'Sure?';
      clearBtn.classList.add('armed');
      timer = setTimeout(() => {
        armed = false;
        clearBtn.textContent = 'Clear';
        clearBtn.classList.remove('armed');
      }, 3000);
      if (refocus) refocus();
    } else {
      clearTimeout(timer);
      armed = false;
      clearBtn.textContent = 'Clear';
      clearBtn.classList.remove('armed');
      onConfirmed();
    }
  });
}

// Page-scroll deltas for keys the puzzles don't otherwise consume. Because the
// hidden input holds focus, the browser suppresses native scrolling for these,
// so the engines forward them here. Arrow = one nudge; Page = ~one viewport.
const SCROLL_DELTAS = {
  ArrowUp:   () => -80,
  ArrowDown: () =>  80,
  PageUp:    () => -window.innerHeight * 0.9,
  PageDown:  () =>  window.innerHeight * 0.9,
};

// Scrolls the page for a forwarded scroll key. Returns true when `key` is a
// scroll key (and the scroll was performed), false otherwise — so a caller that
// first tries cell navigation (e.g. Marching Bands) can fall through to this
// only when there is no in-grid target.
function scrollByKey(key) {
  const delta = SCROLL_DELTAS[key];
  if (!delta) return false;
  window.scrollBy({ top: delta(), behavior: 'auto' });
  return true;
}

// Builds the auto-save localStorage key, or null when it would be degenerate.
// Puzzles without both a title and a date get no auto-save (a `vp:<prefix>:|`
// key would collide across every untitled/undated puzzle of that type).
function storageKey(prefix, data) {
  if (!data.title || !data.date) return null;
  return 'vp:' + prefix + ':' + data.title + '|' + data.date;
}

// Flash a cell red to signal a wrong guess without disturbing the cell's own
// fill or active-state styling. Clones the cell element into `flashLayer` — an
// overlay <g> the engines paint above the cells but below the letters — relabels
// the clone `.flash-wrong-overlay` (whose base.css animation fades it out), then
// removes it once the animation ends. FLASH_WRONG_MS must match that animation's
// duration in shared/base.css.
const FLASH_WRONG_MS = 600;
function flashWrong(cellEl, flashLayer) {
  const flashEl = cellEl.cloneNode(false);
  flashEl.removeAttribute('id');
  flashEl.setAttribute('class', 'flash-wrong-overlay');
  flashLayer.appendChild(flashEl);
  setTimeout(() => flashEl.remove(), FLASH_WRONG_MS);
}

// localStorage save/restore/clear with the shared version + cellCount guard.
// The saved shape differs per tool, so the tool supplies the variable parts:
//   getState()      → tool payload merged under { v:1, cellCount } on save
//   applyState(saved) → applies a payload that passed the version/cellCount guard
// `key` may be null (see storageKey), in which case all three are no-ops.
function setupStorage(key, { cellCount, getState, applyState }) {
  function saveState() {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ v: 1, cellCount, ...getState() }));
    } catch (_) {}
  }
  function restoreState() {
    if (!key) return;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch (_) {}
    if (!saved || saved.v !== 1 || saved.cellCount !== cellCount) return;
    applyState(saved);
  }
  function clearState() {
    if (!key) return;
    try { localStorage.removeItem(key); } catch (_) {}
  }
  return { saveState, restoreState, clearState };
}

// Wraps a tool's keydown handler with the guards shared by every engine: hasFocus,
// Cmd/Ctrl+Arrow history navigation, generic Cmd/Ctrl passthrough, BUTTON focus
// skip, and keys-overlay open. The tool-specific handler receives the event only
// when all guards pass.
function setupKeydown(handler, { keysOverlay } = {}) {
  document.addEventListener('keydown', e => {
    if (!document.hasFocus()) return;
    if (keysOverlay && keysOverlay.open) return;
    if (e.metaKey && e.key === 'ArrowLeft') { history.back(); return; }
    if (e.metaKey && e.key === 'ArrowRight') { history.forward(); return; }
    if (e.metaKey || e.ctrlKey) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    handler(e);
  });
}

// Formats elapsed milliseconds as M:SS (e.g. 154321 → "2:34").
function formatMs(ms) {
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Builds the solve-celebration modal from the supplied callbacks and metadata.
// Creates a native <dialog id="congrats-dialog"> appended to <body>, opened via
// showModal() so the page is inert (matching the keys overlay pattern). Returns
// { open(timeMs) } — called from makeCompletionLatch's onComplete on first solve.
// Backdrop click and Escape close without resetting; Play again closes + resets.
function setupCongratsDialog({ title, date, onPlayAgain }) {
  const dialog = document.createElement('dialog');
  dialog.id = 'congrats-dialog';
  dialog.setAttribute('aria-label', 'Puzzle solved');

  const card = document.createElement('div');
  card.id = 'congrats';

  const msg = document.createElement('p');
  msg.id = 'congrats-msg';
  msg.textContent = 'Puzzle solved!';

  const timeEl = document.createElement('p');
  timeEl.id = 'congrats-time';

  const actions = document.createElement('div');
  actions.id = 'congrats-actions';

  const copyBtn = document.createElement('button');
  copyBtn.id = 'congrats-copy-btn';
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copy result';

  const playBtn = document.createElement('button');
  playBtn.id = 'congrats-play-btn';
  playBtn.type = 'button';
  playBtn.autofocus = true;
  playBtn.textContent = 'Play again';

  actions.append(copyBtn, playBtn);
  card.append(msg, timeEl, actions);
  dialog.appendChild(card);
  document.body.appendChild(dialog);

  // Backdrop click (target is the transparent dialog frame, not the card) closes.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });

  let copyText = '';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(copyText).catch(() => {});
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy result'; }, 1500);
  });
  playBtn.addEventListener('click', () => {
    dialog.close();
    onPlayAgain();
  });

  function open(timeMs) {
    const timeStr = formatMs(timeMs);
    timeEl.textContent = 'Solved in ' + timeStr;
    const prefix = (title && date) ? title + ' · ' + String(date) + '\n' : '';
    copyText = prefix + 'Solved in ' + timeStr;
    if (!dialog.open) dialog.showModal();
  }

  return { open };
}

// Builds and wires the keyboard-shortcuts modal from a list of [keys, description]
// pairs (the only part that differs between tools). Creates the #keys-btn trigger
// (fixed bottom-right corner) and a native <dialog id="keys-overlay"> holding the
// #keys-modal card, both appended to <body>. Returns the <dialog> for setupKeydown's
// keysOverlay guard (which checks .open).
//
// Opens on button click or ? keypress via showModal(), which moves focus into the
// dialog, traps Tab inside it, makes the rest of the page inert, and paints the
// ::backdrop dim in the top layer — all behaviors the platform gives for free.
// Closes on close-button click, backdrop click, or Escape (native). Puzzle focus
// returns via the browser's native dialog focus-restoration: `open()` focuses the
// grid input just before showModal(), making it the recorded restore target, so
// every close path lands focus there with no explicit close handler.
function setupKeysOverlay(shortcuts, refocus) {
  const btn = document.createElement('button');
  btn.id = 'keys-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Keyboard shortcuts');
  btn.textContent = '?';
  document.body.appendChild(btn);

  // <dialog> carries the dialog/aria-modal semantics implicitly when shown via
  // showModal(); it is a transparent frame, and #keys-modal is the visible card.
  const dialog = document.createElement('dialog');
  dialog.id = 'keys-overlay';
  dialog.setAttribute('aria-label', 'Keyboard shortcuts');

  const modal = document.createElement('div');
  modal.id = 'keys-modal';

  const header = document.createElement('div');
  header.id = 'keys-modal-header';
  const heading = document.createElement('span');
  heading.textContent = 'Keyboard shortcuts';
  const closeBtn = document.createElement('button');
  closeBtn.id = 'keys-close';
  closeBtn.type = 'button';
  closeBtn.autofocus = true; // showModal() focuses this, parking keystrokes off the grid
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  header.append(heading, closeBtn);

  const table = document.createElement('table');
  for (const [keys, desc] of shortcuts) {
    const row = document.createElement('tr');
    const keyCell = document.createElement('td');
    const kbd = document.createElement('kbd');
    kbd.textContent = keys;
    keyCell.appendChild(kbd);
    const descCell = document.createElement('td');
    descCell.textContent = desc;
    row.append(keyCell, descCell);
    table.appendChild(row);
  }

  modal.append(header, table);
  dialog.appendChild(modal);
  document.body.appendChild(dialog);

  // Focus the puzzle before opening so the input becomes the dialog's recorded
  // focus-restore target; the browser's native restoration then returns focus
  // there on every close path (Escape, ✕, backdrop, ? toggle). Without this,
  // restoration would return focus to the trigger button, briefly stranding the
  // next keystroke off the grid.
  const open  = () => { refocus(); dialog.showModal(); };
  const close = () => dialog.close();

  btn.addEventListener('click', () => dialog.open ? close() : open());
  closeBtn.addEventListener('click', close);
  // A click whose target is the dialog itself landed on the ::backdrop — clicks on
  // the #keys-modal card target the card or its children, so they don't close.
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
  document.addEventListener('keydown', e => {
    if (!document.hasFocus()) return;
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      dialog.open ? close() : open();
    }
  });
  return dialog;
}

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

if (typeof module !== 'undefined') {
  module.exports = {
    svgEl, renderByline, renderInstructions, setupClearButton,
    scrollByKey, storageKey, setupStorage, flashWrong,
    setupKeydown, setupCongratsDialog, setupKeysOverlay, setupTimer,
    makeCompletionLatch,
  };
}
