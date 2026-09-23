// Shared browser-engine "chrome": the UI-surround logic that is identical across
// every puzzle tool's engine.js — byline, instructions, the options menu and its
// two-click Clear button, the Rebus button, scroll-key forwarding, the
// localStorage save/restore/clear scaffolding, the shared keydown guard wrapper,
// the keyboard-shortcuts overlay, and the congrats dialog on solve. The
// solve-tracking cores (timer, completion latch, composer, board checker) live in
// engine-state.js; the tool-specific cores (SVG rendering, navigation, syncUI,
// per-cell answer checking) stay in each engine. Each engine calls these from
// inside its own init(). Injected into the HTML bundle as browser globals by
// getSharedBundle(); the dual-mode guard at the bottom lets node:test require the
// helpers that are tested via mocks (setupClearButton, setupRebusButton).

// Browser-only: create an SVG-namespaced element and apply an attribute map
// (setAttribute coerces each value to a string). Every engine builds SVG nodes
// this way.
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

// Injects the pre-rendered instructions HTML into `#instructions`, which is
// revealed (hidden=false) only when content exists. `data.instructions` is
// already block-level markdown HTML by the time it reaches the browser
// (shared/build/renderMarkdown.js's renderInstructionsMarkdown, called from
// commonPuzzleData at build time) — blank-line paragraph splitting happens
// at build time, not here, so this only ever injects trusted, build-time-rendered
// HTML, never author text directly.
function renderInstructions(data) {
  const el = document.getElementById('instructions');
  if (!data.instructions || !el) return;
  el.innerHTML = data.instructions;
  el.hidden = false;
}

// Two-click arm/disarm Clear button. First click swaps the label to "Are you
// sure?" and adds `.armed` for 3s; a second click within that window calls
// onConfirmed(), which each engine supplies to perform the full in-memory
// board reset.
// `refocus` (optional) restores puzzle focus after the arming click so the
// document keydown BUTTON guard doesn't block the next keystroke.
function setupClearButton(clearBtn, onConfirmed, refocus) {
  let armed = false;
  let timer = null;
  function disarm() {
    armed = false;
    clearBtn.textContent = 'Clear Puzzle';
    clearBtn.classList.remove('armed');
  }
  clearBtn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      clearBtn.textContent = 'Are you sure?';
      clearBtn.classList.add('armed');
      timer = setTimeout(disarm, 3000);
      if (refocus) refocus();
    } else {
      clearTimeout(timer);
      disarm();
      onConfirmed();
    }
  });
}

