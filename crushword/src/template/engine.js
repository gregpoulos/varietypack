'use strict';

// builder.js concatenates grid.js, then layout.js, immediately before this file,
// so their functions (deriveSlots; gridDimensions, cellDimensions, cellCoords,
// svgSize, deriveNumbering) are browser globals here. Only deriveSlots is needed
// by the pure helpers below, so only it is conditionally required for Node tests.
if (typeof deriveSlots === 'undefined' && typeof require !== 'undefined')
  var { deriveSlots } = require('../grid');

// ── Pure helpers (exported for Node tests) ────────────────────────────────────

// Derives the cell<->entry mapping from the grid's block pattern via grid.js's
// deriveSlots — the same numbering the validator uses, so the engine's entry
// boundaries can never drift from it. cellId is 1-indexed row-major
// (row*cols + col + 1) over the WHOLE grid including blocked positions, matching
// the SVG element id convention (see docs/CROSS_TOOL_SPEC.md -> SVG element IDs).
function buildEntryMaps(grid) {
  const cols = grid[0].length;
  const idOf = (r, c) => r * cols + c + 1;
  const { acrossSlots, downSlots } = deriveSlots(grid);

  const acrossAt = {}, cellsOfAcross = {};
  for (const slot of acrossSlots) {
    const cells = [];
    for (let i = 0; i < slot.len; i++) {
      const id = idOf(slot.r, slot.c + i);
      acrossAt[id] = { num: slot.num, pos: i, len: slot.len };
      cells.push(id);
    }
    cellsOfAcross[slot.num] = cells;
  }

  const downAt = {}, cellsOfDown = {};
  for (const slot of downSlots) {
    const cells = [];
    for (let i = 0; i < slot.len; i++) {
      const id = idOf(slot.r + i, slot.c);
      downAt[id] = { num: slot.num, pos: i, len: slot.len };
      cells.push(id);
    }
    cellsOfDown[slot.num] = cells;
  }

  return {
    acrossAt, downAt, cellsOfAcross, cellsOfDown,
    acrossOrder: acrossSlots.map(s => s.num),
    downOrder:   downSlots.map(s => s.num),
  };
}

// Next/previous entry number in traversal order, wrapping. Used for Tab
// navigation and typing-driven auto-advance across an entry boundary.
function nextInOrder(order, num) {
  return order[(order.indexOf(num) + 1) % order.length];
}
function prevInOrder(order, num) {
  return order[(order.indexOf(num) - 1 + order.length) % order.length];
}

