// Shared browser-engine "chrome": the UI-surround logic that is identical across every
// puzzle tool's engine.js — byline, instructions, the options menu and its two-click
// Clear button, the Rebus button, scroll-key forwarding, the localStorage
// save/restore/clear scaffolding, the shared keydown guard wrapper, the
// keyboard-shortcuts overlay, and the congrats dialog on solve. The solve-tracking cores
// (timer, completion latch, composer, board checker) live in engine-state.mjs; the
// tool-specific cores (SVG rendering, navigation, syncUI, per-cell answer checking) stay
// in each engine. Each engine imports what it needs and calls these from inside its own
// init(); shared/build/engineBundle.js bundles them into the page script. node:test
// requires the ones tested via mocks (shared/test/engine-chrome.*.test.js).

// Browser-only: create an SVG-namespaced element and apply an attribute map (setAttribute
// coerces each value to a string). Every engine builds SVG nodes this way.
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Browser-only: svgEl's HTML counterpart, plus children, so a nested call reads like the
// markup it builds. String children become text nodes, never parsed HTML. A boolean
// attribute (hidden, autofocus) is present with any value, so pass ''.
function htmlEl(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

// Browser-only: a clue's `.clue-text` span. `clue` is pre-rendered markdown HTML
// (shared/build/renderMarkdown.js), so it alone goes in through innerHTML; an engine
// never does that with any other YAML string (root CLAUDE.md).
function clueTextEl(clue) {
  const el = htmlEl('span', { class: 'clue-text' });
  el.innerHTML = clue;
  return el;
}

// Browser-only: calls handler(e) on a click in a clue — a clue list's item or group, the
// phone's clue lists or its bar — except on a link inside the clue, which opens on its
// own without also moving the cursor, and on the phone list view's cells (setupFillList),
// which place the cursor themselves. The rest of their row, which runs on past a short
// entry's last cell, is the clue's. `capture` listens in the capture phase.
function onClueClick(el, handler, { capture = false } = {}) {
  el.addEventListener('click', e => { if (!e.target.closest('a, .list-cell')) handler(e); }, capture);
}

// author + date → `.byline`. Missing pieces are simply omitted; with neither, the byline
// is hidden, since even empty it would add its margin under the title.
function renderByline(data) {
  const byline = document.querySelector('.byline');
  if (!byline) return;
  const parts = [];
  if (data.author) parts.push('by ' + data.author);
  if (data.date) parts.push(String(data.date));
  byline.textContent = parts.join(' · ');
  byline.hidden = parts.length === 0;
}

// Injects the pre-rendered instructions HTML into `#instructions`, revealed
// (hidden=false) only when content exists. `data.instructions` is block-level markdown
// HTML rendered at build time (renderInstructionsMarkdown), so this only ever injects
// trusted HTML, never author text directly.
function renderInstructions(data) {
  const el = document.getElementById('instructions');
  if (!data.instructions || !el) return;
  el.innerHTML = data.instructions;
  el.hidden = false;
}

// Two-click arm/disarm Clear button. First click swaps the label to "Are you sure?" and
// adds `.armed` for 3s; a second click within that window calls onConfirmed(), which each
// engine supplies to perform the full in-memory board reset. `refocus` (optional)
// restores puzzle focus after the arming click so the document keydown BUTTON guard
// doesn't block the next keystroke.
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
// otherwise the only way into composition. Some Android IMEs report keyCode 229 / key
// 'Unidentified' for composition-routed keys, leaving rebus cells unreachable there.
//
// Never disabled, never hidden, identical in hashed and non-hashed builds. That is the
// spoiler rule from docs/CROSS_TOOL_SPEC.md → Enter — rebus entry: nothing in the UI may
// vary as a function of a cell's capacity. #check-btn sits next to this one in #controls
// and *is* toggled per-cell — do not copy it here.
//
// A solved board needs no guard here: composer.toggle refuses composition once the board
// is solved, whichever way it is reached.
//
//   onToggle()    → the engine's toggleRebus (composer.toggle, then syncUI)
//   isComposing() → composer.isComposing(activeCell)
//   refocus()     → restore hidden-input focus (optional)
function setupRebusButton(btn, { onToggle, isComposing, refocus }) {
  // Idempotent: sync() runs from every syncUI(), i.e. on every keystroke and cursor move,
  // and assigning textContent replaces the text node even when the string is unchanged.
  // The guard also makes the extra sync() in the click handler free.
  function sync() {
    const want = isComposing() ? 'Done' : 'Rebus';
    if (btn.textContent !== want) btn.textContent = want;
  }

  // Focus-on-click is a `mousedown` default action, so canceling mousedown keeps focus
  // on the hidden input, where setupKeydown's BUTTON guard won't drop the next key, while
  // `click` still fires and keeps the button reachable by keyboard. (In the phone layout
  // #solve-view's own mousedown cancel covers this button as well.)
  //
  // It must be mousedown and not pointerdown. On a WebKit (iOS) touch tap, canceling
  // pointerdown suppresses the click entirely and the button never fires at all;
  // canceling mousedown does not. Chromium fires click either way, so no Chromium-only
  // test can catch a regression here — `shared/test/engine-chrome.rebus-button.test.js`
  // asserts structurally that no pointerdown listener exists.
  btn.addEventListener('mousedown', e => e.preventDefault());

  btn.addEventListener('click', e => {
    // setupKeydown returns early on any meta/ctrl chord, so Cmd+Enter cannot open
    // composition; a modified click must match or the two entry points diverge.
    if (e && (e.metaKey || e.ctrlKey)) return;
    onToggle();
    sync();
    // See docs/CROSS_TOOL_SPEC.md → Focus management; parking focus on the button would
    // also leave setupKeydown's BUTTON guard set.
    if (refocus) refocus();
  });

  sync();
  return { sync };
}

// Page-scroll deltas for keys the puzzles don't otherwise consume. Because the hidden
// input holds focus, the browser suppresses native scrolling for these, so the engines
// forward them here. Arrow = one nudge; Page = ~one viewport.
const SCROLL_DELTAS = {
  ArrowUp:   () => -80,
  ArrowDown: () =>  80,
  PageUp:    () => -window.innerHeight * 0.9,
  PageDown:  () =>  window.innerHeight * 0.9,
};

// Scrolls the page for a forwarded scroll key. Returns true when `key` is a scroll key
// (and the scroll was performed), false otherwise — so a caller that first tries cell
// navigation (e.g. Marching Bands) can fall through to this only when there is no in-grid
// target.
function scrollByKey(key) {
  const delta = SCROLL_DELTAS[key];
  if (!delta) return false;
  window.scrollBy({ top: delta(), behavior: 'auto' });
  return true;
}

// The fixed active-clue bar (docs/CROSS_TOOL_SPEC.md → "Active-clue banner"). show() puts
// the active entry on the first row and the entry crossing the active cell on the second,
// or hides that row when `crossing` is null. Each is { dir, num, clue }: `dir` is the
// direction label, for a tool whose rows carry one; `clue` is pre-rendered markdown HTML,
// set with innerHTML as in clueTextEl. The bar's height is fixed (shared/base.css), so
// hiding the row moves nothing. `el` is the bar and `text` the first row's clue text,
// which the phone layout takes (setupPhoneLayout's `clueBar`).
function setupClueBar() {
  const row = id => {
    const el = document.getElementById(id);
    const part = cls => el.querySelector('.active-clue-' + cls);
    return { el, dir: part('dir'), num: part('num'), text: part('text') };
  };
  const primary = row('active-clue-primary'), secondary = row('active-clue-secondary');
  function fill(r, { dir, num, clue }) {
    if (r.dir) r.dir.textContent = dir;
    r.num.textContent = num + '.';
    r.text.innerHTML = clue;
  }
  return {
    el: document.getElementById('active-clue-bar'),
    text: primary.text,
    show(main, crossing) {
      fill(primary, main);
      if (crossing) fill(secondary, crossing);
      secondary.el.hidden = !crossing;
    },
  };
}

// The class on <html> that marks the phone solving view (setupPhoneLayout in
// shared/engine-phone.mjs, which adds it).
const PHONE_CLASS = 'phone';

// Scrolls a clue into view clear of `pinned`, the sticky grid box. scrollIntoView judges
// visibility against the bare viewport, so a clue scrolled up behind a pinned box counts
// as visible and never moves. Where the box sits over the clue's column, its height is
// reserved as scroll padding: its sticky `top` plus its live height — read via
// getBoundingClientRect().height, not .bottom, which is the in-flow position until the
// box sticks. Recomputed on every scroll: the height varies by puzzle and at runtime
// (#done-wrong), and whether the box is over the clues varies by layout (Marching Bands'
// grid stands beside them when wide).
function scrollIntoViewBelow(clue, pinned) {
  // The phone layout's page never scrolls itself, and nothing in it is pinned. Its list
  // view scrolls only inside its own pane (scrollWithin in shared/engine-phone.mjs).
  if (document.documentElement.classList.contains(PHONE_CLASS)) return;
  const box = pinned.getBoundingClientRect(), r = clue.getBoundingClientRect();
  const over = box.left < r.right && r.left < box.right;
  document.documentElement.style.scrollPaddingTop =
    over ? (parseFloat(getComputedStyle(pinned).top) + box.height) + 'px' : '';
  clue.scrollIntoView({ block: 'nearest' });
}

// The auto-save localStorage key: the tool's prefix and the puzzle's board hash, which
// every page carries. A republished puzzle with new answers has a new hash and starts
// fresh, where an old save would put letters and marks on cells that changed. The hash
// covers a board's letters, not always its shape (a Crushword's leaves out where the
// blocks are), so two boards can share a key; setupStorage's `fits` keeps each from
// restoring the other's save.
function storageKey(prefix, data) {
  return 'vp:' + prefix + ':' + data.boardHash;
}

// Flash a cell red to signal a wrong guess without disturbing the cell's own fill or
// active-state styling. Clones the cell element into `flashLayer` — an overlay <g> the
// engines paint above the cells but below the letters — relabels the clone
// `.flash-wrong-overlay` (whose base.css animation fades it out), then removes it once
// the animation ends. FLASH_WRONG_MS must match that animation's duration in
// shared/base.css.
const FLASH_WRONG_MS = 600;
function flashWrong(cellEl, flashLayer) {
  const flashEl = cellEl.cloneNode(false);
  flashEl.removeAttribute('id');
  flashEl.setAttribute('class', 'flash-wrong-overlay');
  flashLayer.appendChild(flashEl);
  setTimeout(() => flashEl.remove(), FLASH_WRONG_MS);
}

// The auto-save payload's schema version. A rebuilt page with unchanged answers keeps its
// storageKey, so a newer engine can meet an older save: bump this when the payload's
// shape changes incompatibly, and restoreState ignores older saves. A new optional field
// needs no bump if restore treats its absence as the old behavior (as activeMs and
// composing do).
const SAVE_VERSION = 1;

// localStorage save/restore/clear under the puzzle's storageKey. The tool supplies the
// payload (its letters and correct cells from makeCellStore, plus timer and composer):
//   getState()        → the tool's payload, saved under { v: SAVE_VERSION, ... }
//   fits(saved)       → whether a saved payload is for this board (makeCellStore's
//                       fitsSave)
//   applyState(saved) → applies a saved payload whose version matches and that fits
// hasSave() says whether there is such a payload to apply.
// Storage errors (a private window, a full quota) are swallowed: the puzzle still works,
// it just doesn't save.
function setupStorage(key, { getState, fits, applyState }) {
  function saveState() {
    try {
      localStorage.setItem(key, JSON.stringify({ v: SAVE_VERSION, ...getState() }));
    } catch (_) {}
  }
  function readSave() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch (_) {}
    return saved && saved.v === SAVE_VERSION && fits(saved) ? saved : null;
  }
  function restoreState() {
    const saved = readSave();
    if (saved) applyState(saved);
  }
  function clearState() {
    try { localStorage.removeItem(key); } catch (_) {}
  }
  return { saveState, restoreState, clearState, hasSave: () => readSave() !== null };
}

