/* global window, document */
(function () {
  'use strict';

  function init() {
    // ── Data & constants ────────────────────────────────────────────────────
    const data       = window.PUZZLE_DATA;
    const totalCells = data.cells.length;

    // ── Geometry & index maps ────────────────────────────────────────────────
    const NS = 'http://www.w3.org/2000/svg';

    function svgEl(tag, attrs) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      return el;
    }

    function polar(r, a) { return [r * Math.cos(a), r * Math.sin(a)]; }
    function f(n) { return n.toFixed(3); }

    function cellPath(cell) {
      const { theta_start: ts, theta_end: te,
              r_inner_start: ris, r_outer_start: ros,
              r_inner_end:   rie, r_outer_end:   roe } = cell;
      const laf       = (te - ts > Math.PI) ? 1 : 0;
      const r_out_arc = (ros + roe) / 2;
      const r_in_arc  = (ris + rie) / 2;
      const [ax, ay] = polar(ris, ts);
      const [bx, by] = polar(ros, ts);
      const [cx, cy] = polar(roe, te);
      const [dx, dy] = polar(rie, te);
      return `M${f(ax)},${f(ay)} L${f(bx)},${f(by)} ` +
             `A${f(r_out_arc)},${f(r_out_arc)} 0 ${laf},1 ${f(cx)},${f(cy)} ` +
             `L${f(dx)},${f(dy)} ` +
             `A${f(r_in_arc)},${f(r_in_arc)} 0 ${laf},0 ${f(ax)},${f(ay)}Z`;
    }

    const inwardMap         = {};
    const inwardEntryCells  = data.inward.map(() => []);
    let cellPos = 1;
    data.inward.forEach((entry, i) => {
      for (let j = 0; j < entry.length; j++) {
        inwardMap[cellPos] = { entryIndex: i, posInEntry: j };
        inwardEntryCells[i].push(cellPos);
        cellPos++;
      }
    });

    const outwardMap        = {};
    const outwardEntryCells = data.outward.map(() => []);
    cellPos = totalCells;
    data.outward.forEach((entry, i) => {
      for (let j = 0; j < entry.length; j++) {
        outwardMap[cellPos] = { entryIndex: i, posInEntry: j };
        outwardEntryCells[i].push(cellPos);
        cellPos--;
      }
    });

    // ── State ────────────────────────────────────────────────────────────────
    let activeCell = 1;
    let direction  = 'inward';
    let congratsDismissed = false;

    // ── Logic functions ──────────────────────────────────────────────────────
    function entryFirstCell(dir, entryIndex) {
      return dir === 'inward'
        ? inwardEntryCells[entryIndex][0]
        : outwardEntryCells[entryIndex][0];
    }

    function entryLastCell(dir, entryIndex) {
      const arr = dir === 'inward' ? inwardEntryCells[entryIndex] : outwardEntryCells[entryIndex];
      return arr[arr.length - 1];
    }

    function nextInDir(cellNum, dir) {
      const map     = dir === 'inward' ? inwardMap : outwardMap;
      const entries = dir === 'inward' ? data.inward : data.outward;
      const { entryIndex, posInEntry } = map[cellNum];
      if (posInEntry < entries[entryIndex].length - 1) {
        return dir === 'inward' ? cellNum + 1 : cellNum - 1;
      }
      const next = (entryIndex + 1) % entries.length;
      return entryFirstCell(dir, next);
    }

    function prevInDir(cellNum, dir) {
      const map     = dir === 'inward' ? inwardMap : outwardMap;
      const entries = dir === 'inward' ? data.inward : data.outward;
      const { entryIndex, posInEntry } = map[cellNum];
      if (posInEntry > 0) {
        return dir === 'inward' ? cellNum - 1 : cellNum + 1;
      }
      const prev = (entryIndex - 1 + entries.length) % entries.length;
      return entryLastCell(dir, prev);
    }

    function nextEntryFirstCell(dir, cellNum) {
      const map     = dir === 'inward' ? inwardMap : outwardMap;
      const entries = dir === 'inward' ? data.inward : data.outward;
      const next    = (map[cellNum].entryIndex + 1) % entries.length;
      return entryFirstCell(dir, next);
    }

    const cellLetters = new Map();

    function getCellLetter(n) { return cellLetters.get(n) || ''; }

    function setCellLetter(n, letter) {
      if (letter) cellLetters.set(n, letter);
      else cellLetters.delete(n);
      letterTexts[n].textContent = letter;
      cellPaths[n].classList.remove('correct');
      letterTexts[n].classList.remove('correct');
    }

    function checkCell() {
      const n = activeCell;
      if (isCellCorrect(getCellLetter(n), data.letters[n - 1])) {
        cellPaths[n].classList.add('correct');
        letterTexts[n].classList.add('correct');
      } else {
        flashWrong(cellPaths[n], flashLayer);
      }
      syncUI();
      saveState();
      document.getElementById('hidden-input').focus({ preventScroll: true });
    }

    function checkAllCellsIfFilled() {
      if (!data.cells.every(c => getCellLetter(c.cell_number) !== '')) return;
      if (!data.cells.every(c => isCellCorrect(getCellLetter(c.cell_number), data.letters[c.cell_number - 1]))) {
        syncUI();
        return;
      }
      data.cells.forEach(c => {
        cellPaths[c.cell_number].classList.add('correct');
        letterTexts[c.cell_number].classList.add('correct');
      });
      syncUI();
    }

    function checkBoardIfFilled() {
      if (!data.cells.every(c => getCellLetter(c.cell_number) !== '')) return;
      const boardStr = inwardEntryCells.flat().map(n => getCellLetter(n)).join('');
      const boardHash = sha256hex(normalize(boardStr));
      if (boardHash !== data.boardHash) { syncUI(); return; }
      data.cells.forEach(c => {
        cellPaths[c.cell_number].classList.add('correct');
        letterTexts[c.cell_number].classList.add('correct');
      });
      data.inward.forEach((_, i) => {
        document.querySelector(`[data-direction="inward"][data-entry-index="${i}"]`)
          ?.classList.add('correct');
      });
      data.outward.forEach((_, i) => {
        document.querySelector(`[data-direction="outward"][data-entry-index="${i}"]`)
          ?.classList.add('correct');
      });
      syncUI();
    }

    function isSolved() {
      return data.cells.every(c => cellPaths[c.cell_number].classList.contains('correct'));
    }

    function inwardRange(i) {
      const arr = inwardEntryCells[i];
      return `${arr[0]}–${arr[arr.length - 1]}`;
    }

    function outwardRange(i) {
      const cells = outwardEntryCells[i];
      return `${Math.min(...cells)}–${Math.max(...cells)}`;
    }

    function renderClues() {
      const inwardList  = document.getElementById('inward-clues');
      const outwardList = document.getElementById('outward-clues');

      data.inward.forEach((entry, i) => {
        const li = document.createElement('li');
        li.className = 'clue-item';
        li.dataset.direction  = 'inward';
        li.dataset.entryIndex = i;
        const rangeSpan = document.createElement('span');
        rangeSpan.className = 'clue-range';
        rangeSpan.textContent = inwardRange(i) + '.';
        const textSpan = document.createElement('span');
        textSpan.className = 'clue-text';
        textSpan.textContent = entry.clue;
        li.append(rangeSpan, textSpan);
        li.addEventListener('click', () => {
          direction  = 'inward';
          focusCell(inwardEntryCells[i][0]);
        });
        inwardList.appendChild(li);
      });

      data.outward.forEach((entry, i) => {
        const li = document.createElement('li');
        li.className = 'clue-item';
        li.dataset.direction  = 'outward';
        li.dataset.entryIndex = i;
        const rangeSpan = document.createElement('span');
        rangeSpan.className = 'clue-range';
        rangeSpan.textContent = outwardRange(i) + '.';
        const textSpan = document.createElement('span');
        textSpan.className = 'clue-text';
        textSpan.textContent = entry.clue;
        li.append(rangeSpan, textSpan);
        li.addEventListener('click', () => {
          direction  = 'outward';
          focusCell(outwardEntryCells[i][0]);
        });
        outwardList.appendChild(li);
      });
    }

    function focusCell(n) {
      activeCell = n;
      document.getElementById('hidden-input').focus({ preventScroll: true });
      syncUI();
    }

    function onCellClick(n) {
      if (n === activeCell) direction = direction === 'inward' ? 'outward' : 'inward';
      focusCell(n);
    }

    function syncUI() {
      document.querySelectorAll('.toggle-opt').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dir === direction);
      });

      const curMap      = direction === 'inward' ? inwardMap : outwardMap;
      const curEntryIdx = curMap[activeCell].entryIndex;

      data.cells.forEach(cell => {
        const el  = cellPaths[cell.cell_number];
        const cel = curMap[cell.cell_number];
        el.classList.toggle('active-entry', !!cel && cel.entryIndex === curEntryIdx);
        el.classList.toggle('active-cell',  cell.cell_number === activeCell);
      });

      const oppMap      = direction === 'inward' ? outwardMap : inwardMap;
      const oppDir      = direction === 'inward' ? 'outward' : 'inward';
      const oppEntryIdx = oppMap[activeCell].entryIndex;

      document.querySelectorAll('.clue-item').forEach(item => {
        const itemDir = item.dataset.direction;
        const itemIdx = Number(item.dataset.entryIndex);
        item.classList.toggle('active-clue',
          itemDir === direction && itemIdx === curEntryIdx);
        item.classList.toggle('secondary-entry',
          itemDir === oppDir && itemIdx === oppEntryIdx);
      });

      const curEntries = direction === 'inward' ? data.inward : data.outward;
      const oppEntries = direction === 'inward' ? data.outward : data.inward;
      const curRange   = direction === 'inward' ? inwardRange(curEntryIdx) : outwardRange(curEntryIdx);
      const oppRange   = oppDir === 'inward'    ? inwardRange(oppEntryIdx) : outwardRange(oppEntryIdx);
      barPrimaryDir.textContent    = direction.charAt(0).toUpperCase() + direction.slice(1);
      barPrimaryNum.textContent    = curRange + '.';
      barPrimaryText.textContent   = curEntries[curEntryIdx].clue;
      barSecondaryDir.textContent  = oppDir.charAt(0).toUpperCase() + oppDir.slice(1);
      barSecondaryNum.textContent  = oppRange + '.';
      barSecondaryText.textContent = oppEntries[oppEntryIdx].clue;

      const checkBtn = document.getElementById('check-btn');
      if (!data.hashed && checkBtn) {
        checkBtn.disabled = !getCellLetter(activeCell) ||
          cellPaths[activeCell].classList.contains('correct');
      }

      // Chevron on leading edge of active cell pointing in direction of travel
      const ac        = data.cells[activeCell - 1];
      const isInward  = direction === 'inward';
      const theta_e   = isInward ? ac.theta_end    : ac.theta_start;
      const r_inner_e = isInward ? ac.r_inner_end  : ac.r_inner_start;
      const r_outer_e = isInward ? ac.r_outer_end  : ac.r_outer_start;
      const [ix, iy]  = polar(r_inner_e, theta_e);
      const [ox, oy]  = polar(r_outer_e, theta_e);
      const [mx, my]  = polar((r_inner_e + r_outer_e) / 2, theta_e);
      const [tsx, tsy] = polar((ac.r_inner_start + ac.r_outer_start) / 2, ac.theta_start);
      const [tex, tey] = polar((ac.r_inner_end   + ac.r_outer_end)   / 2, ac.theta_end);
      let tdx = tex - tsx, tdy = tey - tsy;
      if (!isInward) { tdx = -tdx; tdy = -tdy; }
      const tlen      = Math.sqrt(tdx * tdx + tdy * tdy);
      const prot      = (R_MAX - R_HOLE) / (N_TURNS + 1) * 0.15;
      chevronEl.setAttribute('d',
        `M${f(ix)},${f(iy)} L${f(mx + tdx/tlen*prot)},${f(my + tdy/tlen*prot)} L${f(ox)},${f(oy)}`);

      const solved = isSolved();
      const allFilled = data.cells.every(c => getCellLetter(c.cell_number) !== '');
      if (!congratsDismissed) document.getElementById('congrats-overlay').hidden = !solved;
      document.getElementById('done-wrong').hidden = !(allFilled && !solved);
    }

    const { saveState, restoreState, clearState } = setupStorage(storageKey('sp', data), {
      cellCount: totalCells,
      getState() {
        const letters = {};
        cellLetters.forEach((v, k) => { letters[k] = v; });
        const correct = [];
        data.cells.forEach(c => {
          if (cellPaths[c.cell_number].classList.contains('correct')) correct.push(c.cell_number);
        });
        return { letters, correct };
      },
      applyState(saved) {
        Object.entries(saved.letters).forEach(([k, v]) => {
          const n = Number(k);
          cellLetters.set(n, v);
          letterTexts[n].textContent = v;
        });
        saved.correct.forEach(n => {
          cellPaths[n].classList.add('correct');
          letterTexts[n].classList.add('correct');
        });
      },
    });

    // ── Build SVG ────────────────────────────────────────────────────────────
    const svg = document.getElementById('spiral-svg');

    const { R_HOLE, R_MAX, N_TURNS } = data.geometry;
    const PAD = 18;
    svg.setAttribute('viewBox',
      `${-(R_MAX + PAD)} ${-(R_MAX + PAD)} ${2 * (R_MAX + PAD)} ${2 * (R_MAX + PAD)}`);

    // Spiral curl: winds inward from the last cell's inner edge, tapering to a point
    const lastCell       = data.cells[data.cells.length - 1];
    const curlStartR     = lastCell.r_inner_end;
    const curlStartTheta = lastCell.theta_end;
    const curlSteps      = 300;
    const curlAngle      = 1.75 * 2 * Math.PI;
    let curlD = '';
    for (let i = 0; i <= curlSteps; i++) {
      const t = i / curlSteps;
      const [x, y] = polar(curlStartR * (1 - t * 0.97), curlStartTheta + t * curlAngle);
      curlD += `${i === 0 ? 'M' : 'L'}${f(x)},${f(y)} `;
    }
    svg.appendChild(svgEl('path', { id: 'center-curl', d: curlD }));

    // Four explicit layer groups: cells < circles < flash < letters.
    // flashLayer holds wrong-guess flash overlays (see flashWrong) above the cells.
    // The chevron is appended directly to svg after the groups so it paints on top.
    const cellsLayer   = svgEl('g', {});
    const circlesLayer = svgEl('g', {});
    const flashLayer   = svgEl('g', {});
    const lettersLayer = svgEl('g', {});
    svg.append(cellsLayer, circlesLayer, flashLayer, lettersLayer);

    const numSize      = (R_MAX - R_HOLE) / (N_TURNS * 6.5);
    const letterSize   = (R_MAX - R_HOLE) / (N_TURNS * 3.2);
    const BAND         = (R_MAX - R_HOLE) / (N_TURNS + 1);
    const circleRadius = BAND / 2;

    const cellCenters       = {};
    const cellCircleCenters = {};
    const cellPaths         = {};
    const letterTexts       = {};

    // Pass 1: cell paths (innermost-first for correct z-ordering of strokes).
    for (let i = data.cells.length - 1; i >= 0; i--) {
      const cell = data.cells[i];
      const n    = cell.cell_number;
      const path = svgEl('path', { id: `cell-${n}`, class: 'cell', d: cellPath(cell) });
      path.addEventListener('click', () => onCellClick(n));
      cellsLayer.appendChild(path);
      cellPaths[n] = path;

      const a_mid = (cell.theta_start + cell.theta_end) / 2;

      // Letter center: biased slightly toward inner edge (intentional for legibility).
      const r_mid = 0.55 * cell.r_inner_start + 0.45 * cell.r_outer_start;
      cellCenters[n] = polar(r_mid, a_mid);

      // Circle center: geometric midpoint of the cell shape, matching cellPath's arc radii.
      const r_out = (cell.r_outer_start + cell.r_outer_end) / 2;
      const r_in  = (cell.r_inner_start + cell.r_inner_end) / 2;
      cellCircleCenters[n] = polar((r_out + r_in) / 2, a_mid);
    }

    // Pass 2: circle decorations for entries with styles.
    function renderEntryCircles(entries, entryCells) {
      entries.forEach((entry, i) => {
        if (!entry.styles || !Array.isArray(entry.styles.circle)) return;
        entry.styles.circle.forEach(posInEntry => {
          const n = entryCells[i][posInEntry];
          if (n === undefined) {
            console.warn(`style-circle: entry ${i} has no cell at position ${posInEntry}`);
            return;
          }
          const [cx, cy] = cellCircleCenters[n];
          circlesLayer.appendChild(svgEl('circle', {
            class: 'style-circle', cx: f(cx), cy: f(cy), r: f(circleRadius),
          }));
        });
      });
    }
    renderEntryCircles(data.inward, inwardEntryCells);
    renderEntryCircles(data.outward, outwardEntryCells);

    // Pass 3: cell number labels and letter texts.
    for (let i = data.cells.length - 1; i >= 0; i--) {
      const cell = data.cells[i];
      const n    = cell.cell_number;

      const r_num = 0.78 * cell.r_outer_start + 0.22 * cell.r_inner_start;
      const a_num = cell.theta_start + 0.18 * (cell.theta_end - cell.theta_start);
      const [nx, ny] = polar(r_num, a_num);
      const numText = svgEl('text', {
        id: `cellnum-${n}`, class: 'cell-num',
        x: f(nx), y: f(ny), 'font-size': f(numSize),
      });
      numText.textContent = n;
      lettersLayer.appendChild(numText);

      const [tx, ty] = cellCenters[n];
      const letterText = svgEl('text', {
        id: `letter-${n}`, class: 'cell-letter',
        x: f(tx), y: f(ty), 'font-size': f(letterSize),
      });
      lettersLayer.appendChild(letterText);
      letterTexts[n] = letterText;
    }

    const chevronEl = svgEl('path', { id: 'direction-chevron' });
    svg.appendChild(chevronEl);

    const barPrimaryDir    = document.querySelector('#active-clue-primary .active-clue-dir');
    const barPrimaryNum    = document.querySelector('#active-clue-primary .active-clue-num');
    const barPrimaryText   = document.querySelector('#active-clue-primary .active-clue-text');
    const barSecondaryDir  = document.querySelector('#active-clue-secondary .active-clue-dir');
    const barSecondaryNum  = document.querySelector('#active-clue-secondary .active-clue-num');
    const barSecondaryText = document.querySelector('#active-clue-secondary .active-clue-text');

    // ── Header & clues ───────────────────────────────────────────────────────
    document.title = data.title;
    document.querySelector('h1.title').textContent = data.title;
    renderByline(data);
    renderInstructions(data);
    renderClues();

    // ── Event wiring ─────────────────────────────────────────────────────────
    document.querySelectorAll('.toggle-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        direction = btn.dataset.dir;
        focusCell(activeCell);
      });
    });

    const checkBtn = document.getElementById('check-btn');
    if (!data.hashed) {
      checkBtn.addEventListener('click', checkCell);
    } else {
      checkBtn.hidden = true;
    }

    setupClearButton(
      document.getElementById('clear-btn'),
      clearState,
      () => document.getElementById('hidden-input').focus({ preventScroll: true })
    );

    const congratsOverlay = document.getElementById('congrats-overlay');

    setupCongratsOverlay(congratsOverlay, () => {
      congratsDismissed = true;
      document.getElementById('hidden-input').focus({ preventScroll: true });
    });

    const hiddenInput = document.getElementById('hidden-input');

    setupKeydown(e => {
      if (e.key === '.') {
        e.preventDefault();
        direction = direction === 'inward' ? 'outward' : 'inward';
        focusCell(activeCell);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const map     = direction === 'inward' ? inwardMap : outwardMap;
        const entries = direction === 'inward' ? data.inward : data.outward;
        if (e.shiftKey) {
          const prev = (map[activeCell].entryIndex - 1 + entries.length) % entries.length;
          focusCell(entryFirstCell(direction, prev));
        } else {
          focusCell(nextEntryFirstCell(direction, activeCell));
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        focusCell(nextInDir(activeCell, direction));
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        focusCell(prevInDir(activeCell, direction));
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (getCellLetter(activeCell)) {
          setCellLetter(activeCell, '');
          syncUI();
        } else {
          const prev = prevInDir(activeCell, direction);
          setCellLetter(prev, '');
          focusCell(prev);
        }
        saveState();
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        setCellLetter(activeCell, '');
        saveState();
        focusCell(nextInDir(activeCell, direction));
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'PageUp'  || e.key === 'PageDown') {
        e.preventDefault();
        scrollByKey(e.key);
      }
    });

    hiddenInput.addEventListener('input', () => {
      const letter = normalize(hiddenInput.value).slice(-1).toUpperCase();
      hiddenInput.value = '';
      if (!letter) return;
      setCellLetter(activeCell, letter);
      if (data.hashed) {
        focusCell(nextInDir(activeCell, direction));
        checkBoardIfFilled();
      } else {
        focusCell(nextInDir(activeCell, direction));
        checkAllCellsIfFilled();
      }
      saveState();
    });

    svg.addEventListener('click', e => {
      if (e.target === svg) document.getElementById('hidden-input').focus();
    });

    // ── Restore & focus ──────────────────────────────────────────────────────
    restoreState();
    focusCell(1);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
