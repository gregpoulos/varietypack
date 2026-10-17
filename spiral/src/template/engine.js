import { normalize } from '../../../shared/normalize.mjs';
import {
  makeBoardChecker, makeCellStore, makeComposer, resetAndRefocus, restoreAndSeal,
  setupSolveTracking, syncSolveState
} from '../../../shared/engine-state.mjs';
import {
  clueTextEl, flashWrong, htmlEl, onClueClick, renderByline, renderInstructions,
  scrollByKey, setupCellClicks, setupClueBar, setupCongratsDialog, setupControls,
  setupEmbedResize, setupKeydown, setupKeysOverlay, setupRebusButton, setupStorage,
  storageKey, svgEl
} from '../../../shared/engine-chrome.mjs';
import {
  cellPath, cellsOfEntries, circleCenter, curlPath, letterCenter, numberPosition,
  polar, sizesFor
} from '../layout.mjs';

function init() {
  // ── Data & constants ────────────────────────────────────────────────────
  const data       = window.PUZZLE_DATA;
  const totalCells = data.cells.length;

  // ── Geometry & index maps ────────────────────────────────────────────────
  function f(n) { return n.toFixed(3); }

  // One direction's cell → { entryIndex, posInEntry } map and each entry's cells in
  // reading order, numbering cells from firstCell by step: inward counts up from
  // cell 1, outward down from the center.
  function indexEntries(entries, firstCell, step) {
    const entryCells = cellsOfEntries(entries.map(e => e.length), firstCell, step);
    const map = {};
    entryCells.forEach((cells, i) => cells.forEach((cell, j) => { map[cell] = { entryIndex: i, posInEntry: j }; }));
    return { map, entryCells };
  }
  const { map: inwardMap,  entryCells: inwardEntryCells }  = indexEntries(data.inward, 1, 1);
  const { map: outwardMap, entryCells: outwardEntryCells } = indexEntries(data.outward, totalCells, -1);

  // Everything that differs between the two reading directions, in one table:
  // the cell→entry map, the entry list, each entry's cells, the step to the next
  // cell (inward counts up, outward counts down), the clue list's element id, the bar's
  // direction label, and the other direction's name.
  const DIRS = {
    inward: {
      map: inwardMap,  entries: data.inward,  entryCells: inwardEntryCells,
      step: 1,  listId: 'inward-clues',  label: 'Inward',  opposite: 'outward',
    },
    outward: {
      map: outwardMap, entries: data.outward, entryCells: outwardEntryCells,
      step: -1, listId: 'outward-clues', label: 'Outward', opposite: 'inward',
    },
  };

  // ── State ────────────────────────────────────────────────────────────────
  const FIRST_CELL = 1;   // the outermost cell, where inward reading starts
  let activeCell = FIRST_CELL;
  let direction  = 'inward';

  // ── Logic functions ──────────────────────────────────────────────────────
  // Cells 1→N, inward — the canonical board string order.
  const CELL_IDS = inwardEntryCells.flat();

  // Each cell's letter and correct mark (makeCellStore, shared/engine-state.mjs).
  const cells = makeCellStore({ ids: CELL_IDS, cellEl: n => cellPaths[n], letterEl: n => letterTexts[n] });
  const { getCellLetter, setCellLetter, setCorrect, isCorrect } = cells;

  // Commit is wired only at the top of focusCell — docs/CROSS_TOOL_SPEC.md → Enter /
  // Rebus button.
  const composer = makeComposer({
    getContent: n => getCellLetter(n),
    setContent: (n, s) => setCellLetter(n, s),
    onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    isSolved:   () => latch.solved,
  });

  // Board state and answer checking. inwardEntryCells.flat() is cells 1→N — the
  // canonical board string order. markSolved marks clue items in *both* modes, per
  // the mode-symmetry rule in docs/CROSS_TOOL_SPEC.md → Answer checking.
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
      clueItems.forEach(li => li.classList.add('correct'));
    },
    syncUI: () => syncUI(),
  });

  function entryFirstCell(dir, entryIndex) {
    return DIRS[dir].entryCells[entryIndex][0];
  }

  function entryLastCell(dir, entryIndex) {
    const cells = DIRS[dir].entryCells[entryIndex];
    return cells[cells.length - 1];
  }

  function nextInDir(cellNum, dir) {
    const { map, entries, step } = DIRS[dir];
    const { entryIndex, posInEntry } = map[cellNum];
    if (posInEntry < entries[entryIndex].length - 1) return cellNum + step;
    return entryFirstCell(dir, (entryIndex + 1) % entries.length);
  }

  function prevInDir(cellNum, dir) {
    const { map, entries, step } = DIRS[dir];
    const { entryIndex, posInEntry } = map[cellNum];
    if (posInEntry > 0) return cellNum - step;
    return entryLastCell(dir, (entryIndex - 1 + entries.length) % entries.length);
  }

  // The label shown before a clue: the span of cell numbers its entry covers, low to
  // high ("75–78"), whichever way the entry reads.
  function cellRangeLabel(cells) {
    return `${Math.min(...cells)}–${Math.max(...cells)}`;
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

  // Chevron geometry: a small stroke on the leading edge of the active cell,
  // protruding toward the direction of travel. Split out of syncUI so the geometry
  // math reads apart from the DOM/state sync it feeds into. `ac` is the active cell's
  // data.cells entry; `isInward` is `direction === 'inward'` at call time.
  function chevronPathD(ac, isInward) {
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
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy);
    const prot = BAND * 0.15;
    return `M${f(ix)},${f(iy)} L${f(mx + tdx/tlen*prot)},${f(my + tdy/tlen*prot)} L${f(ox)},${f(oy)}`;
  }

  function syncUI() {
    // Toggle buttons: mark the active segment
    directionBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dir === direction);
    });
    // Composition also ends on any cursor move, which never touches the button.
    rebusBtn.sync();

    const cur         = DIRS[direction];
    const opp         = DIRS[cur.opposite];
    const curMap      = cur.map;
    const curEntryIdx = curMap[activeCell].entryIndex;

    // Cells: highlight the active entry and cell, and mark the composing one.
    data.cells.forEach(cell => {
      const el  = cellPaths[cell.cell_number];
      el.classList.toggle('active-entry', curMap[cell.cell_number].entryIndex === curEntryIdx);
      el.classList.toggle('active-cell',  cell.cell_number === activeCell);
      el.classList.toggle('composing',    composer.isComposing(cell.cell_number));
    });
    // Last in its layer, so no neighbor paints over its border (e2e/shared.spec.js).
    cellsLayer.appendChild(cellPaths[activeCell]);

    const oppDir      = cur.opposite;
    const oppEntryIdx = opp.map[activeCell].entryIndex;

    // Clue list: highlight the active and crossing clues, and mark filled ones.
    clueItems.forEach(item => {
      const itemDir = item.dataset.direction;
      const itemIdx = Number(item.dataset.entryIndex);
      item.classList.toggle('active-clue',
        itemDir === direction && itemIdx === curEntryIdx);
      item.classList.toggle('secondary-entry',
        itemDir === oppDir && itemIdx === oppEntryIdx);
      item.classList.toggle('filled',
        checker.isEntryFilled(DIRS[itemDir].entryCells[itemIdx]));
    });

    // Clue bar: show the active clue and its crossing entry.
    clueBar.show(
      { dir: cur.label, num: cellRangeLabel(cur.entryCells[curEntryIdx]), clue: cur.entries[curEntryIdx].clue },
      { dir: opp.label, num: cellRangeLabel(opp.entryCells[oppEntryIdx]), clue: opp.entries[oppEntryIdx].clue },
    );

    // Check Cell button: enabled only while the active cell can be checked.
    controls.syncCheckBtn(activeCell);

    // Chevron on leading edge of active cell pointing in direction of travel
    const ac = data.cells[activeCell - 1];
    chevronEl.setAttribute('d', chevronPathD(ac, direction === 'inward'));

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
      flashWrong(cellPaths[n], flashLayer);
    }
    syncUI();
    refocus();
  }

  const saveKey = storageKey('sp', data);
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

  // ── Build SVG ────────────────────────────────────────────────────────────
  const svg = document.getElementById('spiral-svg');

  const { R_MAX } = data.geometry;
  const PAD = 18;
  svg.setAttribute('viewBox',
    `${-(R_MAX + PAD)} ${-(R_MAX + PAD)} ${2 * (R_MAX + PAD)} ${2 * (R_MAX + PAD)}`);

  // Spiral curl: winds inward from the last cell's inner edge, tapering to a point
  const lastCell = data.cells[data.cells.length - 1];
  svg.appendChild(svgEl('path', { id: 'center-curl', d: curlPath(lastCell) }));

  // Four explicit layer groups: cells < circles < flash < letters.
  // flashLayer holds wrong-guess flash overlays (see flashWrong) above the cells.
  // The chevron is appended directly to svg after the groups so it paints on top.
  const cellsLayer   = svgEl('g', {});
  const circlesLayer = svgEl('g', {});
  const flashLayer   = svgEl('g', {});
  const lettersLayer = svgEl('g', {});
  svg.append(cellsLayer, circlesLayer, flashLayer, lettersLayer);

  const { band: BAND, numSize, letterSize, circleRadius } = sizesFor(data.geometry);

  const cellCenters       = {};
  const cellCircleCenters = {};
  const cellPaths         = {};
  const letterTexts       = {};

  // Pass 1: cell paths (innermost-first for correct z-ordering of strokes).
  for (let i = data.cells.length - 1; i >= 0; i--) {
    const cell = data.cells[i];
    const n    = cell.cell_number;
    const path = svgEl('path', { id: `cell-${n}`, class: 'cell', d: cellPath(cell) });
    cellsLayer.appendChild(path);
    cellPaths[n] = path;

    cellCenters[n] = letterCenter(cell);
    cellCircleCenters[n] = circleCenter(cell);
  }

  // Pass 2: circle decorations for entries with styles. Inward and outward entries
  // list the same circled cell (the circle rule), so one set dedupes across both.
  const circledCells = new Set();
  function renderEntryCircles(entries, entryCells) {
    entries.forEach((entry, i) => {
      if (!entry.styles || !Array.isArray(entry.styles.circle)) return;
      entry.styles.circle.forEach(posInEntry => {
        const n = entryCells[i][posInEntry];
        if (n === undefined || circledCells.has(n)) return;
        circledCells.add(n);
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

    const [nx, ny] = numberPosition(cell);
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

  // ── Header & clues ───────────────────────────────────────────────────────
  renderByline(data);
  renderInstructions(data);

  const clueItems = [];   // every rendered <li.clue-item>, both directions

  // Builds one direction's <li class="clue-item"> list. Inward and outward differ only
  // in which list/entries/cell-array they read and which direction they set on click —
  // folded into one function parameterized by `dir` rather than two copy-pasted blocks.
  function renderCluesFor(dir) {
    const { listId, entries, entryCells: entryCellsFor } = DIRS[dir];
    const list = document.getElementById(listId);

    entries.forEach((entry, i) => {
      const li = htmlEl('li', { class: 'clue-item', 'data-direction': dir, 'data-entry-index': i },
        htmlEl('span', { class: 'clue-range' }, cellRangeLabel(entryCellsFor[i]) + '.'),
        clueTextEl(entry.clue));
      onClueClick(li, () => { direction = dir; focusCell(entryCellsFor[i][0]); });
      list.appendChild(li);
      clueItems.push(li);
    });
  }

  function renderClues() {
    renderCluesFor('inward');
    renderCluesFor('outward');
  }

  renderClues();

  // ── Event wiring ─────────────────────────────────────────────────────────
  // The page's static elements. Logic functions above use them (focusCell calls
  // refocus, syncUI writes the bar); they first run in Restore & focus, after this.
  const hiddenInput = document.getElementById('hidden-input');
  const refocus = () => hiddenInput.focus({ preventScroll: true });

  const clueBar = setupClueBar();

  const directionBtns = Array.from(document.querySelectorAll('#direction-toggle .toggle-opt'));
  const checkBtn      = document.getElementById('check-btn');
  const doneWrong     = document.getElementById('done-wrong');

  // #rebus-btn — docs/CROSS_TOOL_SPEC.md → Enter / Rebus button.
  const rebusBtn = setupRebusButton(document.getElementById('rebus-btn'), {
    onToggle:    toggleRebus,
    isComposing: () => composer.isComposing(activeCell),
    refocus,
  });

  setupEmbedResize();
  directionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      direction = btn.dataset.dir;
      focusCell(activeCell);
    });
  });

  const keysOverlay = setupKeysOverlay(
    [
      ['Tab',       'Next entry'],
      ['Shift+Tab', 'Previous entry'],
      ['← →',       'Move along entry'],
      ['⌫',         'Clear current cell'],
      ['Space',     'Clear and advance'],
      ['Enter',     'Multi-letter cell'],
      ['.',         'Toggle inward / outward'],
    ],
    refocus
  );

  setupKeydown(e => {
    if (latch.solved) return;
    if (e.key === '.') {
      e.preventDefault();
      direction = DIRS[direction].opposite;
      focusCell(activeCell);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const { map, entries } = DIRS[direction];
      const step = e.shiftKey ? -1 : 1;
      const target = (map[activeCell].entryIndex + step + entries.length) % entries.length;
      focusCell(entryFirstCell(direction, target));
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
  }, { keysOverlay, refocus });

  hiddenInput.addEventListener('input', () => {
    const typed = normalize(hiddenInput.value);
    hiddenInput.value = '';
    if (latch.solved || !typed) return;
    timer.onFirstInput();
    // Advance only when typeLetter says to, so capacity never triggers an advance.
    if (composer.typeLetter(activeCell, typed)) focusCell(nextInDir(activeCell, direction));
    else syncUI();

    // Advance first, then check (docs/CROSS_TOOL_SPEC.md → Hashed-mode feedback
    // timing).
    checker.checkIfFilled();
    saveState();
  });

  // A click on a cell moves there; a second click on the active cell switches
  // direction.
  setupCellClicks(svg, n => {
    if (n === activeCell) direction = DIRS[direction].opposite;
    focusCell(n);
  });

  svg.addEventListener('click', e => {
    if (e.target === svg) refocus();
  });

  function resetBoard() {
    resetAndRefocus({
      composer, clearState, timer, latch,
      clearBoard() {
        cells.clearCells();
        clueItems.forEach(li => li.classList.remove('correct'));
        flashLayer.replaceChildren();
        direction = 'inward';
      },
      focusInitial: () => focusCell(FIRST_CELL),
    });
  }

  const controls = setupControls({
    checkBtn, checker, hashed: data.hashed, onCheck: checkCell,
    onClear: resetBoard, refocus, key: saveKey,
  });

  // ── Restore & focus ──────────────────────────────────────────────────────
  const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
  // Resume on the restored composing cell (docs/CROSS_TOOL_SPEC.md → "Composition is
  // saved state").
  focusCell(resumeCell === null ? FIRST_CELL : resumeCell);
}

document.addEventListener('DOMContentLoaded', init);