// Touch affordance for rebus entry — the pointer equivalent of the Enter key, which is
// otherwise the only way into composition. Some Android IMEs report keyCode 229 /
// key 'Unidentified' for composition-routed keys, leaving rebus cells unreachable there.
//
// Never disabled, never hidden, identical in hashed and non-hashed builds. That is the
// spoiler rule from docs/CROSS_TOOL_SPEC.md → Enter — rebus entry: nothing in the UI may
// vary as a function of a cell's capacity. #check-btn sits next to this one in #controls
// and *is* toggled per-cell — do not copy it here.
//
// The solved guard is not redundant with the engines' `if (latch.solved) return;`: that
// one lives inside the setupKeydown callback, and a click never passes through it.
// Without the guard here, composition could open on a sealed board.
//
//   onToggle()    → run the engine's Enter branch (composer.enter + advance-or-syncUI)
//   isComposing() → composer.isComposing(activeCell)
//   isSolved()    → latch.solved
//   refocus()     → restore hidden-input focus (optional)
function setupRebusButton(btn, { onToggle, isComposing, isSolved, refocus }) {
  // Idempotent: sync() runs from every syncUI(), i.e. on every keystroke and cursor
  // move, and assigning textContent replaces the text node even when the string is
  // unchanged. The guard also makes the extra sync() in the click handler free.
  function sync() {
    const want = isComposing() ? 'Done' : 'Rebus';
    if (btn.textContent !== want) btn.textContent = want;
  }

  // Focus-on-click is a `mousedown` default action, so cancelling mousedown keeps focus
  // on the hidden input and a phone's soft keyboard open, while `click` still fires and
  // keeps the button reachable by keyboard.
  //
  // It must be mousedown and not pointerdown. On a WebKit (iOS) touch tap, cancelling
  // pointerdown suppresses the click entirely and the button never fires at all;
  // cancelling mousedown does not. Chromium fires click either way, so no Chromium-only
  // test can catch a regression here — `shared/test/engine-chrome.rebus-button.test.js`
  // asserts structurally that no pointerdown listener exists.
  btn.addEventListener('mousedown', e => e.preventDefault());

  btn.addEventListener('click', e => {
    // setupKeydown returns early on any meta/ctrl chord, so Cmd+Enter cannot open
    // composition; a modified click must match or the two entry points diverge.
    if (e && (e.metaKey || e.ctrlKey)) return;
    // Only the toggle is gated on the solved board. Refocus is unconditional — see
    // docs/CROSS_TOOL_SPEC.md → Focus management; parking focus on the button would
    // also leave setupKeydown's BUTTON guard set.
    if (!isSolved()) {
      onToggle();
      sync();
    }
    if (refocus) refocus();
  });

  sync();
  return { sync };
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
// Cmd+Arrow history navigation, generic Cmd/Ctrl passthrough, BUTTON focus skip,
// and keys-overlay open. The tool-specific handler receives the event only when
// all guards pass.
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

// Builds and wires the options menu: a fixed top-right hamburger trigger
// (#menu-btn) and a non-modal dropdown (#menu-panel) that today holds only the
// Clear button, but is the shared home for any future rarely-used puzzle-wide
// toggle. Unlike setupKeysOverlay's <dialog>, the panel is a plain div — it
// never makes the page inert, so the grid stays clickable behind it.
//
// Clicks inside the panel never close it on their own. That is what lets
// #clear-btn's existing two-click arm/confirm sequence (setupClearButton) play
// out with the panel visibly open through the 3s "Are you sure?" window, instead of
// vanishing after the first (arming) click. Closing — by re-clicking the
// trigger, clicking outside, or Escape — calls `refocus`, matching every other
// control that can steal focus from the hidden input (see
// docs/CROSS_TOOL_SPEC.md → Focus management).
//
// Returns { clearBtn, close, checkBtnToggle, checkBtnToggleLabel } for setupControls
// to wire.
function setupOptionsMenu(refocus) {
  const btn = document.createElement('button');
  btn.id = 'menu-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Menu');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.textContent = '☰';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'menu-panel';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;

  // Only meaningful in non-hashed puzzles — the caller hides checkBtnToggleLabel
  // entirely (not just the checkbox) when hashed, since there's no Check Cell
  // button there to control. Sits above Clear Puzzle: a plain display setting
  // before the destructive action.
  const checkBtnToggle = document.createElement('input');
  checkBtnToggle.type = 'checkbox';
  checkBtnToggle.id = 'check-btn-toggle';
  const checkBtnToggleLabel = document.createElement('label');
  checkBtnToggleLabel.id = 'check-btn-toggle-label';
  checkBtnToggleLabel.append(checkBtnToggle, document.createTextNode(' Show Check Cell button'));
  panel.appendChild(checkBtnToggleLabel);

  const clearBtn = document.createElement('button');
  clearBtn.id = 'clear-btn';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear Puzzle';
  panel.appendChild(clearBtn);

  document.body.appendChild(panel);

  function isOpen() { return !panel.hidden; }

  function close() {
    if (!isOpen()) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    refocus();
  }

  function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));

  // A click on the trigger is excluded here because its own listener above
  // already handled it (bubbling reaches this one after), and a click inside
  // the panel (e.g. arming Clear) must never close the menu out from under it.
  document.addEventListener('click', e => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    close();
  });

  document.addEventListener('keydown', e => {
    if (isOpen() && e.key === 'Escape') close();
  });

  return { clearBtn, close, checkBtnToggle, checkBtnToggleLabel };
}