// Wraps a tool's keydown handler with the guards shared by every engine: hasFocus,
// Cmd+Arrow history navigation, generic Cmd/Ctrl passthrough, BUTTON focus skip, and
// keys-overlay open. The tool-specific handler receives the event only when all guards
// pass.
//
// A click on plain page content (the title, the instructions) leaves focus on <body>.
// Keys still reach this document listener, but a typed letter arrives only as the hidden
// input's own input event, so it would be lost. Refocusing here, during keydown, lets
// the browser deliver that same keystroke to the input.
function setupKeydown(handler, { keysOverlay, refocus }) {
  document.addEventListener('keydown', e => {
    if (!document.hasFocus()) return;
    if (keysOverlay && keysOverlay.open) return;
    if (e.metaKey && e.key === 'ArrowLeft') { history.back(); return; }
    if (e.metaKey && e.key === 'ArrowRight') { history.forward(); return; }
    if (e.metaKey || e.ctrlKey) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    if (!document.activeElement || document.activeElement === document.body) refocus();
    handler(e);
  });
}

// Routes a click on any board cell to handler(n), where n is the cell's number from its
// `cell-{n}` id (docs/CROSS_TOOL_SPEC.md → SVG element IDs). One listener on the <svg>
// serves every cell, so building the board attaches no behavior. Letters, numbers,
// circles and the chevron are `pointer-events: none`, so a click lands on the .cell
// beneath them; anything else (the background, a black square) is ignored.
function setupCellClicks(svg, handler) {
  svg.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (cell) handler(Number(cell.id.slice('cell-'.length)));
  });
}

