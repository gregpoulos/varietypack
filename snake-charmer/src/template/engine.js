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
import { setupPhoneLayout } from '../../../shared/engine-phone.mjs';
import { buildEntryMaps, nextRingPos, prevRingPos } from '../entryMaps.mjs';
import { getStadiumRenderer } from './shapes/stadium.mjs';
import { getTurnRenderer } from './shapes/turn.mjs';
import { getDoubleTurnRenderer } from './shapes/double-turn.mjs';

function getShapeRenderer(shape) {
  if (shape === 'turn')        return getTurnRenderer;
  if (shape === 'double-turn') return getDoubleTurnRenderer;
  return getStadiumRenderer;
}

function init() {
  // ── Data & constants ──────────────────────────────────────────────────────
  const data = window.PUZZLE_DATA;
  const { svgWidth, svgHeight } = data.ring;
  const ringSize = data.ring.N;

  // ── Geometry & index maps ─────────────────────────────────────────────────
  const { cellPath, letterCenter, labelPos } = getShapeRenderer(data.shape)(data.ring);
  const { entryAtCell, ringPosByEntry, canonicalStart } = buildEntryMaps(data.entries, data.loops);

  // Entry indices that start (posInEntry 0) at each ring position, for number labels
  const entriesStartingAt = Array.from({ length: ringSize }, () => []);
  canonicalStart.forEach((start, ei) => entriesStartingAt[start.ringPos].push(ei));

  // A cell's position along the whole snake, loop × ring + ring position: what tells
  // apart the two copies of a ring position an entry longer than the ring holds, as the
  // phone's fill-in list (Header & clues) must.
  const snakePos = (ringPos, loop) => loop * ringSize + ringPos;

  // ── State ─────────────────────────────────────────────────────────────────
  const FIRST_RING_POS = 0;   // where entry 1 starts, on the first loop
  let activeRingPos = FIRST_RING_POS;
  let activeLoop = 0;

  // ── Logic functions ───────────────────────────────────────────────────────
  // Ring positions 0→N−1 — the canonical board string order.
  const CELL_IDS = Array.from({ length: ringSize }, (_, rp) => rp);

  // Each cell's letter and correct mark (makeCellStore, shared/engine-state.mjs).
  const cells = makeCellStore({ ids: CELL_IDS, cellEl: rp => cellPaths[rp], letterEl: rp => letterTexts[rp] });
  const { getCellLetter, setCellLetter, setCorrect, isCorrect } = cells;

  // Commit is wired only at the top of focusCell — docs/CROSS_TOOL_SPEC.md → Enter /
  // Rebus button.
  const composer = makeComposer({
    getContent: rp => getCellLetter(rp),
    setContent: (rp, s) => setCellLetter(rp, s),
    onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    isSolved:   () => latch.solved,
  });

  // Board state and answer checking. Ring positions 0..N-1 are the canonical board
  // string order. markSolved marks clue items in *both* modes, per the mode-symmetry
  // rule in docs/CROSS_TOOL_SPEC.md → Answer checking.
  const checker = makeBoardChecker({
    cellIds:             CELL_IDS,
    getContent:          rp => getCellLetter(rp),
    isCellFilled:        rp => composer.isCellFilled(rp),
    isCellMarkedCorrect: isCorrect,
    hashed:              !!data.hashed,
    getExpected:         rp => data.letters && data.letters[rp],
    getBoardHash:        () => data.boardHash,
    markSolved: () => {
      cells.markAllCorrect();
      data.entries.forEach((_, ei) => cluesList.children[ei].classList.add('correct'));
    },
    syncUI: () => syncUI(),
  });

  function focusCell(ringPos, loop) {
    composer.commitIfMoved(ringPos);
    activeRingPos = ringPos;
    activeLoop = loop;
    refocus();
    syncUI();
  }

  // Move the cursor one cell along the ring, changing loop where it crosses the seam
  // between the last ring position and the first.
  function advanceCell() {
    const nextPos = nextRingPos(activeRingPos, ringSize);
    const nextLoop = nextPos === 0 ? (activeLoop + 1) % data.loops : activeLoop;
    focusCell(nextPos, nextLoop);
  }

  function retreatCell() {
    const prevPos = prevRingPos(activeRingPos, ringSize);
    const prevLoop = prevPos === ringSize - 1
      ? (activeLoop - 1 + data.loops) % data.loops : activeLoop;
    focusCell(prevPos, prevLoop);
  }

  // One rebus toggle for Enter and #rebus-btn — docs/CROSS_TOOL_SPEC.md → Enter / Rebus
  // button.
  function toggleRebus() {
    composer.toggle(activeRingPos);
    syncUI();
  }

  function syncUI() {
    // Toggle buttons: mark the active segment (loopBtns is built in Event wiring;
    // syncUI first runs in Restore & focus).
    loopBtns.forEach((btn, i) => btn.classList.toggle('active', i === activeLoop));
    // Composition also ends on any cursor move, which never touches the button.
    rebusBtn.sync();

    // Active entry, plus the other loop's entry through the same cell as the secondary
    // highlight (snake-charmer-specific — see CLAUDE.md → SVG ring rendering).
    const activeEntryIdx = entryAtCell[activeRingPos][activeLoop];
    const activeEntryPositions = new Set(ringPosByEntry[activeEntryIdx]);
    const otherLoop = (activeLoop + 1) % data.loops;
    const secondaryEntryIdx = entryAtCell[activeRingPos][otherLoop];
    const secondaryPositions = new Set(
      secondaryEntryIdx !== activeEntryIdx ? ringPosByEntry[secondaryEntryIdx] : []
    );

    // Cells: highlight the active entry and cell, and mark the composing one.
    cellPaths.forEach((p, rp) => {
      const isActive = activeEntryPositions.has(rp);
      const isSecondary = !isActive && secondaryPositions.has(rp);
      p.classList.toggle('active-entry', isActive);
      p.classList.toggle('secondary-entry', isSecondary);
      p.classList.toggle('active-cell', rp === activeRingPos);
      p.classList.toggle('composing', composer.isComposing(rp));
    });
    // Last in its layer, so no neighbor paints over its border (e2e/shared.spec.js).
    cellsLayer.appendChild(cellPaths[activeRingPos]);

    // Clue list: highlight the active and crossing clues, and mark filled ones.
    Array.from(cluesList.children).forEach((li, i) => {
      li.classList.toggle('active-clue', i === activeEntryIdx);
      li.classList.toggle('secondary-entry', i === secondaryEntryIdx && i !== activeEntryIdx);
      li.classList.toggle('filled', checker.isEntryFilled(ringPosByEntry[i]));
    });
    // Phone list view: every row's letters, the cursor, and the active clue in view.
    if (phone) phone.fillList.sync(snakePos(activeRingPos, activeLoop), cluesList.children[activeEntryIdx]);

    // Clue bar: show the active clue and its crossing entry. An entry longer than the
    // ring is both loops' entry at its first cells, so there the second row would only
    // repeat the first.
    clueBar.show(
      { num: activeEntryIdx + 1, clue: data.entries[activeEntryIdx].clue },
      secondaryEntryIdx === activeEntryIdx ? null
        : { num: secondaryEntryIdx + 1, clue: data.entries[secondaryEntryIdx].clue },
    );
    if (phone) phone.showingClue(data.entries[activeEntryIdx]);

    // Check Cell button: enabled only while the active cell can be checked.
    controls.syncCheckBtn(activeRingPos);

    // Solve state: the done-wrong banner, and solved-ness for the completion latch.
    syncSolveState({ checker, latch, doneWrong });
  }

  // Check Cell (non-hashed mode only)
  function checkCell() {
    const rp = activeRingPos;
    // The focus call is required on every path out (docs/CROSS_TOOL_SPEC.md → Focus
    // management).
    const ok = checker.checkCell(rp);
    if (ok === true) {
      setCorrect(rp, true);
      saveState();          // only this branch mutates persisted state
    } else if (ok === false) {
      flashWrong(cellPaths[rp], flashLayer);
      if (phone) phone.fillList.flash(p => p % ringSize === rp);
    }
    syncUI();
    refocus();
  }

  const saveKey = storageKey('sc', data);
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
  document.querySelector('.puzzle-main').classList.add(`layout-${data.shape}`);

  const svg = document.getElementById('ring-svg');
  svg.setAttribute('width', svgWidth);
  svg.setAttribute('height', svgHeight);
  svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

  const cellPaths = [];
  const letterTexts = [];

  // Five explicit layers: cells < circles < flash < letters < labels.
  // flashLayer holds wrong-guess flash overlays (see flashWrong) above the cells.
  const cellsLayer   = svgEl('g');
  const circlesLayer = svgEl('g');
  const flashLayer   = svgEl('g');
  const lettersLayer = svgEl('g');
  const labelsLayer  = svgEl('g');
  svg.append(cellsLayer, circlesLayer, flashLayer, lettersLayer, labelsLayer);

  for (let i = 0; i < ringSize; i++) {
    const path = svgEl('path', { class: 'cell', id: `cell-${i}`, 'data-pos': i, d: cellPath(i) });
    cellsLayer.appendChild(path);
    cellPaths.push(path);
  }

  // The circle rule lists a circled cell on every entry covering it, so both loops
  // mark the same ring cell; draw it once.
  const circledRingPos = new Set();
  data.entries.forEach((entry, ei) => {
    if (!entry.styles || !Array.isArray(entry.styles.circle)) return;
    entry.styles.circle.forEach(posInEntry => {
      const ringPos = ringPosByEntry[ei][posInEntry];
      if (ringPos === undefined || circledRingPos.has(ringPos)) return;
      circledRingPos.add(ringPos);
      const { tx, ty } = letterCenter(ringPos);
      circlesLayer.appendChild(svgEl('circle', { class: 'style-circle', cx: tx, cy: ty, r: 17 }));
    });
  });

  for (let i = 0; i < ringSize; i++) {
    const { tx, ty } = letterCenter(i);
    const text = svgEl('text', { class: 'cell-letter', id: `letter-${i}`, 'data-pos': i, x: tx, y: ty });
    lettersLayer.appendChild(text);
    letterTexts.push(text);
  }

  entriesStartingAt.forEach((startEntries, i) => {
    if (startEntries.length === 0) return;
    const { lx, ly } = labelPos(i);
    const numText = svgEl('text', { class: 'cell-num', x: lx, y: ly });
    numText.textContent = startEntries.map(ei => ei + 1).join('/');
    labelsLayer.appendChild(numText);
  });

  // ── Header & clues ────────────────────────────────────────────────────────
  renderByline(data);
  renderInstructions(data);

  // Render clue list, keeping each item with its cells, in list order, for the phone's
  // fill-in list (setupFillList), as snake positions (snakePos).
  const cluesList = document.getElementById('clues');
  const fillItems = [];
  data.entries.forEach((entry, i) => {
    const li = htmlEl('li', { class: 'clue-item', 'data-entry': i }, clueTextEl(entry.clue));
    // Clue click → jump to the entry's first cell, in its own loop.
    onClueClick(li, () => {
      const { ringPos, loop } = canonicalStart[i];
      focusCell(ringPos, loop);
    });
    cluesList.appendChild(li);
    const start = snakePos(canonicalStart[i].ringPos, canonicalStart[i].loop);
    fillItems.push({ li, cells: Array.from({ length: ringPosByEntry[i].length }, (_, j) => start + j) });
  });

  // ── Event wiring ──────────────────────────────────────────────────────────
  // The page's static elements. Logic functions above use them (focusCell calls
  // refocus, syncUI writes the bar); they first run in Restore & focus, after this.
  const hiddenInput = document.getElementById('hidden-input');
  const refocus = () => hiddenInput.focus({ preventScroll: true });

  const clueBar = setupClueBar();

  const checkBtn  = document.getElementById('check-btn');
  const doneWrong = document.getElementById('done-wrong');

  // #rebus-btn — docs/CROSS_TOOL_SPEC.md → Enter / Rebus button.
  const rebusBtn = setupRebusButton(document.getElementById('rebus-btn'), {
    onToggle:    toggleRebus,
    isComposing: () => composer.isComposing(activeRingPos),
    refocus,
  });

  setupEmbedResize();

  const loopBtns = (() => {
    const toggle = document.getElementById('loop-toggle');
    const cumPos = [0];
    for (const e of data.entries) cumPos.push(cumPos[cumPos.length - 1] + e.length);
    return Array.from({ length: data.loops }, (_, l) => {
      const loopStart = l * ringSize;
      const loopEnd = (l + 1) * ringSize;
      let first = -1, last = -1;
      for (let i = 0; i < data.entries.length; i++) {
        if (cumPos[i] < loopEnd && cumPos[i + 1] > loopStart) {
          if (first === -1) first = i + 1;
          last = i + 1;
        }
      }
      const btn = htmlEl('button', { type: 'button', class: 'toggle-opt' + (l === 0 ? ' active' : '') },
        `Clues ${first}–${last}`);
      btn.addEventListener('click', () => focusCell(activeRingPos, l));
      toggle.appendChild(btn);
      return btn;
    });
  })();

  const keysOverlay = setupKeysOverlay(
    [
      ['Tab',       'Next entry'],
      ['Shift+Tab', 'Previous entry'],
      ['← →',       'Move along ring'],
      ['⌫',         'Clear current cell'],
      ['Space',     'Clear and advance'],
      ['Enter',     'Multi-letter cell'],
      ['.',         'Toggle loop'],
    ],
    refocus
  );

  setupKeydown(e => {
    if (latch.solved) return;
    if (e.key === '.') {
      e.preventDefault();
      focusCell(activeRingPos, (activeLoop + 1) % data.loops);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const activeEntryIdx = entryAtCell[activeRingPos][activeLoop];
      const step = e.shiftKey ? -1 : 1;
      const nextEntryIdx = (activeEntryIdx + step + data.entries.length) % data.entries.length;
      const { ringPos: targetRingPos, loop: targetLoop } = canonicalStart[nextEntryIdx];
      focusCell(targetRingPos, targetLoop);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      toggleRebus();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (composer.backspace(activeRingPos)) {
        syncUI();
        saveState();
        return;
      }
      if (getCellLetter(activeRingPos)) {
        setCellLetter(activeRingPos, '');
        syncUI();
      } else {
        setCellLetter(prevRingPos(activeRingPos, ringSize), '');
        retreatCell();
      }
      saveState();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      setCellLetter(activeRingPos, '');
      saveState();
      advanceCell();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      advanceCell();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      retreatCell();
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
    if (composer.typeLetter(activeRingPos, typed)) advanceCell();
    else syncUI();

    // Advance first, then check (docs/CROSS_TOOL_SPEC.md → Hashed-mode feedback
    // timing).
    checker.checkIfFilled();
    saveState();
  });

  // A click on a cell moves there; a second click on the active cell switches loop.
  setupCellClicks(svg, rp => {
    const loop = rp === activeRingPos ? (activeLoop + 1) % data.loops : activeLoop;
    focusCell(rp, loop);
  });

  function resetBoard() {
    resetAndRefocus({
      composer, clearState, timer, latch,
      clearBoard() {
        cells.clearCells();
        Array.from(cluesList.children).forEach(li => li.classList.remove('correct'));
        flashLayer.replaceChildren();
      },
      focusInitial: () => focusCell(FIRST_RING_POS, 0),
    });
  }

  const controls = setupControls({
    checkBtn, checker, hashed: data.hashed, onCheck: checkCell,
    onClear: resetBoard, refocus, key: saveKey,
  });

  // On a touch-first device only: the phone solving view and its drawn keyboard.
  // Its fill-in list view puts the cursor on a tapped cell in the loop that cell of the
  // entry lies in: an entry can straddle the loop boundary, or run past the ring.
  const phone = setupPhoneLayout({
    hiddenInput,
    checkBtn,
    refocus,
    firstVisit: !hasSave(),
    grid: document.getElementById('ring-container'),
    lists: [document.getElementById('clue-list')],
    clueBar,
    fillList: {
      items: fillItems,
      getLetter: p => getCellLetter(p % ringSize),
      isCorrect: p => isCorrect(p % ringSize),
      isComposing: p => composer.isComposing(p % ringSize),
      onCellTap: (i, j) => {
        const p = fillItems[i].cells[j];
        focusCell(p % ringSize, Math.floor(p / ringSize));
      },
    },
    bottomRow: [
      { label: '◂', key: 'ArrowLeft', glyph: true },
      { el: document.getElementById('rebus-btn') },
      { label: 'Loop ⇄', key: '.', wide: true },
      { label: '▸', key: 'ArrowRight', glyph: true },
    ],
  });

  // ── Restore & focus ─────────────────────────────────────────────────────────
  const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
  // Resume on the restored composing cell (docs/CROSS_TOOL_SPEC.md → "Composition is
  // saved state").
  focusCell(resumeCell === null ? FIRST_RING_POS : resumeCell, 0);
}

document.addEventListener('DOMContentLoaded', init);
