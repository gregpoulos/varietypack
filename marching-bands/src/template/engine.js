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
import { setupPhoneLayout, stepIndex } from '../../../shared/engine-phone.mjs';
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
  // The phone's clue navigator (Header & clues): which row or band it is on, as mode and
  // index, and which of that group's clues it shows. syncUI resets navIdx to 0 only when
  // the group changes; a tap on a list clue or ‹ › is the only thing that sets another.
  // Why it never moves on its own: docs/CROSS_TOOL_SPEC.md → "Marching Bands on a phone".
  let navGroup = null;   // `${mode}:${index}`
  let navIdx = 0;

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
    row:  { cells: rowCellsMap,  index: activeRowIndex,  count: N,        groups: rowClueGroups,  other: 'band',
            data: data.rows,  name: i => `Row ${i + 1}` },
    band: { cells: bandCellsMap, index: activeBandIndex, count: numBands, groups: bandClueGroups, other: 'row',
            data: data.bands, name: i => `Band ${BAND_LETTERS[i]}` },
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

    // Phone clue navigator: back to the first clue whenever the row or band changes.
    const group = `${mode}:${activeMode.index()}`;
    if (group !== navGroup) { navGroup = group; navIdx = 0; }
    if (phone) navigator.render();

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
  const { saveState, restoreState, clearState, hasSave } = setupStorage(saveKey, {
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
  // Row numbers sit in a column left of the grid, in the SVG so both scale together.
  const LABEL_W = 24;
  svg.setAttribute('width',   LABEL_W + svgSize);
  svg.setAttribute('height',  svgSize);
  svg.setAttribute('viewBox', `${-LABEL_W} 0 ${LABEL_W + svgSize} ${svgSize}`);

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

  // Row number labels, right-aligned against the grid's left edge
  for (let r = 1; r <= N; r++) {
    const label = svgEl('text', {
      x: -8, y: (r - 1) * CELL_SIZE + CELL_SIZE / 2, class: 'row-label', 'aria-hidden': 'true',
    });
    label.textContent = String(r);
    labelsLayer.appendChild(label);
  }

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

  // The phone's clue navigator, for the bar row (Event wiring): `Row 1` / `clue 2 of 3`,
  // that clue, and ‹ › through the active row's or band's clues. A tap on its text shows
  // a cut-off clue in full (setupClueExpand); the bottom row's switch key and a tap on
  // the active cell change the mode. Built everywhere, shown and rendered only in the
  // phone layout.
  function buildNavigator() {
    const label = htmlEl('span', { class: 'nav-label' });
    const count = htmlEl('span', { class: 'nav-count' });
    const text  = htmlEl('span', { class: 'nav-text' });
    const step = (id, glyph, ariaLabel, d) => {
      const btn = htmlEl('button', { id, type: 'button', class: 'bar-step', 'aria-label': ariaLabel }, glyph);
      btn.addEventListener('click', () => {
        navIdx = stepIndex(navIdx, MODES[mode].data[MODES[mode].index()].entries.length, d);
        render();
      });
      return btn;
    };
    const el = htmlEl('div', { id: 'clue-navigator' },
      step('clue-prev', '‹', 'Previous clue', -1),
      htmlEl('span', { class: 'nav-meta' }, label, count), text,
      step('clue-next', '›', 'Next clue', 1));
    function render() {
      const m = MODES[mode], i = m.index();
      const entries = m.data[i].entries;
      label.textContent = m.name(i);
      count.textContent = `clue ${navIdx + 1} of ${entries.length}`;
      text.innerHTML = entries[navIdx].clue;   // pre-rendered markdown, as clueTextEl
      phone.showingClue(entries[navIdx]);
    }
    return { el, text, render };
  }
  const navigator = buildNavigator();

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

  // On a touch-first device only: the phone solving view and its drawn keyboard. ◂ ▸
  // step along the active row or band, which no key does here (the arrows are spatial),
  // so they call the engine directly; on a solved board, like every key, they do nothing.
  const stepTo = target => () => { if (!latch.solved) focusCell(target(activeCell)); };
  const phone = setupPhoneLayout({
    hiddenInput,
    refocus,
    checkBtn,
    firstVisit: !hasSave(),
    grid: document.getElementById('grid-wrap'),
    lists: [document.querySelector('.clue-section-rows'), document.querySelector('.clue-section-bands')],
    clueBar: navigator,
    ownSteps: true,
    bottomRow: [
      { label: '◂', onTap: stepTo(prevCell), glyph: true },
      { el: document.getElementById('rebus-btn') },
      { label: 'Row ⇄ Band', key: '.', wide: true },
      { label: '▸', onTap: stepTo(nextCell), glyph: true },
    ],
  });

  // A tap on a group in the list shows the grid again, and a tap on one of its clues
  // opens the navigator on that clue. Capture phase, so this runs before the group's own
  // click handler, whose focusCell then lets syncUI see no change of group and keep the
  // index.
  if (phone) {
    onClueClick(phone.listPane, e => {
      const group = e.target.closest('.clue-group');
      if (!group) return;
      const item = e.target.closest('.clue-item');
      if (item) {
        const m = Object.keys(MODES).find(k => MODES[k].groups.includes(group));
        navGroup = `${m}:${MODES[m].groups.indexOf(group)}`;
        navIdx = Array.from(group.querySelectorAll('.clue-item')).indexOf(item);
      }
      phone.hideList();
    }, { capture: true });
  }

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

