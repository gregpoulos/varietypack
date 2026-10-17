// typing.mjs holds the pure typing rules, shared with the studio's editor.
import { normalize } from '../../../shared/normalize.mjs';
import {
  makeBoardChecker, makeCellStore, makeComposer, resetAndRefocus, restoreAndSeal,
  setLetterText, setupSolveTracking, syncSolveState
} from '../../../shared/engine-state.mjs';
import {
  clueTextEl, flashWrong, htmlEl, onClueClick, renderByline, renderInstructions,
  scrollByKey, scrollIntoViewBelow, setupCellClicks, setupClueBar, setupCongratsDialog,
  setupControls, setupEmbedResize, setupKeydown, setupKeysOverlay, setupStorage,
  storageKey, svgEl
} from '../../../shared/engine-chrome.mjs';
import {
  cellCoords, cellDimensions, deriveNumbering, gridDimensions, svgSize
} from '../layout.mjs';
import {
  arrowTarget, buildEntryMaps, deleteBefore, nextCell, prevCell, stepInOrder, typeAt
} from '../typing.mjs';

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

  const maps = buildEntryMaps(grid);
  const numbering = deriveNumbering(grid); // from layout.mjs: '<r>,<c>' -> num

  // Clue <li> elements by number, filled by buildClueList below (declared here so
  // DIRS can hold them).
  const acrossClueItems = {}, downClueItems = {};

  // Everything that differs between the two directions, in one table: the cell→entry
  // map, each entry's cells, the entry order Tab walks, the clue items, the bar's
  // label, and the other direction's name. Every `direction === 'across' ? … : …`
  // in this engine reads from here instead.
  const DIRS = {
    across: { ...maps.across, clueItems: acrossClueItems, label: 'Across', opposite: 'down' },
    down:   { ...maps.down,   clueItems: downClueItems,   label: 'Down',   opposite: 'across' },
  };

  function entryInfo(n, dir)      { return DIRS[dir].at[n]; }
  function entryCellsOf(num, dir) { return DIRS[dir].cellsOf[num]; }
  function entryOrder(dir)        { return DIRS[dir].order; }

  // ── State ─────────────────────────────────────────────────────────────────
  // The first across entry's first cell, where a fresh puzzle starts.
  const FIRST_CELL = maps.across.cellsOf[maps.across.order[0]][0];
  let activeCell = FIRST_CELL;
  let direction = 'across';
  // Position within the active cell's content: 0 is before the first
  // character, content.length after the last. Typing and Backspace act here.
  let cursorPos = 0;
  // Text-editor "sticky column": the position Up/Down aim for. Only Up/Down
  // leave it alone, so a walk through a shorter cell (which clamps
  // cursorPos) doesn't forget the column being aimed for.
  let desiredCol = 0;

  // A horizontal placement: moves the cursor and makes it the new sticky column.
  // Up/Down go through focusCell(…, true) instead.
  function setCursorPos(pos) {
    cursorPos = pos;
    desiredCol = pos;
  }

  // ── Logic functions ───────────────────────────────────────────────────────
  // Overrides the shared .cell-letter.len-* scale (tuned for fixed-square cells, so it
  // over-shrinks once cell width scales with maxCellLetters) with one sized to this
  // puzzle's cell width, measured from the rendered glyph width via getBBox().
  //
  // Always set a concrete inline value — 'none' when no shrink is needed, never ''.
  // An empty inline transform means "no inline declaration", which falls through to
  // the shared class's own transform and shrinks the cell anyway.
  //
  // Only measured for more than one character: a single letter fits at full size, and
  // getBBox() forces a layout pass.
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

  // setCellLetter, the only writer of a cell's letter, displays it through this, so a
  // cell's rendered size can never go stale relative to its current content length.
  function setLetterDisplay(el, text) {
    setLetterText(el, text);
    fitLetterToCell(el);
  }

  // Canonical board string order: row-major over open cells only, skipping
  // blocks — the same order prepare.js's preparePuzzle builds boardHash from.
  const CELL_IDS = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (isOpenCell(r, c)) CELL_IDS.push(idOf(r, c));

  // Each cell's letter and correct mark (makeCellStore, shared/engine-state.mjs).
  const cells = makeCellStore({
    ids: CELL_IDS, cellEl: n => cellRects[n], letterEl: n => letterTexts[n], show: setLetterDisplay,
  });
  const { getCellLetter, setCellLetter, setCorrect, isCorrect } = cells;

  // Composing state only. Content is edited at cursorPos by the input and
  // Backspace handlers, so composer.typeLetter/backspace (end-only) and hence
  // setContent go unused. Commit happens at the top of focusCell.
  const composer = makeComposer({
    getContent: n => getCellLetter(n),
    onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    isSolved:   () => latch.solved,
  });

  const checker = makeBoardChecker({
    cellIds:             CELL_IDS,
    getContent:          n => getCellLetter(n),
    isCellFilled:        n => composer.isCellFilled(n),
    isCellMarkedCorrect: isCorrect,
    hashed:              !!data.hashed,
    getExpected:         n => data.letters && data.letters[n - 1],
    getBoardHash:        () => data.boardHash,
    markSolved: () => {
      cells.markAllCorrect();
      for (const li of Object.values(acrossClueItems)) li.classList.add('correct');
      for (const li of Object.values(downClueItems))   li.classList.add('correct');
    },
    syncUI:              () => syncUI(),
  });

  function activeContextCells() {
    return entryCellsOf(entryInfo(activeCell, direction).num, direction);
  }

  // The entry crossing the active cell in the OTHER direction — secondary-
  // highlighted in the clue list only, not on the grid (mirrors Marching
  // Bands' cross-mode convention, which does the same).
  function crossingInfo(n) {
    return entryInfo(n, DIRS[direction].opposite);
  }

  function toggleDirection() {
    const other = DIRS[direction].opposite;
    if (entryInfo(activeCell, other)) {
      direction = other;
      focusCell(activeCell, cursorPos, true); // the cursor hasn't moved
    }
  }

  // `pos` omitted lands at the end of n's content, recomputed even when n is
  // already active: resetBoard and restore refocus the active cell after its
  // content changed underneath it, so a kept cursorPos would be stale.
  // `keepDesiredCol` is for moves that aren't a horizontal placement
  // (Up/Down, a direction toggle).
  function focusCell(n, pos, keepDesiredCol) {
    composer.commitIfMoved(n);
    activeCell = n;
    cursorPos = pos !== undefined ? pos : getCellLetter(n).length;
    if (!keepDesiredCol) desiredCol = cursorPos;
    // Auto-flip direction when the target cell has no entry in the current
    // direction but does in the other — e.g. after an arrow move onto a cell
    // whose across run is length 1. Every open cell has an entry in at least
    // one direction: the validator rejects an open cell with neither
    // (grid.mjs's uncluedCells), so syncUI can always find an active entry.
    const other = DIRS[direction].opposite;
    if (!entryInfo(n, direction) && entryInfo(n, other)) direction = other;
    refocus();
    syncUI();
  }

  // Replaces the active cell's content and places the cursor. Content is
  // edited here, at cursorPos, rather than through composer.typeLetter/
  // backspace, which only work at the end of a cell.
  function editActiveCell(content, pos) {
    if (!composer.isComposing(activeCell)) composer.toggle(activeCell);
    setCellLetter(activeCell, content);
    setCursorPos(pos);
  }

  // ←/→ step through the cell's letters, crossing into the adjacent cell
  // only from its edge; `jump` (Alt) goes straight to the edge. A plain
  // crossing lands at the near side of the new cell, an Alt crossing at the
  // far side.
  function moveHorizontal(dc, jump) {
    const edge = dc > 0 ? getCellLetter(activeCell).length : 0;
    if (cursorPos !== edge) {
      setCursorPos(jump ? edge : cursorPos + dc);
      syncUI();
      return;
    }
    const t = arrowTarget(grid, activeCell, 0, dc);
    if (!t) return;
    direction = 'across'; // before focusCell, so its auto-flip can still override
    const landAtEnd = (dc < 0) !== jump;
    focusCell(t, landAtEnd ? getCellLetter(t).length : 0);
  }

  // ↑/↓ always change cells, landing at the sticky column.
  function moveVertical(dr, key) {
    const t = arrowTarget(grid, activeCell, dr, 0);
    if (!t) { scrollByKey(key); return; }
    direction = 'down'; // before focusCell, so its auto-flip can still override
    focusCell(t, Math.min(desiredCol, getCellLetter(t).length), true);
  }

  let lastScrolled = null; // the clue element syncUI last scrolled into view

  function syncUI() {
    // Cells: highlight the active entry and cell, and mark the composing one.
    for (const n of CELL_IDS) {
      cellRects[n].classList.remove('active-entry', 'active-cell');
      cellRects[n].classList.toggle('composing', composer.isComposing(n));
    }

    for (const n of activeContextCells()) cellRects[n].classList.add('active-entry');

    const activeRect = cellRects[activeCell];
    activeRect.classList.remove('active-entry');
    activeRect.classList.add('active-cell');
    // Last in its layer, so no neighbor paints over its border (e2e/shared.spec.js).
    cellsLayer.appendChild(activeRect);
    updateCaret();

    // Clue list: highlight the active and crossing clues, and mark filled ones.
    for (const dir of Object.keys(DIRS)) {
      for (const [num, li] of Object.entries(DIRS[dir].clueItems)) {
        li.classList.remove('active-clue', 'secondary-entry');
        li.classList.toggle('filled', checker.isEntryFilled(entryCellsOf(num, dir)));
      }
    }

    const activeInfo  = entryInfo(activeCell, direction);
    const activeItems = DIRS[direction].clueItems;
    const activeItem = activeItems[activeInfo.num];
    activeItem.classList.add('active-clue');
    // Scrolled into view only when it changes (docs/CROSS_TOOL_SPEC.md → "syncUI()
    // contract").
    if (activeItem !== lastScrolled) {
      lastScrolled = activeItem;
      scrollIntoViewBelow(activeItem, puzzleCenter);
    }

    const otherDir = DIRS[direction].opposite;
    const crossing = crossingInfo(activeCell);
    if (crossing) DIRS[otherDir].clueItems[crossing.num].classList.add('secondary-entry');
    // Clue bar: show the active clue and its crossing entry.
    clueBar.show(
      { dir: DIRS[direction].label, num: activeInfo.num, clue: data[direction][activeInfo.num].clue },
      crossing && { dir: DIRS[otherDir].label, num: crossing.num, clue: data[otherDir][crossing.num].clue },
    );

    // Check Cell button: enabled only while the active cell can be checked.
    controls.syncCheckBtn(activeCell);

    // Solve state: the done-wrong banner, and solved-ness for the completion latch.
    syncSolveState({ checker, latch, doneWrong });
  }

  function checkCell() {
    const n = activeCell;
    // The focus call is required on every path out (docs/CROSS_TOOL_SPEC.md → Focus
    // management).
    const ok = checker.checkCell(n);
    if (ok === true) {
      setCorrect(n, true);
      saveState();          // only this branch mutates persisted state
    } else if (ok === false) {
      flashWrong(cellRects[n], flashLayer);
    }
    syncUI();
    refocus();
  }

  const saveKey = storageKey('cw', data);
  const { saveState, restoreState, clearState } = setupStorage(saveKey, {
    getState() {
      return { ...cells.saveFields(), activeMs: timer.getElapsedMs(), composing: composer.getComposing() };
    },
    fits: cells.fitsSave,
    applyState(saved) {
      cells.restoreFields(saved);
      timer.restoreMs(saved.activeMs);
      // After the letters are painted, so the composing cell shows its partial content.
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
      cellsLayer.appendChild(rect);
      cellRects[n] = rect;

      const num = numbering[`${r},${c}`];
      if (num !== undefined) {
        // .cell-num is middle-anchored (shared/base.css), so x/y are the label's
        // center; the insets match Snake Charmer's tuned corner-label values.
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
    const el = letterTexts[activeCell];
    const { x, y } = cellCoords(rowOf(activeCell), colOf(activeCell), CELL_WIDTH, CELL_HEIGHT);
    const natural = el.getComputedTextLength();
    const left = cursorPos > 0 ? el.getSubStringLength(0, cursorPos) : 0;
    const boundaryX = x + CELL_WIDTH / 2 + (left - natural / 2) * (letterScale.get(el) ?? 1);
    caret.setAttribute('x', boundaryX - CARET_WIDTH / 2);
    caret.setAttribute('y', y + CELL_HEIGHT * 0.22);
    caret.setAttribute('height', CELL_HEIGHT * 0.56);
  }

  // Across and down list the same circled cell (the circle rule); draw it once.
  const circledCells = new Set();
  function renderCircles(entriesObj, cellsOf) {
    for (const [num, entry] of Object.entries(entriesObj)) {
      if (!entry.styles || !Array.isArray(entry.styles.circle)) continue;
      const cells = cellsOf[num];
      entry.styles.circle.forEach(pos => {
        const n = cells[pos];
        if (n === undefined || circledCells.has(n)) return;
        circledCells.add(n);
        const { x, y } = cellCoords(rowOf(n), colOf(n), CELL_WIDTH, CELL_HEIGHT);
        circlesLayer.appendChild(svgEl('circle', {
          class: 'style-circle', cx: x + CELL_WIDTH / 2, cy: y + CELL_HEIGHT / 2, r: Math.min(CELL_WIDTH, CELL_HEIGHT) / 2 - 2,
        }));
      });
    }
  }
  renderCircles(data.across, maps.across.cellsOf);
  renderCircles(data.down,   maps.down.cellsOf);

  // ── Header & clues ────────────────────────────────────────────────────────
  renderByline(data);
  renderInstructions(data);

  const acrossCluesList = document.getElementById('across-clues');
  const downCluesList   = document.getElementById('down-clues');

  function buildClueList(entriesObj, order, listEl, itemStore, dir) {
    for (const num of order) {
      const li = htmlEl('li', { class: 'clue-item' },
        htmlEl('span', { class: 'clue-num' }, num + '.'),
        clueTextEl(entriesObj[num].clue));
      onClueClick(li, () => { direction = dir; focusCell(DIRS[dir].cellsOf[num][0]); });
      listEl.appendChild(li);
      itemStore[num] = li;
    }
  }
  buildClueList(data.across, maps.across.order, acrossCluesList, acrossClueItems, 'across');
  buildClueList(data.down,   maps.down.order,   downCluesList,   downClueItems,   'down');

  // ── Event wiring ──────────────────────────────────────────────────────────
  // The page's static elements. Logic functions above use them (focusCell calls
  // refocus, syncUI writes the bar); they first run in Restore & focus, after this.
  const hiddenInput = document.getElementById('hidden-input');
  const refocus = () => hiddenInput.focus({ preventScroll: true });

  const clueBar = setupClueBar();

  const checkBtn  = document.getElementById('check-btn');
  const doneWrong = document.getElementById('done-wrong');
  const puzzleCenter = document.querySelector('.puzzle-center'); // the sticky grid box

  setupEmbedResize();
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

  setupKeydown(e => {
    if (latch.solved) return;

    if (e.key === '.') { e.preventDefault(); toggleDirection(); return; }

    if (e.key === 'Tab') {
      e.preventDefault();
      const info = entryInfo(activeCell, direction);
      const order = entryOrder(direction);
      const targetNum = stepInOrder(order, info.num, e.shiftKey ? -1 : 1);
      focusCell(entryCellsOf(targetNum, direction)[0]);
      return;
    }

    if (e.key === 'Enter') {
      // Confirm and move to the next (Shift: previous) cell, landing at the
      // end of its content. Unlike Space, keeps everything typed.
      e.preventDefault();
      focusCell(e.shiftKey ? prevCell(maps, activeCell, direction) : nextCell(maps, activeCell, direction));
      saveState();
      return;
    }

    if (e.key === 'Backspace') {
      // Plain deletes the letter before the cursor, Alt everything before it.
      // From a cell's front, both first step back to the end of the previous
      // cell and apply there. Move before editing: composer.toggle doesn't
      // commit a different composing cell, so editing first would leave the
      // cell being left stuck composing.
      e.preventDefault();
      if (cursorPos === 0) focusCell(prevCell(maps, activeCell, direction));
      if (cursorPos > 0) {
        const r = deleteBefore(getCellLetter(activeCell), cursorPos, e.altKey);
        editActiveCell(r.content, r.pos);
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
      const content = getCellLetter(activeCell);
      if (cursorPos < content.length) setCellLetter(activeCell, content.slice(0, cursorPos));
      focusCell(nextCell(maps, activeCell, direction), 0);
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
  }, { keysOverlay, refocus });

  hiddenInput.addEventListener('input', () => {
    const typed = normalize(hiddenInput.value);
    hiddenInput.value = '';
    if (latch.solved || !typed) return;
    timer.onFirstInput();
    // Per character (typeAt), since a paste or autocomplete can deliver
    // several; whatever's left once the cursor reaches the cap is dropped.
    for (const ch of typed) {
      const r = typeAt(getCellLetter(activeCell), cursorPos, ch, data.maxCellLetters);
      editActiveCell(r.content, r.pos);
      if (cursorPos >= data.maxCellLetters) break;
    }
    // maxCellLetters is puzzle-wide, so advancing on it reveals nothing about
    // this cell. Keyed off cursorPos, so overwriting mid-cell doesn't advance.
    if (cursorPos >= data.maxCellLetters) focusCell(nextCell(maps, activeCell, direction), 0);
    else syncUI();
    checker.checkIfFilled();
    saveState();
  });

  // A click on a cell moves there; a second click on the active cell switches
  // direction.
  setupCellClicks(svg, n => {
    if (n === activeCell) toggleDirection();
    else focusCell(n);
  });

  function resetBoard() {
    resetAndRefocus({
      composer, clearState, timer, latch,
      clearBoard() {
        cells.clearCells();
        flashLayer.replaceChildren();
        for (const li of Object.values(acrossClueItems)) li.classList.remove('correct');
        for (const li of Object.values(downClueItems))   li.classList.remove('correct');
        direction = 'across';
      },
      focusInitial: () => focusCell(FIRST_CELL),
    });
  }

  const controls = setupControls({
    checkBtn, checker, hashed: data.hashed, onCheck: checkCell,
    onClear: resetBoard, refocus, key: saveKey,
  });

  // ── Restore & focus ───────────────────────────────────────────────────────
  const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
  // Resume on the restored composing cell (docs/CROSS_TOOL_SPEC.md → "Composition is
  // saved state").
  focusCell(resumeCell === null ? FIRST_CELL : resumeCell);
}

document.addEventListener('DOMContentLoaded', init);