// Formats elapsed milliseconds as M:SS (e.g. 154321 → "2:34").
function formatMs(ms) {
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Builds the solve-celebration modal from the supplied callbacks and metadata. Creates a
// native <dialog id="congrats-dialog"> appended to <body>, opened via showModal() so the
// page is inert (matching the keys overlay pattern). Returns { open(timeMs) }, which the
// engine hands setupSolveTracking as onComplete, so it opens on each solve. Backdrop
// click and Escape close without resetting; Play again closes + resets.
function setupCongratsDialog({ title, date, onPlayAgain }) {
  const timeEl  = htmlEl('p', { id: 'congrats-time' });
  const copyBtn = htmlEl('button',
    { id: 'congrats-copy-btn', type: 'button' }, 'Copy result');
  const viewBtn = htmlEl('button',
    { id: 'congrats-view-btn', type: 'button' }, 'View puzzle');
  const playBtn = htmlEl('button',
    { id: 'congrats-play-btn', type: 'button', autofocus: '' }, 'Play again');
  const dialog  = htmlEl('dialog',
    { id: 'congrats-dialog', 'aria-label': 'Puzzle solved' },
    htmlEl('div', { id: 'congrats' },
      htmlEl('p', { id: 'congrats-msg' }, 'Puzzle solved!'),
      timeEl,
      htmlEl('div', { id: 'congrats-actions' }, copyBtn, viewBtn, playBtn)));
  document.body.appendChild(dialog);

  // View puzzle, and a backdrop click (target is the transparent dialog frame, not the
  // card), close it on the solved board.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  viewBtn.addEventListener('click', () => dialog.close());

  let copyText = '';
  // navigator.clipboard exists only in secure contexts (not on plain http://), and
  // writeText can be refused, so the label reports what actually happened.
  copyBtn.addEventListener('click', async () => {
    let copied = false;
    try {
      await navigator.clipboard.writeText(copyText);
      copied = true;
    } catch (_) {}
    copyBtn.textContent = copied ? 'Copied!' : "Couldn't copy";
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

// Builds and wires the keyboard-shortcuts modal from a list of [keys, description] pairs
// (the only part that differs between tools). Creates the #keys-btn trigger (fixed
// bottom-right corner) and a native <dialog id="keys-overlay"> holding the #keys-modal
// card, both appended to <body>. Returns the <dialog> for setupKeydown's keysOverlay
// guard (which checks .open).
//
// Opens on button click or ? keypress via showModal(), which moves focus into the dialog,
// traps Tab inside it, makes the rest of the page inert, and paints the ::backdrop dim in
// the top layer — all behaviors the platform gives for free. Closes on close-button
// click, backdrop click, or Escape (native). Puzzle focus returns via the browser's
// native dialog focus-restoration: `open()` focuses the grid input just before
// showModal(), making it the recorded restore target, so every close path lands focus
// there with no explicit close handler.
function setupKeysOverlay(shortcuts, refocus) {
  const btn = htmlEl('button',
    { id: 'keys-btn', type: 'button', 'aria-label': 'Keyboard shortcuts' }, '?');
  document.body.appendChild(btn);

  // showModal() focuses the autofocus close button, parking keystrokes off the grid.
  const closeBtn = htmlEl('button',
    { id: 'keys-close', type: 'button', autofocus: '', 'aria-label': 'Close' }, '✕');
  // <dialog> carries the dialog/aria-modal semantics implicitly when shown via
  // showModal(); it is a transparent frame, and #keys-modal is the visible card.
  const dialog = htmlEl('dialog',
    { id: 'keys-overlay', 'aria-label': 'Keyboard shortcuts' },
    htmlEl('div', { id: 'keys-modal' },
      htmlEl('div', { id: 'keys-modal-header' },
        htmlEl('span', {}, 'Keyboard shortcuts'),
        closeBtn),
      htmlEl('table', {}, ...shortcuts.map(([keys, desc]) =>
        htmlEl('tr', {},
          htmlEl('td', {}, htmlEl('kbd', {}, keys)),
          htmlEl('td', {}, desc))))));
  document.body.appendChild(dialog);

  // Focus the puzzle before opening so the input becomes the dialog's recorded
  // focus-restore target; the browser's native restoration then returns focus there on
  // every close path (Escape, ✕, backdrop, ? toggle). Without this, restoration would
  // return focus to the trigger button, briefly stranding the next keystroke off the
  // grid.
  const open  = () => { refocus(); dialog.showModal(); };
  const close = () => dialog.close();

  btn.addEventListener('click', () => dialog.open ? close() : open());
  closeBtn.addEventListener('click', close);
  // A click whose target is the dialog itself landed on the ::backdrop — clicks on the
  // #keys-modal card target the card or its children, so they don't close.
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

// Builds and wires the options menu: a fixed top-right hamburger trigger (#menu-btn) and
// a non-modal dropdown (#menu-panel) holding the Check Cell visibility toggle and the
// Clear button: the shared home for rarely-used puzzle-wide options. Unlike
// setupKeysOverlay's <dialog>, the panel is a plain div — it never makes the page inert,
// so the grid stays clickable behind it.
//
// Clicks inside the panel never close it on their own. That is what lets #clear-btn's
// existing two-click arm/confirm sequence (setupClearButton) play out with the panel
// visibly open through the 3s "Are you sure?" window, instead of vanishing after the
// first (arming) click. Closing — by re-clicking the trigger, clicking outside, or Escape
// — calls `refocus`, matching every other control that can steal focus from the hidden
// input (see docs/CROSS_TOOL_SPEC.md → Focus management).
//
// Returns { clearBtn, close, checkBtnToggle, checkBtnToggleLabel } for setupControls to
// wire.
function setupOptionsMenu(refocus) {
  const btn = htmlEl('button', {
    id: 'menu-btn', type: 'button', 'aria-label': 'Menu',
    'aria-haspopup': 'true', 'aria-expanded': 'false',
  }, '☰');
  document.body.appendChild(btn);

  // The Check Cell toggle is only meaningful in non-hashed puzzles — the caller hides
  // checkBtnToggleLabel entirely (not just the checkbox) when hashed, since there's no
  // Check Cell button there to control. It sits above Clear Puzzle: a plain display
  // setting before the destructive action.
  const { label: checkBtnToggleLabel, input: checkBtnToggle } =
    menuToggle('check-btn-toggle', 'Show Check Cell button');
  const clearBtn = htmlEl('button', { id: 'clear-btn', type: 'button' }, 'Clear Puzzle');
  const panel = htmlEl('div', { id: 'menu-panel', role: 'menu', hidden: '' },
    checkBtnToggleLabel, clearBtn);
  document.body.appendChild(panel);

  const { close } = setupPopupMenu(btn, panel, refocus);
  return { clearBtn, close, checkBtnToggle, checkBtnToggleLabel };
}

// A non-modal dropdown: `btn` opens and closes `panel`, and a click outside both, Escape
// or any key the puzzle takes closes it. Two such menus close each other, since a click
// on one's trigger is outside the other. Returns { close }.
function setupPopupMenu(btn, panel, refocus) {
  function isOpen() { return !panel.hidden; }

  function close() {
    if (!isOpen()) return;
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    refocus();
  }

  // Focus goes back to the puzzle on opening too: the menu isn't modal, and the button
  // keeping focus would make setupKeydown drop every key while it's open.
  function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    refocus();
  }

  btn.addEventListener('click', () => (isOpen() ? close() : open()));

  // A click on the trigger is excluded here because its own listener above already
  // handled it (bubbling reaches this one after), and a click inside the panel (e.g.
  // arming Clear) must never close the menu out from under it.
  document.addEventListener('click', e => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    close();
  });

  // Escape closes it, and so does any key the puzzle takes: typing means the solver is
  // done with the menu, as a click outside it does. A bare modifier or a ⌘/Ctrl shortcut
  // isn't typing.
  const MODIFIERS = ['Shift', 'Alt', 'Meta', 'Control', 'CapsLock'];
  document.addEventListener('keydown', e => {
    if (!isOpen() || MODIFIERS.includes(e.key) || e.metaKey || e.ctrlKey) return;
    close();
  });

  return { close };
}

// An options-menu row: a checkbox `id` inside a `.menu-toggle` label `id`-label. Returns
// { label, input } for the caller to place and wire.
function menuToggle(id, text) {
  const input = htmlEl('input', { type: 'checkbox', id });
  const label = htmlEl('label', { id: id + '-label', class: 'menu-toggle' }, input, ' ' + text);
  return { label, input };
}

// A solver's display preference: one boolean in localStorage under `prefKey`, `fallback`
// when absent or unreadable. Not built on setupStorage(), whose board payload is
// meaningless for a single boolean. Storage errors are swallowed as setupStorage's are.
// `storage` defaults to localStorage, looked up inside the guard: a sandboxed frame
// throws on merely reading it.
function boolPref(prefKey, fallback, storage) {
  const store = () => storage || localStorage;
  function load() {
    try {
      const v = JSON.parse(store().getItem(prefKey));
      return typeof v === 'boolean' ? v : fallback;
    } catch (_) { return fallback; }
  }
  function save(b) {
    try { store().setItem(prefKey, JSON.stringify(b)); } catch (_) {}
  }
  return { load, save };
}

// The Check Cell button's visibility (boolPref) — namespaced under the puzzle's own key
// (see storageKey) but never touched by clearState()/resetBoard(): it's a display
// preference, not board state, so Clear Puzzle must not reset it. Absent (first load)
// defaults to visible.
function setupCheckBtnPref(key) {
  return boolPref(key + ':showCheckBtn', true);
}

// Wires #check-btn and the options menu around it, identically in every engine:
//   - #check-btn is hidden in hashed builds (the plain-text answer never ships there, so
//     there is nothing to check against) and calls `onCheck` otherwise.
//   - Clear arms/confirms through setupClearButton; once actually confirmed (not just
//     armed) it runs `onClear` and closes the menu on the solver's behalf.
//   - The "Show Check Cell button" row is hidden in hashed builds; otherwise it applies
//     the persisted preference and keeps it in sync. The preference hides #check-btn
//     with the .check-btn-off class, not `hidden`, so the button keeps its place in the
//     row (why in base.css).
// `key` is the same storageKey(...) result the engine passes to setupStorage.
// `canCheck(n)` says whether cell n may be checked; it defaults to checker.canCheck, and
// only Crushword, whose every typed cell is composing until committed, passes its own.
// Returns { syncCheckBtn(n) } for syncUI: it enables #check-btn only while canCheck
// accepts cell n (and does nothing in a hashed build, where the button is hidden).
function setupControls({
  checkBtn, checker, hashed, onCheck, onClear, refocus, key, canCheck = n => checker.canCheck(n),
}) {
  const { clearBtn, close, checkBtnToggle, checkBtnToggleLabel } = setupOptionsMenu(refocus);
  setupClearButton(clearBtn, () => { onClear(); close(); }, refocus);

  if (hashed) {
    checkBtn.hidden = true;
    checkBtnToggleLabel.hidden = true;
    return { syncCheckBtn() {} };
  }
  checkBtn.addEventListener('click', onCheck);
  const checkBtnPref = setupCheckBtnPref(key);
  const show = visible => checkBtn.classList.toggle('check-btn-off', !visible);
  checkBtnToggle.checked = checkBtnPref.load();
  show(checkBtnToggle.checked);
  checkBtnToggle.addEventListener('change', () => {
    show(checkBtnToggle.checked);
    checkBtnPref.save(checkBtnToggle.checked);
    refocus(); // a click on the label focuses the checkbox (CROSS_TOOL_SPEC → Focus management)
  });
  return { syncCheckBtn(n) { checkBtn.disabled = !canCheck(n); } };
}

// Posts the page height to an embedding parent whenever it changes
// (docs/CROSS_TOOL_SPEC.md -> "Embedding — auto-sizing"); does nothing when the page
// isn't framed or ResizeObserver is missing. Height isn't sensitive, so '*' is fine.
// The phone layout adds `fill: true`: its view is one screen of the frame high, so the
// frame can't take its height from the page and must be one screen of the host high.
// DOM-coupled, tested via mocks.
function setupEmbedResize({ win = window, root = document.documentElement, RO = win.ResizeObserver } = {}) {
  if (!win.parent || win.parent === win || !RO) return null;
  let last = -1;
  const ro = new RO(() => {
    // The root's own box height, not scrollHeight: scrollHeight is never below the
    // iframe's viewport, so a page that shrank after the host sized the frame would read
    // as unchanged.
    const height = Math.ceil(root.getBoundingClientRect().height);
    if (height === last) return;
    last = height;
    const msg = { type: 'varietypack:resize', height };
    if (root.classList.contains(PHONE_CLASS)) msg.fill = true;
    win.parent.postMessage(msg, '*');
  });
  ro.observe(root);
  return ro;
}

export {
  svgEl, htmlEl, clueTextEl, onClueClick, renderByline, renderInstructions, setupClearButton, setupRebusButton,
  setupPopupMenu,
  scrollByKey, setupClueBar, scrollIntoViewBelow, storageKey, setupStorage, flashWrong, FLASH_WRONG_MS,
  setupKeydown, setupCellClicks, setupCongratsDialog, setupKeysOverlay, setupOptionsMenu,
  menuToggle, boolPref, setupControls, setupEmbedResize, PHONE_CLASS,
};
