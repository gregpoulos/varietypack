// Shared phone solving layout (docs/CROSS_TOOL_SPEC.md → "Phone layout and drawn
// keyboard"): on a touch-first device, the grid, the active clue and a drawn keyboard
// share one screen-high view below the page header, and the phone's own keyboard never
// opens. Each engine calls setupPhoneLayout from its init() with its own elements and
// bottom keyboard row; on any other device it does nothing. node:test requires the parts
// tested via mocks (shared/test/engine-phone.test.js).

import {
  FLASH_WRONG_MS, PHONE_CLASS, boolPref, htmlEl, menuToggle, onClueClick, svgEl,
} from './engine-chrome.mjs';

// Detection is by the main input method, not by width, so tablets get the phone layout
// and a narrow desktop window doesn't.
const TOUCH_FIRST = '(hover: none) and (pointer: coarse)';

function isTouchFirst(win = window) {
  return win.matchMedia(TOUCH_FIRST).matches;
}

// Scrolls `container` the least distance that brings `el` wholly into view, writing
// nothing when it already is; an `el` taller than the container shows its top. Only
// ever container.scrollTop: the page itself never scrolls in the phone layout. Both
// rects come from getBoundingClientRect, so it works whatever lies between the two.
function scrollWithin(container, el) {
  const box = container.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (r.top < box.top) container.scrollTop -= box.top - r.top;
  else if (r.bottom > box.bottom) container.scrollTop += Math.min(r.bottom - box.bottom, r.top - box.top);
}

// The index `d` steps from `i` in a list of `n`, wrapping at both ends: Marching Bands'
// clue navigator, whose ‹ › cycle through a row's or band's clues.
function stepIndex(i, n, d) {
  return (i + d + n) % n;
}

// A triangle pointing `dir`, drawn so all four arrows are the same size and colored by
// the key's text (fill: currentColor).
const ARROW_TURN = { up: 0, right: 90, down: 180, left: 270 };
function arrowIcon(dir) {
  const svg = svgEl('svg', { viewBox: '0 0 10 10', class: 'kb-arrow', 'aria-hidden': 'true' });
  svg.append(svgEl('path', {
    d: 'M5,1.5 L9.5,8.5 L0.5,8.5 Z', transform: `rotate(${ARROW_TURN[dir]} 5 5)`,
  }));
  return svg;
}

// The drawn keyboard: a letter layer and a digit layer, built once and swapped with
// `hidden`, above the tool's bottom row. Every layer has the same number of rows, and
// each row a fixed height (base.css), so switching layers never resizes the grid. The
// bottom row is built once too: it holds moved buttons with their own listeners.
//   bottomRow, each item one of:
//     { label, key, wide?, ariaLabel? }   a synthetic key (setupPhoneLayout says why)
//     { label, onTap, wide?, ariaLabel? } a key that calls the engine directly, for an
//                                         action no real key has (Marching Bands' Prev /
//                                         Next cell). It bypasses setupKeydown, so onTap
//                                         does its own solved-board check.
//     { el, label? }                      an existing button moved in, relabeled if given
//   `wide` makes the switch key widest. `arrow` ('left' | 'up' | 'down' | 'right') draws a
//   triangle in place of `label`, so it needs an `ariaLabel`: the triangle characters
//   differ in size from font to font.
function buildKeyboard(bottomRow) {
  const row = (...keys) => htmlEl('div', { class: 'kb-row' }, ...keys);
  const chars = s => [...s].map(ch => htmlEl('button', { type: 'button', 'data-char': ch }, ch));
  const backspace = () => htmlEl('button',
    { type: 'button', class: 'kb-mod', 'data-key': 'Backspace', 'aria-label': 'Backspace' }, '⌫');
  const layerKey = label => htmlEl('button', { type: 'button', class: 'kb-mod', 'data-layer': '' }, label);

  const letters = htmlEl('div', { class: 'kb-layer' },
    row(...chars('QWERTYUIOP')),
    row(...chars('ASDFGHJKL')),
    row(layerKey('123'), ...chars('ZXCVBNM'), backspace()));
  const digits = htmlEl('div', { class: 'kb-layer', hidden: '' },
    row(...chars('1234567890')),
    row(),
    row(layerKey('ABC'), htmlEl('span', { class: 'kb-spacer' }), backspace()));

  const bottom = row(...bottomRow.map(item => {
    if (item.el) {
      if (item.label !== undefined) item.el.textContent = item.label;
      return item.el;
    }
    const attrs = { type: 'button' };
    if (item.key !== undefined) attrs['data-key'] = item.key;
    if (item.shift) attrs['data-shift'] = '';
    if (item.ariaLabel) attrs['aria-label'] = item.ariaLabel;
    if (item.wide) attrs.class = 'kb-wide';
    const btn = htmlEl('button', attrs, item.arrow ? arrowIcon(item.arrow) : item.label);
    if (item.onTap) btn.addEventListener('click', item.onTap);
    return btn;
  }));
  bottom.classList.add('kb-bottom');

  return { keyboard: htmlEl('div', { id: 'drawn-kb' }, letters, digits, bottom), letters, digits };
}

