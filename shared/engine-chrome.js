// Shared browser-engine "chrome": the UI-surround logic that is identical across
// every puzzle tool's engine.js — byline, instructions, the two-click Clear
// button, scroll-key forwarding, the localStorage save/restore/clear scaffolding,
// the shared keydown guard wrapper, and the congrats-overlay dismiss handlers.
// Each engine calls these from inside its own init(); the tool-specific cores
// (SVG rendering, navigation, syncUI, answer checking) stay in the engine.
// Injected into the HTML bundle as browser globals by getSharedBundle(); the
// dual-mode guard at the bottom keeps the pattern consistent with the other
// shared/ files even though no Node code requires it.

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
// adds `.armed` for 3s; a second click within that window calls clearState()
// and reloads. `refocus` (optional) restores puzzle focus after the arming
// click so the document keydown BUTTON guard doesn't block the next keystroke.
function setupClearButton(clearBtn, clearState, refocus) {
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
      clearState();
      location.reload();
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
// Cmd/Ctrl+Arrow history navigation, generic Cmd/Ctrl passthrough, and BUTTON
// focus skip. The tool-specific handler receives the event only when all guards
// pass.
function setupKeydown(handler) {
  document.addEventListener('keydown', e => {
    if (!document.hasFocus()) return;
    if (e.metaKey && e.key === 'ArrowLeft') { history.back(); return; }
    if (e.metaKey && e.key === 'ArrowRight') { history.forward(); return; }
    if (e.metaKey || e.ctrlKey) return;
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    handler(e);
  });
}

// Wires the two congrats-overlay dismiss paths: backdrop click and Escape key.
// Calls `onDismiss` on either; the engine sets its congratsDismissed flag and
// restores focus there.
function setupCongratsOverlay(overlay, onDismiss) {
  function dismiss() {
    overlay.hidden = true;
    onDismiss();
  }
  overlay.addEventListener('click', e => {
    if (e.target === overlay) dismiss();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) dismiss();
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    renderByline, renderInstructions, setupClearButton,
    scrollByKey, storageKey, setupStorage, flashWrong,
    setupKeydown, setupCongratsOverlay,
  };
}
