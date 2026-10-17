import { normalize } from '../../../shared/normalize.mjs';
import {
  makeBoardChecker, makeCellStore, makeComposer, resetAndRefocus, restoreAndSeal,
  setupSolveTracking, syncSolveState
} from '../../../shared/engine-state.mjs';
import {
  clueTextEl, flashWrong, htmlEl, onClueClick, renderByline, renderInstructions,
  scrollByKey, scrollIntoViewBelow, setupCellClicks, setupCongratsDialog,
  setupControls, setupEmbedResize, setupKeydown, setupKeysOverlay, setupRebusButton,
  setupStorage, storageKey, svgEl
} from '../../../shared/engine-chrome.mjs';
import { arrowTarget, bandCells, bandIndexOf, centerN, rowCells } from '../layout.mjs';

function init() {
  // ── Data & constants ─────────────────────────────────────────────────────
  const data = window.PUZZLE_DATA;
  const N = data.size;
  const numBands = Math.floor(N / 2);
  const CELL_SIZE = 34;
  const BAND_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // ── Geometry & index maps ─────────────────────────────────────────────────
  // bandIndexOf/bandCells/rowCells/centerN/arrowTarget are imported from
  // src/layout.mjs — the band and row functions are the ones the validator and prepare
  // step use, so the engine's traversal cannot drift from theirs.
  function cellId(row, col)  { return (row - 1) * N + col; }
  function rowOf(n)          { return Math.ceil(n / N); }
  function colOf(n)          { return ((n - 1) % N) + 1; }
  function bandOf(n)         { return bandIndexOf(rowOf(n), colOf(n), N); }

  // 1-indexed center cell ID (odd N only, -1 for even N)
  const CENTER_N = (N % 2 === 1) ? centerN(N) : -1;

  // bandCellsMap[k]: clockwise-ordered 1-indexed cell IDs for band k
  const bandCellsMap = Array.from({ length: numBands }, (_, k) => bandCells(k, N));

  // rowCellsMap[r]: left-to-right 1-indexed cell IDs for row r (0-indexed)
  const rowCellsMap = Array.from({ length: N }, (_, r) => rowCells(r, N));

  // ── State ─────────────────────────────────────────────────────────────────
  const FIRST_CELL = rowCellsMap[0][0];   // the top-left cell, where row 1 starts
  let activeCell = FIRST_CELL;
  let mode = 'row';    // 'row' | 'band'

  // ── Logic functions ───────────────────────────────────────────────────────
  // Row-major order skipping the black center — the canonical board string order.
  // The center contributes nothing to the string, not an empty segment.
  const CELL_IDS = [];
  for (let n = 1; n <= N * N; n++) if (n !== CENTER_N) CELL_IDS.push(n);

  // Each cell's letter and correct mark (makeCellStore, shared/engine-state.mjs).
  const cells = makeCellStore({ ids: CELL_IDS, cellEl: n => cellRects[n], letterEl: n => letterTexts[n] });
  const { getCellLetter, setCellLetter, setCorrect, isCorrect } = cells;

  // Commit is wired only at the top of focusCell — docs/CROSS_TOOL_SPEC.md → Enter /
  // Rebus button.
  const composer = makeComposer({
    getContent: n => getCellLetter(n),
    setContent: (n, s) => setCellLetter(n, s),
    onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    isSolved:   () => latch.solved,
  });

  // Board state and answer checking. Marching Bands marks no clue items in either
  // mode — its clue groups deliberately hide entry boundaries — so it is already
  // mode-symmetric and markSolved stays cells-and-letters only.
  const checker = makeBoardChecker({
    cellIds:             CELL_IDS,
    getContent:          n => getCellLetter(n),
    isCellFilled:        n => composer.isCellFilled(n),
    isCellMarkedCorrect: isCorrect,
    hashed:              !!data.hashed,
    getExpected:         n => data.letters && data.letters[n - 1],
    getBoardHash:        () => data.boardHash,
    markSolved:          () => cells.markAllCorrect(),
    syncUI:              () => syncUI(),
  });

  function activeRowIndex()  { return rowOf(activeCell) - 1; }   // 0-indexed
  function activeBandIndex() { return bandOf(activeCell); }       // 0-indexed

  // Clue-group <li> elements by row/band index, filled by buildClues below (declared
  // here so MODES can hold them).
  const rowClueGroups  = [];
  const bandClueGroups = [];

  // Everything that differs between the two modes, in one table: the cells of each
  // row/band, which one the cursor is in, how many there are, their clue groups, and
  // the other mode's name. Every `mode === 'row' ? … : …` in this engine reads from
  // here instead. activeRowIndex/activeBandIndex are hoisted function declarations.
  const MODES = {
    row:  { cells: rowCellsMap,  index: activeRowIndex,  count: N,        groups: rowClueGroups,  other: 'band' },
    band: { cells: bandCellsMap, index: activeBandIndex, count: numBands, groups: bandClueGroups, other: 'row'  },
  };

  function activeContextCells() {
    const { cells, index } = MODES[mode];
    return cells[index()];
  }

  function nextCell(n) {
    const cells = activeContextCells();
    const pos = cells.indexOf(n);
    if (pos < cells.length - 1) return cells[pos + 1];
    // Wrap to the first cell of the next row or band.
    const m = MODES[mode];
    return m.cells[(m.index() + 1) % m.count][0];
  }

  function prevCell(n) {
    const cells = activeContextCells();
    const pos = cells.indexOf(n);
    if (pos > 0) return cells[pos - 1];
    // Wrap to the last cell of the previous row or band.
    const m = MODES[mode];
    const prev = m.cells[(m.index() - 1 + m.count) % m.count];
    return prev[prev.length - 1];
  }

  function focusCell(n) {
    composer.commitIfMoved(n);
    activeCell = n;
    refocus();
    syncUI();
  }

  // One rebus toggle for Enter and #rebus-btn — docs/CROSS_TOOL_SPEC.md → Enter / Rebus
  // button.
  function toggleRebus() {
    composer.toggle(activeCell);
    syncUI();
  }

  let lastScrolled = null; // the clue element syncUI last scrolled into view

  function syncUI() {
    // Composition also ends on any cursor move, which never touches the button.
    rebusBtn.sync();

    // Cells: highlight the active entry and cell, and mark the composing one.
    // Clear transient highlight classes — band-even/band-odd and correct never change
    // here
    for (const n of CELL_IDS) {
      cellRects[n].classList.remove('active-entry', 'active-cell');
      cellRects[n].classList.toggle('composing', composer.isComposing(n));
    }

    // Highlight active row or band (all its cells)
    for (const n of activeContextCells()) cellRects[n].classList.add('active-entry');

    // Mark active cell
    const activeRect = cellRects[activeCell];
    activeRect.classList.remove('active-entry');
    activeRect.classList.add('active-cell');
    // Last in its layer, so no neighbor paints over its border (e2e/shared.spec.js).
    cellsLayer.appendChild(activeRect);

    // Clue list: highlight the active and crossing clues.
    // Clear all clue highlights
    for (const m of Object.values(MODES)) {
      for (const group of m.groups) group.classList.remove('active-clue', 'secondary-entry');
    }

    // Highlight active row/band clue cluster; secondary-highlight the cross-mode
    // cluster
    const activeMode = MODES[mode];
    const crossMode  = MODES[activeMode.other];
    activeMode.groups[activeMode.index()].classList.add('active-clue');
    crossMode.groups[crossMode.index()].classList.add('secondary-entry');

    // Toggle buttons: mark the active segment
    modeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Check Cell button: enabled only while the active cell can be checked.
    controls.syncCheckBtn(activeCell);

    // Scrolled into view only when it changes (docs/CROSS_TOOL_SPEC.md → "syncUI()
    // contract").
    const activeGroup = activeMode.groups[activeMode.index()];
    if (activeGroup !== lastScrolled) {
      lastScrolled = activeGroup;
      if (activeGroup) scrollIntoViewBelow(activeGroup, puzzleCenter);
    }

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

  const saveKey = storageKey('mb', data);
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
    title: data.title,
    date: data.date,
    onPlayAgain: () => resetBoard(),
  });

  const { timer, latch } = setupSolveTracking({
    puzzleRoot:  document.querySelector('.puzzle-main'),
    data,
    getSolution: () => checker.getSolution(),
    saveState,
    onComplete:  (timeMs) => congratsDialog.open(timeMs),
  });

  // ── Build SVG ─────────────────────────────────────────────────────────────
  const cellRects  = {};  // n → <rect>
  const letterTexts = {}; // n → <text>

  const svg = document.getElementById('puzzle-svg');
  const svgSize = N * CELL_SIZE;
  svg.setAttribute('width',   svgSize);
  svg.setAttribute('height',  svgSize);
  svg.setAttribute('viewBox', `0 0 ${svgSize} ${svgSize}`);

  const cellsLayer   = svgEl('g', { id: 'cells-layer' });
  const circlesLayer = svgEl('g', { id: 'circles-layer' });
  const flashLayer   = svgEl('g', { id: 'flash-layer' });
  const lettersLayer = svgEl('g', { id: 'letters-layer' });
  const labelsLayer  = svgEl('g', { id: 'labels-layer' });
  svg.append(cellsLayer, circlesLayer, flashLayer, lettersLayer, labelsLayer);

  for (let n = 1; n <= N * N; n++) {
    const r = rowOf(n), c = colOf(n);
    const x = (c - 1) * CELL_SIZE, y = (r - 1) * CELL_SIZE;

    if (n === CENTER_N) {
      const rect = svgEl('rect', {
        id: 'cell-center', x, y,
        width: CELL_SIZE, height: CELL_SIZE,
        class: 'cell-center',
      });
      cellsLayer.appendChild(rect);
      continue;
    }

    const bIdx = bandOf(n);
    const bandClass = bIdx % 2 === 0 ? 'band-even' : 'band-odd';
    const rect = svgEl('rect', {
      id: `cell-${n}`, x, y,
      width: CELL_SIZE, height: CELL_SIZE,
      class: `cell ${bandClass}`,
    });
    cellsLayer.appendChild(rect);
    cellRects[n] = rect;

    const cx = x + CELL_SIZE / 2, cy = y + CELL_SIZE / 2;
    const text = svgEl('text', {
      id: `letter-${n}`,
      x: cx, y: cy,
      class: 'cell-letter',
    });
    lettersLayer.appendChild(text);
    letterTexts[n] = text;
  }

  // Band letter labels at top-left corner of each band
  for (let k = 0; k < numBands; k++) {
    const n = cellId(k+1, k+1);
    const r = rowOf(n), c = colOf(n);
    const x = (c-1) * CELL_SIZE + 2;
    const y = (r-1) * CELL_SIZE + 9;
    const label = svgEl('text', { x, y, 'font-size': '8', class: 'band-label' });
    label.textContent = BAND_LETTERS[k];
    labelsLayer.appendChild(label);
  }

  // Rows and bands list the same circled cell (the circle rule); draw it once.
  const circledCells = new Set();
  function renderCircles(groups, cellsForGroup) {
    groups.forEach((group, gi) => {
      let offset = 0;
      group.entries.forEach(entry => {
        if (entry.styles && Array.isArray(entry.styles.circle)) {
          entry.styles.circle.forEach(pos => {
            const n = cellsForGroup(gi)[offset + pos];
            if (n === undefined || circledCells.has(n)) return;
            circledCells.add(n);
            const cx = (colOf(n) - 1) * CELL_SIZE + CELL_SIZE / 2;
            const cy = (rowOf(n) - 1) * CELL_SIZE + CELL_SIZE / 2;
            circlesLayer.appendChild(svgEl('circle', { class: 'style-circle', cx, cy, r: CELL_SIZE / 2 - 2 }));
          });
        }
        offset += entry.length;
      });
    });
  }
  renderCircles(data.rows,  r => rowCellsMap[r]);
  renderCircles(data.bands, k => bandCellsMap[k]);

  const rowLabelsDiv = document.getElementById('row-labels');
  for (let r = 1; r <= N; r++) rowLabelsDiv.appendChild(htmlEl('div', { class: 'row-label' }, String(r)));

  // ── Header & clues ────────────────────────────────────────────────────────
  renderByline(data);
  renderInstructions(data);

  const rowsCluesList  = document.getElementById('rows-clues');
  const bandsCluesList = document.getElementById('bands-clues');

  // Builds a clue cluster for one row/band. parentLabel is the row number or band
  // letter, shown only on the first entry; subsequent entries get a blank parent so
  // entry boundaries within the row/band are not revealed. onGroupClick(gi) is called
  // when the user clicks anywhere in the group, navigating to that row/band.
  function buildClues(groups, listEl, itemStore, parentLabel, onGroupClick) {
    groups.forEach((group, gi) => {
      const groupLi = htmlEl('li', { class: 'clue-group' },
        htmlEl('ul', {}, ...group.entries.map((entry, i) =>
          htmlEl('li', { class: 'clue-item' },
            htmlEl('span', { class: 'clue-label' },
              htmlEl('span', { class: 'clue-parent' }, i === 0 ? parentLabel(gi) : ''),
              htmlEl('span', { class: 'clue-letter' }, String.fromCharCode(97 + i))),
            clueTextEl(entry.clue)))));
      onClueClick(groupLi, () => onGroupClick(gi));
      listEl.appendChild(groupLi);
      itemStore.push(groupLi);
    });
  }
  buildClues(data.rows,  rowsCluesList,  rowClueGroups,  r => String(r + 1),
    gi => { mode = 'row';  focusCell(rowCellsMap[gi][0]); });
  buildClues(data.bands, bandsCluesList, bandClueGroups, k => BAND_LETTERS[k],
    gi => { mode = 'band'; focusCell(bandCellsMap[gi][0]); });

  // ── Event wiring ──────────────────────────────────────────────────────────
  // The page's static elements. Logic functions above use them (focusCell calls
  // refocus, syncUI writes the bar); they first run in Restore & focus, after this.
  const hiddenInput = document.getElementById('hidden-input');
  const refocus = () => hiddenInput.focus({ preventScroll: true });

  const modeBtns   = Array.from(document.querySelectorAll('#mode-toggle .toggle-opt'));
  const checkBtn   = document.getElementById('check-btn');
  const doneWrong  = document.getElementById('done-wrong');
  const puzzleCenter = document.querySelector('.puzzle-center'); // the sticky grid box

  // #rebus-btn — docs/CROSS_TOOL_SPEC.md → Enter / Rebus button.
  const rebusBtn = setupRebusButton(document.getElementById('rebus-btn'), {
    onToggle:    toggleRebus,
    isComposing: () => composer.isComposing(activeCell),
    refocus,
  });

  setupEmbedResize();
  document.getElementById('mode-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.toggle-opt');
    if (!btn) return;
    mode = btn.dataset.mode;
    focusCell(activeCell);
  });

  const keysOverlay = setupKeysOverlay(
    [
      ['Tab',       'Next row or band'],
      ['Shift+Tab', 'Previous row or band'],
      ['↑ ↓ ← →',   'Move one cell'],
      ['⌫',         'Clear current cell'],
      ['Space',     'Clear and advance'],
      ['Enter',     'Multi-letter cell'],
      ['.',         'Toggle row / band mode'],
    ],
    refocus
  );
  setupKeydown(e => {
    if (latch.solved) return;
    if (e.key === '.') {
      e.preventDefault();
      mode = MODES[mode].other;
      focusCell(activeCell);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const m = MODES[mode];
      const step = e.shiftKey ? -1 : 1;
      focusCell(m.cells[(m.index() + step + m.count) % m.count][0]);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      toggleRebus();
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (composer.backspace(activeCell)) {
        syncUI();
        saveState();
        return;
      }
      if (getCellLetter(activeCell)) {
        setCellLetter(activeCell, '');
        syncUI();
      } else {
        const prev = prevCell(activeCell);
        setCellLetter(prev, '');
        focusCell(prev);   // focusCell syncUIs and refocuses the hidden input
      }
      saveState();
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
      setCellLetter(activeCell, '');
      focusCell(nextCell(activeCell));
      saveState();
      return;
    }

    if (e.key === 'ArrowRight') { e.preventDefault(); const t = arrowTarget(activeCell, 0, 1, N);  if (t) focusCell(t); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); const t = arrowTarget(activeCell, 0, -1, N); if (t) focusCell(t); return; }
    if (e.key === 'ArrowDown')  {
      e.preventDefault();
      const t = arrowTarget(activeCell, 1, 0, N);
      if (t) focusCell(t); else scrollByKey('ArrowDown');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const t = arrowTarget(activeCell, -1, 0, N);
      if (t) focusCell(t); else scrollByKey('ArrowUp');
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
    // Advance only when typeLetter says to, so capacity never triggers an advance.
    if (composer.typeLetter(activeCell, typed)) focusCell(nextCell(activeCell));
    else syncUI();

    // Advance first, then check (docs/CROSS_TOOL_SPEC.md → Hashed-mode feedback
    // timing).
    checker.checkIfFilled();
    saveState();
  });

  // A click on a cell moves there; a second click on the active cell switches mode.
  setupCellClicks(svg, n => {
    if (n === activeCell) mode = MODES[mode].other;
    focusCell(n);
  });

  function resetBoard() {
    resetAndRefocus({
      composer, clearState, timer, latch,
      clearBoard() {
        cells.clearCells();
        flashLayer.replaceChildren();
        mode = 'row';
      },
      focusInitial: () => focusCell(FIRST_CELL),
    });
  }

  const controls = setupControls({
    checkBtn, checker, hashed: data.hashed, onCheck: checkCell,
    onClear: resetBoard, refocus, key: saveKey,
  });

  // ── Restore & focus ───────────────────────────────────────────────────────
  // Structurally a no-op here — markSolved paints exactly what applyState
  // restored, and MB marks no clue items — but the epilogue stays identical across
  // all four engines so the shared restore contract has one shape, not two.
  const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
  // Resume on the restored composing cell (docs/CROSS_TOOL_SPEC.md → "Composition is
  // saved state").
  focusCell(resumeCell === null ? FIRST_CELL : resumeCell);
}

document.addEventListener('DOMContentLoaded', init);