// A clue cut off at the bar's two lines shows in full on a tap, in #clue-full over the
// bar row and the foot of the grid, until the next tap anywhere or a change of clue.
// Stopping that tap keeps it from the bar's own handler (a switch of direction), which
// a tap on a clue that fits still reaches. Returns showingClue(entry), which the engine
// calls wherever it writes the bar, with the entry whose clue it shows: syncUI rewrites
// the same clue on every call, so only a different entry closes it. An entry, not its
// text, since two clues can read the same.
function setupClueExpand(barRow, clueText, win) {
  const full = htmlEl('div', { id: 'clue-full', hidden: '' });
  barRow.append(full);
  let current = null; // the entry the bar shows
  let opened = null;  // the entry the full clue shows
  onClueClick(clueText, e => {
    if (clueText.scrollHeight <= clueText.clientHeight + 1) return;
    e.stopPropagation();
    opened = current;
    full.replaceChildren(...Array.from(clueText.childNodes, n => n.cloneNode(true)));
    full.hidden = false;
  });
  // Capture phase, so the tap that opens it finds it still closed.
  win.document.addEventListener('click', () => { full.hidden = true; }, true);
  return function showingClue(entry) {
    current = entry;
    if (entry !== opened) full.hidden = true;
  };
}

// Builds the phone solving view and wires the drawn keyboard, on a touch-first device
// only; returns null anywhere else, having touched nothing. Called once from each
// engine's Event wiring, after setupControls (whose #menu-btn and #menu-panel it moves).
//   hiddenInput: #hidden-input
//   refocus:     the engine's refocus, for the options menu row fillList adds
//   grid:        the element holding the tool's SVG (moved as is)
//   lists:       the tool's clue-list elements in reading order (moved as is, so their
//                desktop and print layouts need no wrapper)
//   clueBar:     { el, text } for the bar row: the bar, and the element in it holding
//                the clue, clamped to two lines (base.css)
//   helpMenu:    { btn, panel } of the help menu setupControls built, or null (a hashed
//                page has none); moved into the top bar beside ☰
//   firstVisit:  nothing saved to restore, so the instructions show over the view
//   ownSteps:    the bar brings its own ‹ › and handles its own taps
//   fillList:    { items, getLetter, isCorrect, onCellTap, isComposing? } for a fill-in
//                list view (setupFillList), which also gets the "Wrap long rows of cells"
//                menu row (setupListWrapPref). Without it the list is plain, and the
//                drawn keyboard hides while the list is open.
//   onGridShown: called when the list closes and the grid shows again
//   bottomRow:   the keyboard's bottom row (buildKeyboard)
// Returns { listPane, hideList, fillList, showingClue }, `fillList` being
// setupFillList's { sync, flash } or null, and showingClue setupClueExpand's.
function setupPhoneLayout({
  hiddenInput, refocus, grid, lists, clueBar, helpMenu, firstVisit, ownSteps = false, fillList = null,
  onGridShown = () => {}, bottomRow, win = window,
}) {
  if (!isTouchFirst(win)) return null;
  const doc = win.document;

  doc.documentElement.classList.add(PHONE_CLASS);
  // Keeps the phone's own keyboard closed while #hidden-input holds focus, as every
  // engine needs it to; a hardware keyboard still types into it.
  hiddenInput.setAttribute('inputmode', 'none');

  // The header and instructions print, below the title wherever the template put them,
  // but on screen the top bar and the Clues screen show copies of them (base.css).
  const instructions = doc.getElementById('instructions');
  doc.querySelector('.puzzle-header').after(instructions);
  const instructionsCopy = cls => {
    if (instructions.hidden) return null;
    const copy = instructions.cloneNode(true);
    copy.removeAttribute('id');
    copy.className = cls;
    return copy;
  };

  // Top bar: the title over the byline, the Clues/Grid switch, the help menu, and the
  // options menu moved in from <body>.
  const byline = doc.querySelector('.byline');
  const head = htmlEl('div', { class: 'solve-head' },
    htmlEl('span', { class: 'solve-title' }, doc.querySelector('.title').textContent));
  if (byline && !byline.hidden) head.append(htmlEl('span', { class: 'solve-byline' }, byline.textContent));
  const cluesBtn = htmlEl('button', { id: 'clues-btn', type: 'button' }, 'Clues');
  // The done-wrong banner, shown when the board is full but wrong, lies over the title
  // (base.css): there it hides no cell and no clue, which the solver now needs to check.
  const headSlot = htmlEl('div', { class: 'solve-head-slot' }, head, doc.getElementById('done-wrong'));
  const top = htmlEl('div', { class: 'solve-top' },
    headSlot, cluesBtn, ...(helpMenu ? [helpMenu.btn] : []), doc.getElementById('menu-btn'),
    ...(helpMenu ? [helpMenu.panel] : []), doc.getElementById('menu-panel'));

  // Stage: the grid pane, or the list pane in its place. The grid goes in a div because
  // Crushword's is the <svg> itself, which has no `hidden` property.
  const gridPane = htmlEl('div', { id: 'grid-pane' }, grid);
  const listPane = htmlEl('div', { id: 'list-pane', hidden: '' }, ...lists);
  const listInstructions = instructionsCopy('list-instructions');
  if (listInstructions) listPane.prepend(listInstructions);
  const stage = htmlEl('div', { id: 'solve-stage' }, gridPane, listPane);

  const { keyboard, letters, digits } = buildKeyboard(bottomRow);

  // Drawn keys reach the engine the way real keys do: a letter as the hidden input's
  // `input` event, which is how a typed letter arrives, and every other key as a keydown
  // on document, which setupKeydown handles. That keeps one input path and no second
  // copy of any tool's typing rules. A synthetic event has no default action, so a
  // dispatched Tab moves the cursor but never the focus. Only a key with no hardware
  // counterpart (an `onTap` item) calls the engine directly.
  function typeChar(ch) {
    hiddenInput.value = ch;
    hiddenInput.dispatchEvent(new win.Event('input', { bubbles: true }));
  }
  function press(key, shiftKey = false) {
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
  }

  keyboard.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const { char, key } = btn.dataset;
    if (char !== undefined) typeChar(char);
    else if (key !== undefined) press(key, btn.dataset.shift !== undefined);
    else if (btn.dataset.layer !== undefined) {
      letters.hidden = !letters.hidden;
      digits.hidden = !digits.hidden;
    }
  });

  // Bar row: the bar between ‹ › steps (Shift+Tab, Tab), where a tap on the clue
  // switches direction as `.` does — or the bar alone when it brings its own steps.
  const barRow = htmlEl('div', { id: 'solve-bar' });
  if (ownSteps) {
    barRow.append(clueBar.el);
  } else {
    const step = (id, label, ariaLabel, shiftKey) => {
      const btn = htmlEl('button', { id, type: 'button', class: 'bar-step', 'aria-label': ariaLabel }, label);
      btn.addEventListener('click', () => press('Tab', shiftKey));
      return btn;
    };
    barRow.append(step('clue-prev', '‹', 'Previous clue', true), clueBar.el,
      step('clue-next', '›', 'Next clue', false));
    onClueClick(clueBar.el, () => press('.'));
  }
  const showingClue = setupClueExpand(barRow, clueBar.text, win);

  const solveView = htmlEl('div', { id: 'solve-view' }, top, stage, barRow, keyboard);
  doc.querySelector('.puzzle-main').append(solveView);
  // On a first visit, the instructions over the whole view until a tap anywhere on them.
  const introText = firstVisit && instructionsCopy('intro-text');
  if (introText) {
    const intro = htmlEl('div', { id: 'intro' },
      htmlEl('div', { class: 'intro-card' }, introText, htmlEl('button', { type: 'button' }, 'Start')));
    intro.addEventListener('click', () => { intro.hidden = true; });
    solveView.append(intro);
  }

  // Focus never leaves #hidden-input on a tap anywhere in the view: canceling mousedown
  // cancels its default action, the focus change, while click still fires. Beyond the
  // phone's keyboard, this matters because setupKeydown ignores every key while a
  // BUTTON has focus, so a key that took focus on tap (Chromium's do) would swallow its
  // own synthetic keydown. Never pointerdown: see setupRebusButton.
  solveView.addEventListener('mousedown', e => e.preventDefault());

  // The list view: the list pane in the grid's place, with no bar row (and, for a plain
  // list, no keyboard). Opening it brings the active clue into view inside the pane, and
  // a fill-in list (setupFillList) keeps it in view as it changes.
  let wrapLabel = null;   // the menu's list-wrap row, shown only on the Clues screen
  function setListOpen(open) {
    gridPane.hidden = open;
    barRow.hidden = open;
    if (!fillList) keyboard.hidden = open;
    listPane.hidden = !open;
    if (wrapLabel) wrapLabel.hidden = !open;
    cluesBtn.textContent = open ? 'Grid' : 'Clues';
  }
  function isListOpen() { return !listPane.hidden; }
  function showList() {
    // Shown first: a hidden pane measures as all zeros, so it would never scroll.
    setListOpen(true);
    const active = listPane.querySelector('.active-clue');
    if (active) scrollWithin(listPane, active);
  }
  function hideList() {
    setListOpen(false);
    onGridShown();
  }
  cluesBtn.addEventListener('click', () => (isListOpen() ? hideList() : showList()));

  // The fill-in list's cell rows, and its menu row.
  let fill = null;
  if (fillList) {
    fill = setupFillList(fillList.items, { ...fillList, scroller: listPane });
    wrapLabel = setupListWrapPref(
      { root: doc.documentElement, panel: doc.getElementById('menu-panel'), refocus }).label;
    wrapLabel.hidden = !isListOpen();
  }

  return { listPane, hideList, fillList: fill, showingClue };
}