// ── DOM engine (browser only) ─────────────────────────────────────────────────
(function () {
  if (typeof document === 'undefined') return;

  function init() {
    // ── Data & constants ─────────────────────────────────────────────────────
    const data = window.PUZZLE_DATA;
    const grid = data.grid;
    const { rows: ROWS, cols: COLS } = gridDimensions(grid);
    const { width: CELL_WIDTH, height: CELL_HEIGHT } = cellDimensions(data.maxCellLetters);

    // ── Geometry & index maps ─────────────────────────────────────────────────
    function idOf(r, c) { return r * COLS + c + 1; }
    function rowOf(n)   { return Math.floor((n - 1) / COLS); }
    function colOf(n)   { return (n - 1) % COLS; }
    function isOpenCell(r, c) {
      return r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r][c] === '.';
    }

    const { acrossAt, downAt, cellsOfAcross, cellsOfDown, acrossOrder, downOrder } = buildEntryMaps(grid);
    const numbering = deriveNumbering(grid); // from layout.js: '<r>,<c>' -> num

    // Clue <li> elements by number, filled by buildClueList below (declared here so
    // DIRS can hold them).
    const acrossClueItems = {}, downClueItems = {};

    // Everything that differs between the two directions, in one table: the cell→entry
    // map, each entry's cells, the entry order Tab walks, the clue items, the bar's
    // label, and the other direction's name. Every `direction === 'across' ? … : …`
    // in this engine reads from here instead.
    const DIRS = {
      across: {
        at: acrossAt, cellsOf: cellsOfAcross, order: acrossOrder,
        clueItems: acrossClueItems, label: 'Across', opposite: 'down',
      },
      down: {
        at: downAt,   cellsOf: cellsOfDown,   order: downOrder,
        clueItems: downClueItems,   label: 'Down',   opposite: 'across',
      },
    };

    function entryInfo(n, dir)      { return DIRS[dir].at[n]; }
    function entryCellsOf(num, dir) { return DIRS[dir].cellsOf[num]; }
    function entryOrder(dir)        { return DIRS[dir].order; }

    // ── State ─────────────────────────────────────────────────────────────────
    let direction = 'across';
    let activeN = cellsOfAcross[acrossOrder[0]][0];
    // Position within the active cell's content: 0 is before the first
    // character, content.length after the last. Typing and Backspace act here.
    let cursorPos = 0;
    // Text-editor "sticky column": the position Up/Down aim for. Only Up/Down
    // leave it alone, so a walk through a shorter cell (which clamps
    // cursorPos) doesn't forget the column being aimed for.
    let desiredCol = 0;

    function setCursorPos(pos) {
      cursorPos = pos;
      desiredCol = pos;
    }

    // ── Logic functions ───────────────────────────────────────────────────────
    // #hidden-input is static markup, present regardless of when this runs, so this can be
    // declared up front rather than waiting for a local hiddenInput const (CW has none).
    const refocus = () => document.getElementById('hidden-input').focus({ preventScroll: true });

    // Overrides the shared .cell-letter.len-* scale with one sized to this
    // puzzle's actual cell width, measured from the ACTUAL rendered glyph
    // width via getBBox() rather than an estimated average character width —
    // robust to font, theme, and how wide a bracketed rebus group runs. The
    // shared classes' fixed scale is tuned for the other tools' fixed-square
    // cells and over-shrinks once cell width scales with maxCellLetters (the
    // common case now).
    //
    // Must set an explicit, non-empty inline value even when no shrink is
    // needed: `el.style.transform = ''` does NOT mean "no transform" — it
    // means "no inline declaration," which falls through to the cascade and
    // leaves the shared class's own transform in effect. Leaving it empty
    // here produced exactly the inverted bug this fixes: a 4-letter cell
    // (still under the fit threshold) kept the class's aggressive shrink,
    // while a 5-letter cell (over the threshold) got a computed override
    // scale *less* aggressive than the class's fixed one — so the longer
    // word rendered bigger than the shorter one.
    //
    // Only measures when there's more than one character: a single letter
    // already fits at full size in every puzzle, and getBBox() forces a
    // layout pass that's wasted on the common single-letter case.
    const LETTER_H_PADDING = 6; // total horizontal margin (px) reserved inside the cell
    const letterScale = new WeakMap(); // el -> the scale applied here, read by updateCaret
    function fitLetterToCell(el) {
      let scale = 1;
      if (el.textContent.length > 1) {
        const natural = el.getBBox().width;
        const available = CELL_WIDTH - LETTER_H_PADDING;
        if (natural > available) scale = available / natural;
      }
      letterScale.set(el, scale);
      el.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
    }

    // Every write of a cell's letter text goes through this — setCellLetter,
    // applyState's restore, and resetBoard's clear — so a cell's rendered size
    // can never go stale relative to its current content length.
    function setLetterDisplay(el, text) {
      setLetterText(el, text);
      fitLetterToCell(el);
    }

    const cellLetters = {};
    function getCellLetter(n) { return cellLetters[n] || ''; }

    // Marks (or unmarks) cell n's correct state on its rect and its letter element
    // together, so the two can never drift. The `.correct` class is the marker every
    // other site reads — matching Snake Charmer and Spiral.
    function setCorrect(n, on) {
      cellRects[n].classList.toggle('correct', on);
      letterTexts[n].classList.toggle('correct', on);
    }

    function isCorrect(n) { return cellRects[n].classList.contains('correct'); }

    function setCellLetter(n, letter) {
      if (letter) cellLetters[n] = letter;
      else delete cellLetters[n];
      setLetterDisplay(letterTexts[n], letter);
      setCorrect(n, false);
    }

    // Composing state only. Content is edited at cursorPos by the input and
    // Backspace handlers, so composer.typeLetter/backspace (end-only) and hence
    // setContent go unused. Commit happens at the top of focusCell.
    const composer = makeComposer({
      getContent: n => getCellLetter(n),
      getCellEl:  n => cellRects[n],
      onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    });

    // Canonical board string order: row-major over open cells only, skipping
    // blocks — the same order the hasher's preparePuzzle builds boardHash from.
    const CELL_IDS = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (isOpenCell(r, c)) CELL_IDS.push(idOf(r, c));

    const checker = makeBoardChecker({
      cellIds:             CELL_IDS,
      getContent:          n => getCellLetter(n),
      isCellFilled:        n => composer.isCellFilled(n),
      isCellMarkedCorrect: isCorrect,
      hashed:              !!data.hashed,
      getExpected:         n => data.letters && data.letters[n - 1],
      getBoardHash:        () => data.boardHash,
      markSolved:          () => markAllCorrect(),
      syncUI:              () => syncUI(),
    });

    function activeContextCells() {
      const info = entryInfo(activeN, direction);
      return info ? entryCellsOf(info.num, direction) : [activeN];
    }

    // The entry crossing the active cell in the OTHER direction — secondary-
    // highlighted in the clue list only, not on the grid (mirrors Marching
    // Bands' cross-mode convention, which does the same).
    function crossingInfo(n) {
      return entryInfo(n, DIRS[direction].opposite);
    }

    function nextCell(n) {
      const info = entryInfo(n, direction);
      const cells = entryCellsOf(info.num, direction);
      if (info.pos < info.len - 1) return cells[info.pos + 1];
      const order = entryOrder(direction);
      return entryCellsOf(nextInOrder(order, info.num), direction)[0];
    }

    function prevCell(n) {
      const info = entryInfo(n, direction);
      const cells = entryCellsOf(info.num, direction);
      if (info.pos > 0) return cells[info.pos - 1];
      const order = entryOrder(direction);
      const prevCells = entryCellsOf(prevInOrder(order, info.num), direction);
      return prevCells[prevCells.length - 1];
    }

    // Skips over block runs, matching a solver's expectation that arrow keys
    // jump to the next open square rather than stopping dead at a block.
    function arrowTarget(n, dr, dc) {
      let r = rowOf(n) + dr, c = colOf(n) + dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && !isOpenCell(r, c)) { r += dr; c += dc; }
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
      return idOf(r, c);
    }

    function toggleDirection() {
      const other = DIRS[direction].opposite;
      if (entryInfo(activeN, other)) {
        direction = other;
        focusCell(activeN, cursorPos, true); // the cursor hasn't moved
      }
    }

    // `pos` omitted lands at the end of n's content, recomputed even when n is
    // already active: resetBoard and restore refocus the active cell after its
    // content changed underneath it, so a kept cursorPos would be stale.
    // `keepDesiredCol` is for moves that aren't a horizontal placement
    // (Up/Down, a direction toggle).
    function focusCell(n, pos, keepDesiredCol) {
      composer.commitIfMoved(n);
      activeN = n;
      cursorPos = pos !== undefined ? pos : getCellLetter(n).length;
      if (!keepDesiredCol) desiredCol = cursorPos;
      // Auto-flip direction when the target cell has no entry in the current
      // direction but does in the other — e.g. after an arrow move onto a cell
      // whose across run is length 1. Every open cell has an entry in at least
      // one direction: the validator rejects an open cell with neither
      // (grid.js's uncluedCells), so syncUI can always find an active entry.
      const other = DIRS[direction].opposite;
      if (!entryInfo(n, direction) && entryInfo(n, other)) direction = other;
      syncUI();
      refocus();
    }

    function syncUI() {
      for (const n of CELL_IDS) cellRects[n].classList.remove('active-entry', 'active-cell');

      for (const n of activeContextCells()) cellRects[n].classList.add('active-entry');

      const activeRect = cellRects[activeN];
      activeRect.classList.remove('active-entry');
      activeRect.classList.add('active-cell');
      cellsLayer.appendChild(activeRect); // paint on top so the stroke is uniform on all sides
      updateCaret();

      for (const li of Object.values(acrossClueItems)) li.classList.remove('active-clue', 'secondary-entry');
      for (const li of Object.values(downClueItems))   li.classList.remove('active-clue', 'secondary-entry');

      const activeInfo  = entryInfo(activeN, direction);
      const activeItems = DIRS[direction].clueItems;
      activeItems[activeInfo.num].classList.add('active-clue');
      // scrollIntoView ignores the sticky grid and fixed bar covering the top of the
      // viewport, so reserve their height as scroll padding — the sticky `top` (the
      // bar's space) plus the grid's live height. See crushword/CLAUDE.md → Page layout.
      const puzzleCenter = document.querySelector('.puzzle-center');
      const stickyOffset = parseFloat(getComputedStyle(puzzleCenter).top);
      document.documentElement.style.scrollPaddingTop =
        (stickyOffset + puzzleCenter.getBoundingClientRect().height) + 'px';
      activeItems[activeInfo.num].scrollIntoView({ block: 'nearest' });

      barPrimaryDir.textContent = DIRS[direction].label;
      barPrimaryNum.textContent = activeInfo.num + '.';
      barPrimaryText.innerHTML  = data[direction][activeInfo.num].clue; // pre-rendered markdown HTML

      const otherDir = DIRS[direction].opposite;
      const crossing  = crossingInfo(activeN);
      if (crossing) {
        DIRS[otherDir].clueItems[crossing.num].classList.add('secondary-entry');
        barSecondaryDir.textContent = DIRS[otherDir].label;
        barSecondaryNum.textContent = crossing.num + '.';
        barSecondaryText.innerHTML  = data[otherDir][crossing.num].clue;
      }
      barSecondaryRow.hidden = !crossing;

      if (!data.hashed) {
        document.getElementById('check-btn').disabled =
          !composer.isCellFilled(activeN) || isCorrect(activeN);
      }

      const allFilled = checker.isBoardFilled();
      const solved    = checker.isSolved();
      document.getElementById('done-wrong').hidden = !(allFilled && !solved);

      latch.check(solved);
    }

    function markAllCorrect() {
      for (const n of CELL_IDS) setCorrect(n, true);
      for (const li of Object.values(acrossClueItems)) li.classList.add('correct');
      for (const li of Object.values(downClueItems))   li.classList.add('correct');
    }

    function checkCell() {
      const n = activeN;
      if (!isCorrect(n) && composer.isCellFilled(n)) {
        if (isCellCorrect(getCellLetter(n), data.letters[n - 1])) {
          setCorrect(n, true);
          saveState(); // only this branch mutates persisted state
        } else {
          flashWrong(cellRects[n], flashLayer);
        }
      }
      syncUI();
      refocus();
    }

    const saveKey = storageKey('cw', data);
    const { saveState, restoreState, clearState } = setupStorage(saveKey, {
      cellCount: CELL_IDS.length,
      getState() {
        const letters = {};
        const correct = [];
        for (const n of CELL_IDS) {
          const l = getCellLetter(n);
          if (l) letters[n] = l;
          if (isCorrect(n)) correct.push(n);
        }
        return { letters, correct, activeMs: timer.getElapsedMs(), composing: composer.getComposing() };
      },
      applyState(saved) {
        for (const n of CELL_IDS) {
          const letter = saved.letters?.[n];
          if (!letter) continue;
          cellLetters[n] = letter;
          setLetterDisplay(letterTexts[n], letter);
        }
        for (const n of (saved.correct || [])) setCorrect(n, true);
        timer.restoreMs(saved.activeMs);
        composer.restore(saved.composing);
      },
    });

    const congratsDialog = setupCongratsDialog({
      title: data.title, date: data.date, onPlayAgain: () => resetBoard(),
    });

    const { timer, latch } = setupSolveTracking({
      puzzleRoot:  document.querySelector('.puzzle-main'),
      data,
      getSolution: () => checker.getSolution(),
      saveState,
      onComplete:  (timeMs) => congratsDialog.open(timeMs),
    });

    // ── Build SVG ─────────────────────────────────────────────────────────────
    const cellRects = {}, letterTexts = {};

    const svg = document.getElementById('puzzle-svg');
    const { width: svgWidth, height: svgHeight } = svgSize(grid, CELL_WIDTH, CELL_HEIGHT);
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

    const cellsLayer   = svgEl('g', { id: 'cells-layer' });
    const circlesLayer = svgEl('g', { id: 'circles-layer' });
    const flashLayer   = svgEl('g', { id: 'flash-layer' });
    // Its own layer: resetBoard empties flashLayer, and letters paint over it.
    const caretLayer   = svgEl('g', { id: 'caret-layer' });
    const lettersLayer = svgEl('g', { id: 'letters-layer' });
    const labelsLayer  = svgEl('g', { id: 'labels-layer' });
    svg.append(cellsLayer, circlesLayer, flashLayer, caretLayer, lettersLayer, labelsLayer);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = cellCoords(r, c, CELL_WIDTH, CELL_HEIGHT);

        if (!isOpenCell(r, c)) {
          cellsLayer.appendChild(svgEl('rect', { x, y, width: CELL_WIDTH, height: CELL_HEIGHT, class: 'cell-block' }));
          continue;
        }

        const n = idOf(r, c);
        const rect = svgEl('rect', { id: `cell-${n}`, x, y, width: CELL_WIDTH, height: CELL_HEIGHT, class: 'cell' });
        rect.addEventListener('click', () => onCellClick(n));
        cellsLayer.appendChild(rect);
        cellRects[n] = rect;

        const num = numbering[`${r},${c}`];
        if (num !== undefined) {
          // .cell-num is text-anchor:middle/dominant-baseline:middle (shared/base.css),
          // so x/y here are the label's CENTER, not a corner offset — unlike Marching
          // Bands' unrelated .band-label class, which has no such rule and is
          // therefore left-anchored. Insets match Snake Charmer's tuned corner-label
          // values (snake-charmer/CLAUDE.md), which exist for the same reason: enough
          // clearance that a middle-anchored multi-character label's left edge never
          // crosses the cell's own left/top border.
          const label = svgEl('text', { x: x + 6, y: y + 8, class: 'cell-num' });
          label.textContent = num;
          labelsLayer.appendChild(label);
        }

        const text = svgEl('text', {
          id: `letter-${n}`, x: x + CELL_WIDTH / 2, y: y + CELL_HEIGHT / 2, class: 'cell-letter',
        });
        lettersLayer.appendChild(text);
        letterTexts[n] = text;
      }
    }

    // A <rect>, not a <line>: a zero-width line has an empty bounding box,
    // which Playwright's visibility checks read as hidden.
    const CARET_WIDTH = 1.5; // px
    const caret = svgEl('rect', { class: 'cell-caret', width: CARET_WIDTH });
    caretLayer.appendChild(caret);

    // Letters are centered in the cell under one scale transform; both lengths
    // below are in the text's own pre-transform units.
    function updateCaret() {
      const el = letterTexts[activeN];
      const { x, y } = cellCoords(rowOf(activeN), colOf(activeN), CELL_WIDTH, CELL_HEIGHT);
      const natural = el.getComputedTextLength();
      const left = cursorPos > 0 ? el.getSubStringLength(0, cursorPos) : 0;
      const boundaryX = x + CELL_WIDTH / 2 + (left - natural / 2) * (letterScale.get(el) ?? 1);
      caret.setAttribute('x', boundaryX - CARET_WIDTH / 2);
      caret.setAttribute('y', y + CELL_HEIGHT * 0.22);
      caret.setAttribute('height', CELL_HEIGHT * 0.56);
    }

    function renderCircles(entriesObj, cellsOf) {
      for (const [num, entry] of Object.entries(entriesObj)) {
        if (!entry.styles || !Array.isArray(entry.styles.circle)) continue;
        const cells = cellsOf[num];
        entry.styles.circle.forEach(pos => {
          const n = cells[pos];
          if (n === undefined) return;
          const { x, y } = cellCoords(rowOf(n), colOf(n), CELL_WIDTH, CELL_HEIGHT);
          circlesLayer.appendChild(svgEl('circle', {
            class: 'style-circle', cx: x + CELL_WIDTH / 2, cy: y + CELL_HEIGHT / 2, r: Math.min(CELL_WIDTH, CELL_HEIGHT) / 2 - 2,
          }));
        });
      }
    }
    renderCircles(data.across, cellsOfAcross);
    renderCircles(data.down,   cellsOfDown);

    // ── Header & clues ────────────────────────────────────────────────────────
    const acrossCluesList = document.getElementById('across-clues');
    const downCluesList   = document.getElementById('down-clues');

    function buildClueList(entriesObj, order, listEl, itemStore, dir) {
      for (const num of order) {
        const entry = entriesObj[num];
        const li = document.createElement('li');
        li.className = 'clue-item';
        const numEl = document.createElement('span');
        numEl.className = 'clue-num';
        numEl.textContent = num + '.';
        const textEl = document.createElement('span');
        textEl.className = 'clue-text';
        textEl.innerHTML = entry.clue; // pre-rendered markdown HTML — see shared/build/renderMarkdown.js
        li.append(numEl, textEl);
        li.addEventListener('click', e => {
          // A clue can render a real link (see docs/CROSS_TOOL_SPEC.md ->
          // Markdown formatting) — let it open on its own rather than also
          // treating the click as selecting this entry.
          if (e.target.closest('a')) return;
          direction = dir;
          focusCell(DIRS[dir].cellsOf[num][0]);
        });
        listEl.appendChild(li);
        itemStore[num] = li;
      }
    }
    buildClueList(data.across, acrossOrder, acrossCluesList, acrossClueItems, 'across');
    buildClueList(data.down,   downOrder,   downCluesList,   downClueItems,   'down');

    // Active-clue banner (docs/CROSS_TOOL_SPEC.md -> "Active-clue banner").
    const barPrimaryDir    = document.querySelector('#active-clue-primary .active-clue-dir');
    const barPrimaryNum    = document.querySelector('#active-clue-primary .active-clue-num');
    const barPrimaryText   = document.querySelector('#active-clue-primary .active-clue-text');
    const barSecondaryRow  = document.getElementById('active-clue-secondary');
    const barSecondaryDir  = document.querySelector('#active-clue-secondary .active-clue-dir');
    const barSecondaryNum  = document.querySelector('#active-clue-secondary .active-clue-num');
    const barSecondaryText = document.querySelector('#active-clue-secondary .active-clue-text');

    renderByline(data);
    renderInstructions(data);

    // ── Event wiring ──────────────────────────────────────────────────────────
    function onCellClick(n) {
      if (n === activeN) toggleDirection();
      else focusCell(n);
    }

    const keysOverlay = setupKeysOverlay(
      [
        ['Tab',       'Next entry'],
        ['Shift+Tab', 'Previous entry'],
        ['↑ ↓',       'Move one cell'],
        ['← →',       'Move one letter'],
        ['⌥← ⌥→',     'Jump to start / end of cell'],
        ['⌫',         'Delete previous letter'],
        ['⌥⌫',        'Delete to start of cell'],
        ['⌥⌫ at start', 'Clear previous cell and move to it'],
        ['Space',     'Confirm cell and move on (trims past cursor)'],
        ['Enter',     'Confirm cell and move on (keeps everything typed)'],
        ['Shift+Enter', 'Move to previous cell'],
        ['.',         'Toggle across / down'],
      ],
      refocus
    );

    // Replaces the active cell's content and places the cursor. Content is
    // edited here, at cursorPos, rather than through composer.typeLetter/
    // backspace, which only work at the end of a cell.
    function editActiveCell(content, pos) {
      if (!composer.isComposing(activeN)) composer.enter(activeN);
      setCellLetter(activeN, content);
      setCursorPos(pos);
    }

    // ←/→ step through the cell's letters, crossing into the adjacent cell
    // only from its edge; `jump` (Alt) goes straight to the edge. A plain
    // crossing lands at the near side of the new cell, an Alt crossing at the
    // far side. Moving within a cell only repositions the caret, so it skips
    // syncUI's full re-render.
    function moveHorizontal(dc, jump) {
      const edge = dc > 0 ? getCellLetter(activeN).length : 0;
      if (cursorPos !== edge) {
        setCursorPos(jump ? edge : cursorPos + dc);
        updateCaret();
        return;
      }
      const t = arrowTarget(activeN, 0, dc);
      if (!t) return;
      direction = 'across'; // before focusCell, so its auto-flip can still override
      const landAtEnd = (dc < 0) !== jump;
      focusCell(t, landAtEnd ? getCellLetter(t).length : 0);
    }

    // ↑/↓ always change cells, landing at the sticky column.
    function moveVertical(dr, key) {
      const t = arrowTarget(activeN, dr, 0);
      if (!t) { scrollByKey(key); return; }
      direction = 'down'; // before focusCell, so its auto-flip can still override
      focusCell(t, Math.min(desiredCol, getCellLetter(t).length), true);
    }

    setupKeydown(e => {
      if (latch.solved) return;

      if (e.key === '.') { e.preventDefault(); toggleDirection(); return; }

      if (e.key === 'Tab') {
        e.preventDefault();
        const info = entryInfo(activeN, direction);
        const order = entryOrder(direction);
        const targetNum = e.shiftKey ? prevInOrder(order, info.num) : nextInOrder(order, info.num);
        focusCell(entryCellsOf(targetNum, direction)[0]);
        return;
      }

      if (e.key === 'Enter') {
        // Confirm and move to the next (Shift: previous) cell, landing at the
        // end of its content. Unlike Space, keeps everything typed.
        e.preventDefault();
        focusCell(e.shiftKey ? prevCell(activeN) : nextCell(activeN));
        saveState();
        return;
      }

      if (e.key === 'Backspace') {
        // Plain deletes the letter before the cursor, Alt everything before it.
        // From a cell's front, both first step back to the end of the previous
        // cell and apply there. Move before editing: composer.enter doesn't
        // commit a different composing cell, so editing first would leave the
        // cell being left stuck composing.
        e.preventDefault();
        if (cursorPos === 0) focusCell(prevCell(activeN));
        if (cursorPos > 0) {
          const content = getCellLetter(activeN);
          const cut = e.altKey ? 0 : cursorPos - 1;
          editActiveCell(content.slice(0, cut) + content.slice(cursorPos), cut);
          syncUI();
        }
        saveState();
        return;
      }

      if (e.key === ' ') {
        // Crushword carve-out (docs/CROSS_TOOL_SPEC.md -> "Space semantics"):
        // confirm and advance to the next cell's front, dropping anything past
        // the cursor as a stale guess.
        e.preventDefault();
        const content = getCellLetter(activeN);
        if (cursorPos < content.length) setCellLetter(activeN, content.slice(0, cursorPos));
        focusCell(nextCell(activeN), 0);
        saveState();
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        moveHorizontal(e.key === 'ArrowRight' ? 1 : -1, e.altKey);
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveVertical(e.key === 'ArrowDown' ? 1 : -1, e.key);
        return;
      }

      if (e.key === 'PageDown') { e.preventDefault(); scrollByKey('PageDown'); return; }
      if (e.key === 'PageUp')   { e.preventDefault(); scrollByKey('PageUp'); return; }
    }, { keysOverlay });

    document.getElementById('hidden-input').addEventListener('input', e => {
      const typed = normalize(e.target.value).toUpperCase();
      e.target.value = '';
      if (latch.solved || !typed) return;
      timer.onFirstInput();
      // Per character, since a paste or autocomplete can deliver several:
      // insert at the cursor while the cell has room, overwrite once it's
      // full, and drop anything typed at a full cell's very end.
      for (const ch of typed) {
        const content = getCellLetter(activeN);
        const full = content.length >= data.maxCellLetters;
        if (full && cursorPos === content.length) break;
        editActiveCell(content.slice(0, cursorPos) + ch + content.slice(cursorPos + (full ? 1 : 0)), cursorPos + 1);
      }
      // maxCellLetters is puzzle-wide, so advancing on it reveals nothing about
      // this cell. Keyed off cursorPos, so overwriting mid-cell doesn't advance.
      if (cursorPos >= data.maxCellLetters) focusCell(nextCell(activeN), 0);
      else syncUI();
      checker.checkIfFilled();
      saveState();
    });


    function resetBoard() {
      resetAndRefocus({
        composer, clearState, timer, latch,
        clearBoard() {
          for (const n of CELL_IDS) {
            delete cellLetters[n];
            setLetterDisplay(letterTexts[n], '');
            setCorrect(n, false);
          }
          flashLayer.replaceChildren();
          for (const li of Object.values(acrossClueItems)) li.classList.remove('correct');
          for (const li of Object.values(downClueItems))   li.classList.remove('correct');
          direction = 'across';
        },
        focusInitial: () => focusCell(cellsOfAcross[acrossOrder[0]][0]),
      });
    }

    setupControls({
      checkBtn: document.getElementById('check-btn'), hashed: data.hashed, onCheck: checkCell,
      onClear: resetBoard, refocus, key: saveKey,
    });

    // ── Restore & focus ───────────────────────────────────────────────────────
    const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
    focusCell(resumeCell === null ? activeN : resumeCell);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

if (typeof module !== 'undefined') {
  module.exports = { buildEntryMaps, nextInOrder, prevInOrder };
}