// A tiny, board-independent localStorage boolean for the Check Cell button's
// visibility — namespaced under the puzzle's own key (see storageKey) but never
// touched by clearState()/resetBoard(): it's a display preference, not board
// state, so Clear Puzzle must not reset it. Not built on setupStorage(), whose
// v/cellCount guard is board-shaped and meaningless for a single boolean. Absent
// (first load, or an older save) defaults to visible. `key` may be null exactly
// as in setupStorage — an untitled/undated puzzle gets no persistence either.
function setupCheckBtnPref(key) {
  const prefKey = key && (key + ':showCheckBtn');
  function load() {
    if (!prefKey) return true;
    try {
      const v = JSON.parse(localStorage.getItem(prefKey));
      return typeof v === 'boolean' ? v : true;
    } catch (_) { return true; }
  }
  function save(visible) {
    if (!prefKey) return;
    try { localStorage.setItem(prefKey, JSON.stringify(visible)); } catch (_) {}
  }
  return { load, save };
}

// Reserves #controls' current rendered width and height as min-width/min-height,
// so hiding #check-btn (via the "Show Check Cell button" toggle) never shrinks
// the row. Two independent reasons, both load-bearing:
//   - height: #check-btn is deliberately styled larger than its siblings
//     ("Primary button", theme-components.css), so it's ordinarily the
//     tallest child and the one whose removal would otherwise change
//     #controls' own height — in Snake Charmer specifically, that shifts the
//     ring below it in the same flex column.
//   - width: Snake Charmer's #ring-wrap has no explicit width — it shrinks to
//     fit its widest child (src/template/base.css), which for a small ring is
//     #controls, not the ring itself. Removing a button there shrinks
//     #controls' natural width, which shrinks #ring-wrap, which shrinks the
//     ring (#ring-svg is width:100% of it) — an unrelated button hide
//     visibly resizing the puzzle, not just reflowing #controls internally.
// Must be called while #check-btn is still visible, i.e. before applying the
// loaded preference.
// If a future fix makes #controls' rendered size constant (e.g. by giving it
// an explicit width/height instead of relying on content), revisit whether
// this runtime measurement is still needed.
function reserveControlsSize() {
  const controls = document.getElementById('controls');
  if (!controls) return;
  const rect = controls.getBoundingClientRect();
  controls.style.minWidth = rect.width + 'px';
  controls.style.minHeight = rect.height + 'px';
}

// Wires #check-btn and the options menu around it, identically in every engine:
//   - #check-btn is hidden in hashed builds (the plain-text answer never ships there, so
//     there is nothing to check against) and calls `onCheck` otherwise.
//   - Clear arms/confirms through setupClearButton; once actually confirmed (not just
//     armed) it runs `onClear` and closes the menu on the solver's behalf.
//   - The "Show Check Cell button" row is hidden in hashed builds; otherwise it reserves
//     #controls' size (before the loaded preference can hide the button — see
//     reserveControlsSize), applies the persisted preference, and keeps it in sync.
// `key` is the same storageKey(...) result the engine passes to setupStorage.
function setupControls({ checkBtn, hashed, onCheck, onClear, refocus, key }) {
  const { clearBtn, close, checkBtnToggle, checkBtnToggleLabel } = setupOptionsMenu(refocus);
  setupClearButton(clearBtn, () => { onClear(); close(); }, refocus);

  if (hashed) {
    checkBtn.hidden = true;
    checkBtnToggleLabel.hidden = true;
    return;
  }
  checkBtn.addEventListener('click', onCheck);
  reserveControlsSize();
  const checkBtnPref = setupCheckBtnPref(key);
  checkBtnToggle.checked = checkBtnPref.load();
  checkBtn.hidden = !checkBtnToggle.checked;
  checkBtnToggle.addEventListener('change', () => {
    checkBtn.hidden = !checkBtnToggle.checked;
    checkBtnPref.save(checkBtnToggle.checked);
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    svgEl, renderByline, renderInstructions, setupClearButton, setupRebusButton,
    scrollByKey, storageKey, setupStorage, flashWrong,
    setupKeydown, setupCongratsDialog, setupKeysOverlay, setupOptionsMenu,
    setupCheckBtnPref, reserveControlsSize, setupControls,
  };
}