// The fill-in list view (Crushword, Spiral, Snake Charmer): under each clue, a row of its
// entry's cells showing what the solver has typed, where a tap puts the cursor.
//   items:     [{ li, cells }] in list order, `cells` the entry's cells in order, as
//              numbers the engine chooses (a board cell, or Snake Charmer's position
//              along the snake) and getLetter and sync's activeCell share
//   scroller:  the list pane
//   getLetter: n → cell n's content (uppercased here, as the grid shows it)
//   isCorrect: n → whether cell n has been checked correct (the grid's `.correct`)
//   isComposing: n → whether cell n is being composed as a rebus, which dashes the
//              cursor's outline as the grid's does; omitted by Crushword, whose grid
//              never dashes it, since every typed cell composes there
//   onCellTap: (itemIndex, cellIndex) → the engine makes that item's direction or loop
//              active and focuses the cell; a tap on the row never reaches the clue's
//              own click handler (onClueClick)
// Returns { sync(activeCell, activeLi, caretPos), flash(ids) }: sync is for syncUI,
// `activeLi` the active clue's item, and `caretPos`, for Crushword alone, the cursor's
// place among its cell's letters, drawn there as a `.list-caret` as the grid draws its
// own; flash(ids) flashes the cells with those ids, in every row holding them, as the
// grid's flashWrong does a wrong check, which the Clues screen would otherwise hide.
// A board cell sits in two items (two directions, or two loops), so it shows its letter
// in both, but the cursor is marked only in the active item. The active item's row is
// styled through its li's `.active-clue`. A tap on a cell reaches onCellTap alone because
// onClueClick (shared/engine-chrome.mjs) skips `.list-cell`; stopping the tap here
// instead would also keep it from the options menu's close-on-outside-click.
function setupFillList(items, { scroller, getLetter, isCorrect, isComposing = () => false, onCellTap }) {
  // One row per item. A cell's letter sits in an inner span, whose font scales with
  // the cell (base.css) and with the length of a rebus cell's content (--len).
  const letterEls = items.map(({ li, cells }, i) => {
    const letters = cells.map(() => htmlEl('span', { class: 'list-letter' }));
    const cellEls = letters.map((letter, j) => {
      const cell = htmlEl('span', { class: 'list-cell' }, letter);
      cell.addEventListener('click', () => onCellTap(i, j));
      return cell;
    });
    li.append(htmlEl('div', { class: 'list-cells' }, ...cellEls));
    return { letters, cellEls };
  });

  let lastActive = null; // the item sync last scrolled into view
  let lastCursor = null;  // the cursor's cell element at the last sync

  // The caret: an empty span between the text before and after the cursor, so a letter
  // element's textContent still reads as its letters. A cell whose letters change drops
  // it (sync sets textContent), and the caret is rebuilt after.
  const caret = htmlEl('span', { class: 'list-caret' });
  let caretHost = null, caretAt = -1;
  function placeCaret(host, pos) {
    if (caretHost && caretHost !== host && caretHost.contains(caret)) {
      const text = caretHost.textContent;
      caretHost.textContent = text;
    }
    caretHost = host;
    if (!host || (host.contains(caret) && caretAt === pos)) return;
    const text = host.textContent;
    host.replaceChildren(text.slice(0, pos), caret, text.slice(pos));
    caretAt = pos;
  }

  function sync(activeCell, activeLi, caretPos) {
    // Letters and checked-correct marks in every row, the cursor in the active one.
    let cursor = null, cursorLetter = null, edited = false;
    items.forEach(({ li, cells }, i) => cells.forEach((n, j) => {
      const letter = getLetter(n).toUpperCase(), el = letterEls[i].letters[j];
      const active = li === activeLi;
      if (el.textContent !== letter) {
        el.textContent = letter;
        el.style.setProperty('--len', Math.max(1, letter.length));
        if (active) edited = true;
      }
      letterEls[i].cellEls[j].classList.toggle('correct', isCorrect(n));
      const isCursor = active && n === activeCell;
      letterEls[i].cellEls[j].classList.toggle('list-cursor', isCursor);
      letterEls[i].cellEls[j].classList.toggle('composing', isCursor && isComposing(n));
      if (isCursor) { cursor = letterEls[i].cellEls[j]; cursorLetter = el; }
    }));
    placeCaret(caretPos === undefined ? null : cursorLetter, caretPos);
    // Follows the active clue when it changes, and the cursor when it moves or the
    // clue's letters change (Crushword types into a cell without moving), which
    // scrollWithin leaves alone while it's in view. A sync that does none of these (a
    // refocus) leaves the list where the solver scrolled it. A hidden pane measures as
    // all zeros, so nothing scrolls until showList opens it, which scrolls to the
    // active clue itself.
    if (activeLi !== lastActive) {
      lastActive = activeLi;
      scrollWithin(scroller, activeLi);
    } else if (cursor && (cursor !== lastCursor || edited)) {
      scrollWithin(scroller, cursor);
    }
    lastCursor = cursor;
  }
  // The cells of the flash still running and the timer that ends it, so the next flash
  // can end it first: left pending, that timer would cut the new flash short on any cell
  // the two share.
  let flashing = [];
  let flashTimer = null;
  function endFlash() {
    clearTimeout(flashTimer);
    flashTimer = null;
    for (const el of flashing) el.classList.remove('flash-wrong');
    flashing = [];
  }
  function flash(ids) {
    const hit = new Set(ids);
    const els = [];
    items.forEach(({ cells }, i) => cells.forEach((n, j) => {
      if (hit.has(n)) els.push(letterEls[i].cellEls[j]);
    }));
    if (els.length === 0) return;
    // Off, one layout read, then on, so a second wrong check restarts the animation.
    endFlash();
    void els[0].offsetWidth;
    for (const el of els) el.classList.add('flash-wrong');
    flashing = els;
    flashTimer = setTimeout(endFlash, FLASH_WRONG_MS);
  }
  return { sync, flash };
}

