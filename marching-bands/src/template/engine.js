/* global window, document */
(function () {
  'use strict';

  function init() {
    // ── Data & constants ─────────────────────────────────────────────────────
    const data = window.PUZZLE_DATA;
    const N = data.size;
    const numBands = Math.floor(N / 2);
    const CELL_SIZE = 34;
    const BAND_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    // ── Geometry & index maps ─────────────────────────────────────────────────
    // bandIndexOf/bandCells/centerN come from src/layout.js, concatenated ahead of this
    // file by the builder — the same functions the validator and hasher use, so the
    // engine's band traversal cannot drift from theirs.
    function cellId(row, col)  { return (row - 1) * N + col; }
    function rowOf(n)          { return Math.ceil(n / N); }
    function colOf(n)          { return ((n - 1) % N) + 1; }
    function bandOf(n)         { return bandIndexOf(rowOf(n), colOf(n), N); }

    // 1-indexed center cell ID (odd N only, -1 for even N)
    const CENTER_N = (N % 2 === 1) ? centerN(N) : -1;

    // bandCellsMap[k]: clockwise-ordered 1-indexed cell IDs for band k
    const bandCellsMap = Array.from({ length: numBands }, (_, k) => bandCells(k, N));

    // rowCellsMap[r]: left-to-right 1-indexed cell IDs for row r (0-indexed), skipping center
    const rowCellsMap = [];
    for (let r = 0; r < N; r++) {
      const cells = [];
      for (let c = 1; c <= N; c++) {
        const n = cellId(r+1, c);
        if (n !== CENTER_N) cells.push(n);
      }
      rowCellsMap.push(cells);
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let mode = 'row';    // 'row' | 'band'
    let activeN = rowCellsMap[0][0]; // first non-center cell of row 0

    // ── Logic functions ───────────────────────────────────────────────────────
    // #hidden-input is static markup, present regardless of when this runs, so this can be
    // declared up front rather than waiting for a local hiddenInput const (MB has none).
    const refocus = () => document.getElementById('hidden-input').focus({ preventScroll: true });

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
      setLetterText(letterTexts[n], letter);
      setCorrect(n, false);
    }

    // Multi-letter (rebus) entry state. Commit is wired at exactly one place — the top
    // of focusCell — which covers every cursor move because activeN is assigned
    // nowhere else.
    const composer = makeComposer({
      getContent: n => getCellLetter(n),
      setContent: (n, s) => setCellLetter(n, s),
      getCellEl:  n => cellRects[n],
      onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    });

    // Row-major order skipping the black centre — the canonical board string order.
    // The centre contributes nothing to the string, not an empty segment.
    const CELL_IDS = [];
    for (let n = 1; n <= N * N; n++) if (n !== CENTER_N) CELL_IDS.push(n);

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
      markSolved:          () => markAllCorrect(),
      syncUI:              () => syncUI(),
    });

    function activeRowIndex()  { return rowOf(activeN) - 1; }   // 0-indexed
    function activeBandIndex() { return bandOf(activeN); }       // 0-indexed

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

    function arrowTarget(n, dr, dc) {
      let r = rowOf(n) + dr;
      let c = colOf(n) + dc;
      if (r >= 1 && r <= N && c >= 1 && c <= N) {
        const candidate = cellId(r, c);
        if (candidate === CENTER_N) { r += dr; c += dc; }
      }
      if (r < 1 || r > N || c < 1 || c > N) return null;
      return cellId(r, c);
    }

    function focusCell(n) {
      composer.commitIfMoved(n);
      activeN = n;
      syncUI();
      refocus();
    }

    // The one rebus toggle, shared by the Enter key and #rebus-btn. Both entry points must
    // behave identically, so neither gets its own copy of the composer call. Committing
    // does not advance the cursor — only an explicit move (arrow, Tab, click) does.
    function toggleRebus() {
      composer.enter(activeN);
      syncUI();
    }

    // Declared above syncUI (which calls rebusBtn.sync()) — see docs/CROSS_TOOL_SPEC.md →
    // "Enter / Rebus button" for the TDZ rationale. Never hidden and never disabled —
    // unlike #check-btn. See setupRebusButton.
    const rebusBtn = setupRebusButton(document.getElementById('rebus-btn'), {
      onToggle:    toggleRebus,
      isComposing: () => composer.isComposing(activeN),
      isSolved:    () => latch.solved,
      refocus,
    });

    function syncUI() {
      // Composition also ends on any cursor move, which never touches the button.
      rebusBtn.sync();

      // Clear transient highlight classes — band-even/band-odd and correct never change here
      for (const n of CELL_IDS) cellRects[n].classList.remove('active-entry', 'active-cell');

      // Highlight active row or band (all its cells)
      for (const n of activeContextCells()) cellRects[n].classList.add('active-entry');

      // Mark active cell
      const activeRect = cellRects[activeN];
      activeRect.classList.remove('active-entry');
      activeRect.classList.add('active-cell');
      cellsLayer.appendChild(activeRect); // paint on top so stroke is uniform on all four sides

      // Clear all clue highlights
      for (const m of Object.values(MODES)) {
        for (const group of m.groups) group.classList.remove('active-clue', 'secondary-entry');
      }

      // Highlight active row/band clue cluster; secondary-highlight the cross-mode cluster
      const activeMode = MODES[mode];
      const crossMode  = MODES[activeMode.other];
      activeMode.groups[activeMode.index()].classList.add('active-clue');
      crossMode.groups[crossMode.index()].classList.add('secondary-entry');

      // Mode toggle active segment
      document.querySelectorAll('#mode-toggle .toggle-opt').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });

      // Check button: enable only if active cell has a letter and is not already correct (non-hashed mode)
      if (!data.hashed) {
        document.getElementById('check-btn').disabled =
          !composer.isCellFilled(activeN) || isCorrect(activeN);
      }

      // Congrats / done-wrong banners are derived purely from board state.
      const allFilled = checker.isBoardFilled();
      const solved    = checker.isSolved();
      document.getElementById('done-wrong').hidden = !(allFilled && !solved);

      // Scroll active clue cluster into view
      activeMode.groups[activeMode.index()]?.scrollIntoView({ block: 'nearest' });
      latch.check(solved);
    }

    function markAllCorrect() {
      for (const n of CELL_IDS) setCorrect(n, true);
    }

    function checkCell() {
      const n = activeN;
      // The focus call is required on every path out: the button holds focus here, and the
      // document keydown listener's BUTTON guard would swallow the next navigation key.
      // The already-correct guard skips a redundant re-save; setCellLetter clears the flag
      // on any content change, so a flagged cell always still holds correct content.
      if (!isCorrect(n) && composer.isCellFilled(n)) {
        if (isCellCorrect(getCellLetter(n), data.letters[n - 1])) {
          setCorrect(n, true);
          saveState();          // only this branch mutates persisted state
        } else {
          flashWrong(cellRects[n], flashLayer);
        }
      }
      syncUI();
      refocus();
    }

    const saveKey = storageKey('mb', data);
    const { saveState, restoreState, clearState } = setupStorage(saveKey, {
      cellCount: N * N - (N % 2),
      getState() {
        const letters = {};
        const correct = [];
        for (const n of CELL_IDS) {
          const l = getCellLetter(n);
          if (l) letters[n] = l;
          if (isCorrect(n)) correct.push(n);
        }
        return {
          letters, correct, activeMs: timer.getElapsedMs(),
          composing: composer.getComposing(),
        };
      },
      applyState(saved) {
        for (const n of CELL_IDS) {
          const letter = saved.letters?.[n];
          if (!letter) continue;
          cellLetters[n] = letter;
          setLetterText(letterTexts[n], letter);
        }
        for (const n of (saved.correct || [])) setCorrect(n, true);
        timer.restoreMs(saved.activeMs);
        // After the letters are painted, so the composing cell shows its partial content.
        // Absent in saves predating this field; composer.restore treats that as null.
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
      rect.addEventListener('click', () => onCellClick(n));
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

    function renderCircles(groups, cellsForGroup) {
      groups.forEach((group, gi) => {
        let offset = 0;
        group.entries.forEach(entry => {
          if (entry.styles && Array.isArray(entry.styles.circle)) {
            entry.styles.circle.forEach(pos => {
              const n = cellsForGroup(gi)[offset + pos];
              if (n === undefined) return;
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
    for (let r = 1; r <= N; r++) {
      const div = document.createElement('div');
      div.className = 'row-label';
      div.textContent = r;
      rowLabelsDiv.appendChild(div);
    }

    // ── Header & clues ────────────────────────────────────────────────────────
    const rowsCluesList  = document.getElementById('rows-clues');
    const bandsCluesList = document.getElementById('bands-clues');

    // Builds a clue cluster for one row/band. parentLabel is the row number or band
    // letter, shown only on the first entry; subsequent entries get a blank parent so
    // entry boundaries within the row/band are not revealed. onGroupClick(gi) is called
    // when the user clicks anywhere in the group, navigating to that row/band.
    function buildClues(groups, listEl, itemStore, parentLabel, onGroupClick) {
      groups.forEach((group, gi) => {
        const groupLi = document.createElement('li');
        groupLi.className = 'clue-group';
        groupLi.addEventListener('click', e => {
          // A clue can render a real link (see docs/CROSS_TOOL_SPEC.md ->
          // Markdown formatting) — let it open on its own rather than also
          // treating the click as navigating to this row/band.
          if (e.target.closest('a')) return;
          onGroupClick(gi);
        });
        const innerUl = document.createElement('ul');
        group.entries.forEach((entry, i) => {
          const li = document.createElement('li');
          li.className = 'clue-item';
          const labelEl = document.createElement('span');
          labelEl.className = 'clue-label';
          const parentEl = document.createElement('span');
          parentEl.className = 'clue-parent';
          parentEl.textContent = i === 0 ? parentLabel(gi) : '';
          const letterEl = document.createElement('span');
          letterEl.className = 'clue-letter';
          letterEl.textContent = String.fromCharCode(97 + i);
          labelEl.append(parentEl, letterEl);
          const textEl = document.createElement('span');
          textEl.className = 'clue-text';
          textEl.innerHTML = entry.clue; // pre-rendered markdown HTML — see shared/build/renderMarkdown.js
          li.append(labelEl, textEl);
          innerUl.appendChild(li);
        });
        groupLi.appendChild(innerUl);
        listEl.appendChild(groupLi);
        itemStore.push(groupLi);
      });
    }
    buildClues(data.rows,  rowsCluesList,  rowClueGroups,  r => String(r + 1),
      gi => { mode = 'row';  focusCell(rowCellsMap[gi][0]); });
    buildClues(data.bands, bandsCluesList, bandClueGroups, k => BAND_LETTERS[k],
      gi => { mode = 'band'; focusCell(bandCellsMap[gi][0]); });

    renderByline(data);
    renderInstructions(data);

    // ── Event wiring ──────────────────────────────────────────────────────────
    document.getElementById('mode-toggle').addEventListener('click', e => {
      const btn = e.target.closest('.toggle-opt');
      if (!btn) return;
      mode = btn.dataset.mode;
      focusCell(activeN);
    });

    function onCellClick(n) {
      if (n === activeN) {
        mode = MODES[mode].other;
      }
      focusCell(n);
    }

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
        focusCell(activeN);
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
        if (composer.backspace(activeN)) {
          syncUI();
          saveState();
          return;
        }
        if (getCellLetter(activeN)) {
          setCellLetter(activeN, '');
          syncUI();
        } else {
          const prev = prevCell(activeN);
          setCellLetter(prev, '');
          focusCell(prev);   // focusCell syncUIs and refocuses the hidden input
        }
        saveState();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        setCellLetter(activeN, '');
        focusCell(nextCell(activeN));
        saveState();
        return;
      }

      if (e.key === 'ArrowRight') { e.preventDefault(); const t = arrowTarget(activeN, 0, 1);  if (t) focusCell(t); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); const t = arrowTarget(activeN, 0, -1); if (t) focusCell(t); return; }
      if (e.key === 'ArrowDown')  {
        e.preventDefault();
        const t = arrowTarget(activeN, 1, 0);
        if (t) focusCell(t); else scrollByKey('ArrowDown');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const t = arrowTarget(activeN, -1, 0);
        if (t) focusCell(t); else scrollByKey('ArrowUp');
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
      // typeLetter applies the slice(-1) rule on the non-composing path; advance only
      // when it says so, so capacity never triggers an advance.
      if (composer.typeLetter(activeN, typed)) focusCell(nextCell(activeN));
      else syncUI();

      // One checker call for both modes — advance first, then check, so the cursor
      // never lags a keystroke behind the hash comparison.
      checker.checkIfFilled();
      saveState();
    });


    function resetBoard() {
      resetAndRefocus({
        composer, clearState, timer, latch,
        clearBoard() {
          for (const n of CELL_IDS) {
            delete cellLetters[n];
            setLetterText(letterTexts[n], '');
            setCorrect(n, false);
          }
          flashLayer.replaceChildren();
          mode = 'row';
        },
        focusInitial: () => focusCell(rowCellsMap[0][0]),
      });
    }

    setupControls({
      checkBtn: document.getElementById('check-btn'), hashed: data.hashed, onCheck: checkCell,
      onClear: resetBoard, refocus, key: saveKey,
    });

    // ── Restore & focus ───────────────────────────────────────────────────────
    // Structurally a no-op here — markAllCorrect() paints exactly what applyState
    // restored, and MB marks no clue items — but the epilogue stays identical across
    // all four engines so the shared restore contract has one shape, not two.
    const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
    // Resume on the restored composing cell — see docs/CROSS_TOOL_SPEC.md → "Composition
    // is saved state" for why this is load-bearing, not a convenience.
    focusCell(resumeCell === null ? activeN : resumeCell);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
