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
    const ns = 'http://www.w3.org/2000/svg';

    // ── Geometry & index maps ─────────────────────────────────────────────────
    function cellId(row, col)  { return (row - 1) * N + col; }
    function rowOf(n)          { return Math.ceil(n / N); }
    function colOf(n)          { return ((n - 1) % N) + 1; }
    function bandOf(n)         { const r = rowOf(n), c = colOf(n); return Math.min(r-1, c-1, N-r, N-c); }

    // 1-indexed center cell ID (odd N only, -1 for even N)
    const CENTER_N = (N % 2 === 1) ? Math.floor(N / 2) * N + Math.ceil(N / 2) : -1;

    // bandCellsMap[k]: clockwise-ordered 1-indexed cell IDs for band k
    const bandCellsMap = [];
    for (let k = 0; k < numBands; k++) {
      const cells = [];
      for (let col = k+1; col <= N-k; col++)          cells.push(cellId(k+1, col));
      for (let row = k+2; row <= N-k; row++)           cells.push(cellId(row, N-k));
      for (let col = N-k-1; col >= k+1; col--)        cells.push(cellId(N-k, col));
      for (let row = N-k-1; row >= k+2; row--)        cells.push(cellId(row, k+1));
      bandCellsMap.push(cells);
    }

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
    let congratsDismissed = false;

    // ── Logic functions ───────────────────────────────────────────────────────
    const cellLetters = {};
    function getCellLetter(n) { return cellLetters[n] || ''; }
    function setCellLetter(n, letter) {
      if (letter) cellLetters[n] = letter;
      else delete cellLetters[n];
      const el = document.getElementById(`letter-${n}`);
      if (el) {
        el.textContent = letter;
        el.classList.remove('correct');
      }
      const rect = document.getElementById(`cell-${n}`);
      if (rect) {
        delete rect.dataset.correct;
        rect.classList.remove('correct');
      }
    }

    function activeRowIndex()  { return rowOf(activeN) - 1; }   // 0-indexed
    function activeBandIndex() { return bandOf(activeN); }       // 0-indexed

    function activeContextCells() {
      return mode === 'row'
        ? rowCellsMap[activeRowIndex()]
        : bandCellsMap[activeBandIndex()];
    }

    function nextCell(n) {
      const cells = activeContextCells();
      const pos = cells.indexOf(n);
      if (pos < cells.length - 1) return cells[pos + 1];
      // Wrap to first cell of next row or band
      if (mode === 'row') {
        const nextRow = (activeRowIndex() + 1) % N;
        return rowCellsMap[nextRow][0];
      } else {
        const nextBand = (activeBandIndex() + 1) % numBands;
        return bandCellsMap[nextBand][0];
      }
    }

    function prevCell(n) {
      const cells = activeContextCells();
      const pos = cells.indexOf(n);
      if (pos > 0) return cells[pos - 1];
      // Wrap to last cell of previous row or band
      if (mode === 'row') {
        const prevRow = (activeRowIndex() - 1 + N) % N;
        const rc = rowCellsMap[prevRow];
        return rc[rc.length - 1];
      } else {
        const prevBand = (activeBandIndex() - 1 + numBands) % numBands;
        const bc = bandCellsMap[prevBand];
        return bc[bc.length - 1];
      }
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
      activeN = n;
      syncUI();
      document.getElementById('hidden-input').focus({ preventScroll: true });
    }

    function isBoardFilled() {
      for (let n = 1; n <= N * N; n++) {
        if (n === CENTER_N) continue;
        if (!getCellLetter(n)) return false;
      }
      return true;
    }
    // True when every active cell carries the .correct marker.
    function isSolved() {
      for (let n = 1; n <= N * N; n++) {
        if (n === CENTER_N) continue;
        if (!cellRects[n]?.dataset.correct) return false;
      }
      return true;
    }
    // True when every active cell's letter matches the answer (non-hashed only).
    function allCellsCorrect() {
      for (let n = 1; n <= N * N; n++) {
        if (n === CENTER_N) continue;
        if (!isCellCorrect(getCellLetter(n), data.letters[n - 1])) return false;
      }
      return true;
    }

    function syncUI() {
      // Clear transient highlight classes — band-even/band-odd and correct never change here
      for (let n = 1; n <= N * N; n++) {
        if (n === CENTER_N) continue;
        cellRects[n]?.classList.remove('active-entry', 'active-cell');
      }

      // Highlight active row or band (all its cells)
      const contextCells = activeContextCells();
      for (const n of contextCells) {
        const rect = cellRects[n];
        if (rect && !rect.dataset.correct) rect.classList.add('active-entry');
      }

      // Mark active cell
      const activeRect = cellRects[activeN];
      if (activeRect) {
        activeRect.classList.remove('active-entry');
        activeRect.classList.add('active-cell');
        cellsLayer.appendChild(activeRect); // paint on top so stroke is uniform on all four sides
      }

      // Clear all clue highlights
      for (const group of rowClueGroups)  { group.classList.remove('active-clue'); group.classList.remove('secondary-clue'); }
      for (const group of bandClueGroups) { group.classList.remove('active-clue'); group.classList.remove('secondary-clue'); }

      // Highlight active row/band clue cluster; secondary-highlight the cross-direction cluster
      if (mode === 'row') {
        rowClueGroups[activeRowIndex()].classList.add('active-clue');
        bandClueGroups[activeBandIndex()].classList.add('secondary-clue');
      } else {
        bandClueGroups[activeBandIndex()].classList.add('active-clue');
        rowClueGroups[activeRowIndex()].classList.add('secondary-clue');
      }

      // Mode toggle active segment
      document.querySelectorAll('#mode-toggle .toggle-opt').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });

      // Check button: enable only if active cell has a letter and is not already correct (non-hashed mode)
      if (!data.hashed) {
        document.getElementById('check-btn').disabled =
          !getCellLetter(activeN) || !!activeRect?.dataset.correct;
      }

      // Congrats / done-wrong banners are derived purely from board state.
      const allFilled = isBoardFilled();
      const solved    = isSolved();
      if (!congratsDismissed) document.getElementById('congrats-overlay').hidden = !solved;
      document.getElementById('done-wrong').hidden = !(allFilled && !solved);

      // Scroll active clue cluster into view
      const activeClueGroup = mode === 'row'
        ? rowClueGroups[activeRowIndex()]
        : bandClueGroups[activeBandIndex()];
      activeClueGroup?.scrollIntoView({ block: 'nearest' });
    }

    function markAllCorrect() {
      for (let n = 1; n <= N * N; n++) {
        if (n === CENTER_N) continue;
        const rect = cellRects[n];
        if (rect) { rect.dataset.correct = '1'; rect.classList.add('correct'); }
        letterTexts[n]?.classList.add('correct');
      }
    }

    function checkCell() {
      const n = activeN;
      const rect = cellRects[n];
      if (rect?.dataset.correct) return; // already correct
      const letter = getCellLetter(n);
      if (!letter) return;
      if (!isCellCorrect(letter, data.letters[n - 1])) {
        if (rect) flashWrong(rect, flashLayer);
        return;
      }
      if (rect) { rect.dataset.correct = '1'; rect.classList.add('correct'); }
      letterTexts[n]?.classList.add('correct');
      saveState();
      syncUI();
      document.getElementById('hidden-input').focus({ preventScroll: true });
    }

    // Non-hashed: once the board is full, reveal correctness only if the WHOLE board
    // is correct. A full-but-wrong board reveals nothing automatically — syncUI() then
    // shows the done-wrong banner (matches Spiral/Snake Charmer).
    function checkAllCellsIfFilled() {
      if (!isBoardFilled()) return;
      if (!allCellsCorrect()) { syncUI(); return; }
      markAllCorrect();
      syncUI();
    }

    // Hashed: once the board is full, hash it and compare to boardHash. On a match,
    // mark everything correct; otherwise syncUI() shows the done-wrong banner.
    function checkBoardIfFilled() {
      if (!isBoardFilled()) return;
      const parts = [];
      for (let n = 1; n <= N * N; n++) {
        if (n === CENTER_N) continue;
        parts.push(getCellLetter(n).toLowerCase());
      }
      if (sha256hex(parts.join('')) !== data.boardHash) { syncUI(); return; }
      markAllCorrect();
      syncUI();
    }

    const { saveState, restoreState, clearState } = setupStorage(storageKey('mb', data), {
      cellCount: N * N - (N % 2),
      getState() {
        const letters = {};
        const correct = [];
        for (let n = 1; n <= N * N; n++) {
          if (n === CENTER_N) continue;
          const l = getCellLetter(n);
          if (l) letters[n] = l;
          if (cellRects[n]?.dataset.correct) correct.push(n);
        }
        return { letters, correct };
      },
      applyState(saved) {
        for (const [nStr, letter] of Object.entries(saved.letters || {})) {
          const n = Number(nStr);
          if (n === CENTER_N) continue;
          cellLetters[n] = letter;
          const el = document.getElementById(`letter-${n}`);
          if (el) el.textContent = letter;
        }
        for (const n of (saved.correct || [])) {
          const rect = cellRects[n];
          if (rect) { rect.dataset.correct = '1'; rect.classList.add('correct'); }
          letterTexts[n]?.classList.add('correct');
        }
      },
    });

    // ── Build SVG ─────────────────────────────────────────────────────────────
    const cellRects  = {};  // n → <rect>
    const letterTexts = {}; // n → <text>

    const svg = document.getElementById('puzzle-svg');
    const svgSize = N * CELL_SIZE;
    svg.setAttribute('width',   svgSize);
    svg.setAttribute('height',  svgSize);
    svg.setAttribute('viewBox', `0 0 ${svgSize} ${svgSize}`);

    function makeSvgEl(tag, attrs) {
      const el = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    }

    const cellsLayer   = makeSvgEl('g', { id: 'cells-layer' });
    const circlesLayer = makeSvgEl('g', { id: 'circles-layer' });
    const flashLayer   = makeSvgEl('g', { id: 'flash-layer' });
    const lettersLayer = makeSvgEl('g', { id: 'letters-layer' });
    const labelsLayer  = makeSvgEl('g', { id: 'labels-layer' });
    svg.append(cellsLayer, circlesLayer, flashLayer, lettersLayer, labelsLayer);

    for (let n = 1; n <= N * N; n++) {
      const r = rowOf(n), c = colOf(n);
      const x = (c - 1) * CELL_SIZE, y = (r - 1) * CELL_SIZE;

      if (n === CENTER_N) {
        const rect = makeSvgEl('rect', {
          id: 'cell-center', x, y,
          width: CELL_SIZE, height: CELL_SIZE,
          class: 'cell-center',
        });
        cellsLayer.appendChild(rect);
        continue;
      }

      const bIdx = bandOf(n);
      const bandClass = bIdx % 2 === 0 ? 'band-even' : 'band-odd';
      const rect = makeSvgEl('rect', {
        id: `cell-${n}`, x, y,
        width: CELL_SIZE, height: CELL_SIZE,
        class: `cell ${bandClass}`,
      });
      rect.addEventListener('click', () => onCellClick(n));
      cellsLayer.appendChild(rect);
      cellRects[n] = rect;

      const cx = x + CELL_SIZE / 2, cy = y + CELL_SIZE / 2;
      const text = makeSvgEl('text', {
        id: `letter-${n}`,
        x: cx, y: cy,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '14',
        class: 'cell-letter',
      });
      text.textContent = '';
      lettersLayer.appendChild(text);
      letterTexts[n] = text;
    }

    // Band letter labels at top-left corner of each band
    for (let k = 0; k < numBands; k++) {
      const n = cellId(k+1, k+1);
      const r = rowOf(n), c = colOf(n);
      const x = (c-1) * CELL_SIZE + 2;
      const y = (r-1) * CELL_SIZE + 9;
      const label = makeSvgEl('text', { x, y, 'font-size': '8', class: 'band-label' });
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
              circlesLayer.appendChild(makeSvgEl('circle', { class: 'style-circle', cx, cy, r: CELL_SIZE / 2 - 2 }));
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

    // clue group elements indexed by [row/band index] — one <li class="clue-group"> per row/band
    const rowClueGroups  = [];
    const bandClueGroups = [];

    // Builds a clue cluster for one row/band. parentLabel is the row number or band
    // letter, shown only on the first entry; subsequent entries get a blank parent so
    // entry boundaries within the row/band are not revealed. onGroupClick(gi) is called
    // when the user clicks anywhere in the group, navigating to that row/band.
    function buildClues(groups, listEl, itemStore, parentLabel, onGroupClick) {
      groups.forEach((group, gi) => {
        const groupLi = document.createElement('li');
        groupLi.className = 'clue-group';
        groupLi.addEventListener('click', () => onGroupClick(gi));
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
          textEl.textContent = entry.clue;
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

    document.querySelector('h1.title').textContent = data.title;
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
        mode = mode === 'row' ? 'band' : 'row';
        focusCell(n);
      } else {
        focusCell(n);
      }
    }

    const keysOverlay = setupKeysOverlay(
      [
        ['Tab',       'Next row or band'],
        ['Shift+Tab', 'Previous row or band'],
        ['↑ ↓ ← →',   'Move one cell'],
        ['⌫',         'Clear current cell'],
        ['Space',     'Clear and advance'],
        ['.',         'Toggle row / band mode'],
      ],
      () => focusCell(activeN)
    );
    setupKeydown(e => {
      if (e.key === '.') {
        e.preventDefault();
        mode = mode === 'row' ? 'band' : 'row';
        focusCell(activeN);
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        if (mode === 'row') {
          const nextRow = e.shiftKey
            ? (activeRowIndex() - 1 + N) % N
            : (activeRowIndex() + 1) % N;
          focusCell(rowCellsMap[nextRow][0]);
        } else {
          const nextBand = e.shiftKey
            ? (activeBandIndex() - 1 + numBands) % numBands
            : (activeBandIndex() + 1) % numBands;
          focusCell(bandCellsMap[nextBand][0]);
        }
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
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
      const letter = normalize(e.target.value).slice(-1).toUpperCase();
      e.target.value = '';
      if (!letter) return;
      setCellLetter(activeN, letter);
      focusCell(nextCell(activeN));
      if (data.hashed) checkBoardIfFilled();
      else checkAllCellsIfFilled();
      saveState();
    });

    if (data.hashed) {
      document.getElementById('check-btn').hidden = true;
    } else {
      document.getElementById('check-btn').addEventListener('click', checkCell);
    }

    setupClearButton(
      document.getElementById('clear-btn'),
      clearState,
      () => focusCell(activeN)
    );

    const congratsOverlay = document.getElementById('congrats-overlay');

    setupCongratsOverlay(congratsOverlay, () => {
      congratsDismissed = true;
      focusCell(activeN);
    });

    // ── Restore & focus ───────────────────────────────────────────────────────
    restoreState();
    focusCell(activeN);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