// The options menu's "Wrap long rows of cells" checkbox: a clue's row of cells on the
// Clues screen wraps onto more lines when it is too long for one, or, unchecked, shrinks
// to stay on one (`list-nowrap` on <html>). A solver's preference for every puzzle, so
// its key names no puzzle. `panel` is #menu-panel; the row goes above Clear puzzle, a
// plain display setting before the destructive action. It changes nothing but the Clues
// screen, so the caller shows its label only there (`label.hidden`). `refocus` runs on
// each change, and on a pointer-driven focus: a tap on the label focuses the checkbox in
// Chromium, mousedown or not.
// Returns { pref, label }, `pref` being the preference's { load, save }.
const LIST_WRAP_KEY = 'vp:pref:listWrap';
function setupListWrapPref({ storage, root = document.documentElement, panel, refocus }) {
  const pref = boolPref(LIST_WRAP_KEY, true, storage);
  const { label, input } = menuToggle('list-wrap-toggle', 'Wrap long rows of cells');
  panel.insertBefore(label, panel.querySelector('#clear-btn'));
  const apply = on => root.classList.toggle('list-nowrap', !on);
  input.checked = pref.load();
  apply(input.checked);
  input.addEventListener('change', () => {
    apply(input.checked);
    pref.save(input.checked);
    refocus();
  });
  // A browser may focus the checkbox only after `change` has run (WebKit on Linux does),
  // so refocusing there is not enough. A tap's focus is not :focus-visible; a keyboard
  // user's is, and keeps it.
  input.addEventListener('focus', () => { if (!input.matches(':focus-visible')) refocus(); });
  return { pref, label };
}

export { isTouchFirst, scrollWithin, setupFillList, setupListWrapPref, setupPhoneLayout, stepIndex };
