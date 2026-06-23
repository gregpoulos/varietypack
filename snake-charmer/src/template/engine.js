'use strict';

// Shared modules injected by builder.js in the browser; loaded conditionally for Node tests.
if (typeof isCellCorrect === 'undefined' && typeof require !== 'undefined')
  var isCellCorrect = require('../../../shared/isCellCorrect');

// ── Pure helpers (exported for Node tests) ────────────────────────────────────

// Derive the cell→entry mapping from entry lengths alone (sequential positional
// assignment). entryAtCell[ringPos][loop] = entry index occupying that cell, or -1.
// ringPosByEntry[ei] = ring positions for entry ei, in posInEntry order.
// canonicalStart[ei] = { ringPos, loop } of that entry's first cell (posInEntry 0).
function buildEntryMaps(entries, loops) {
  const ringSize = entries.reduce((s, e) => s + e.length, 0) / loops;
  const entryAtCell = Array.from({ length: ringSize }, () => new Array(loops).fill(-1));
  const ringPosByEntry = entries.map(() => []);
  const canonicalStart = [];
  let concatPos = 0;
  for (let ei = 0; ei < entries.length; ei++) {
    for (let pip = 0; pip < entries[ei].length; pip++) {
      const ringPos = concatPos % ringSize;
      const loop = Math.floor(concatPos / ringSize);
      entryAtCell[ringPos][loop] = ei;
      ringPosByEntry[ei].push(ringPos);
      if (pip === 0) canonicalStart[ei] = { ringPos, loop };
      concatPos++;
    }
  }
  return { entryAtCell, ringPosByEntry, canonicalStart };
}

function nextRingPos(pos, total) {
  return (pos + 1) % total;
}

function prevRingPos(pos, total) {
  return (pos - 1 + total) % total;
}

// ── DOM engine (browser only) ─────────────────────────────────────────────────
(function () {
  if (typeof document === 'undefined') return;

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

    // ── State ─────────────────────────────────────────────────────────────────
    let activeRingPos = 0;
    let activeLoop = 0;

    // ── Logic functions ───────────────────────────────────────────────────────
    const letterState = new Array(ringSize).fill('');

    function setCellLetter(ringPos, letter) {
      letterState[ringPos] = letter;
      letterTexts[ringPos].textContent = letter;
      cellPaths[ringPos].classList.remove('correct');
      letterTexts[ringPos].classList.remove('correct');
    }

    function focusCell(ringPos, loop) {
      activeRingPos = ringPos;
      activeLoop = loop;
      const activeEntryIdx = entryAtCell[ringPos][loop];
      const activeEntryPositions = new Set(
        activeEntryIdx >= 0 ? ringPosByEntry[activeEntryIdx] : []
      );

      const otherLoop = (loop + 1) % data.loops;
      const secondaryEntryIdx = entryAtCell[ringPos][otherLoop];
      const secondaryPositions = new Set(
        secondaryEntryIdx >= 0 && secondaryEntryIdx !== activeEntryIdx
          ? ringPosByEntry[secondaryEntryIdx]
          : []
      );

      cellPaths.forEach((p, rp) => {
        const isActive = activeEntryPositions.has(rp);
        const isSecondary = !isActive && secondaryPositions.has(rp);
        p.classList.toggle('active-entry', isActive);
        p.classList.toggle('secondary-entry', isSecondary);
        p.classList.toggle('active-cell', rp === ringPos);
      });
      // Repaint active cell last within its layer so its border isn't covered by a neighbour's fill.
      cellsLayer.appendChild(cellPaths[ringPos]);

      Array.from(cluesList.children).forEach((li, i) => {
        li.classList.toggle('active-clue', i === activeEntryIdx);
        li.classList.toggle('secondary-entry', i === secondaryEntryIdx && i !== activeEntryIdx);
      });

      barPrimaryNum.textContent    = `${activeEntryIdx + 1}.`;
      barPrimaryText.textContent   = data.entries[activeEntryIdx].clue;
      barSecondaryNum.textContent  = `${secondaryEntryIdx + 1}.`;
      barSecondaryText.textContent = data.entries[secondaryEntryIdx].clue;

      hiddenInput.focus({ preventScroll: true });
      syncUI();
    }

    function advanceCell(ringPos) {
      const nextPos = nextRingPos(ringPos, ringSize);
      const nextLoop = nextPos === 0 && ringPos === ringSize - 1
        ? (activeLoop + 1) % data.loops : activeLoop;
      focusCell(nextPos, nextLoop);
    }

    function retreatCell(ringPos) {
      const prevPos = prevRingPos(ringPos, ringSize);
      const prevLoop = prevPos === ringSize - 1 && ringPos === 0
        ? (activeLoop - 1 + data.loops) % data.loops : activeLoop;
      focusCell(prevPos, prevLoop);
    }

    function checkAllCellsIfFilled() {
      if (!letterState.every(l => l !== '')) return;
      if (!letterState.every((l, rp) => isCellCorrect(l, data.letters[rp]))) { syncUI(); return; }
      letterState.forEach((_, rp) => {
        cellPaths[rp].classList.add('correct');
        letterTexts[rp].classList.add('correct');
      });
      syncUI();
    }

    function checkBoardIfFilled() {
      if (!letterState.every(l => l !== '')) return;
      if (sha256hex(getSolution()) !== data.boardHash) { syncUI(); return; }
      letterState.forEach((_, rp) => {
        cellPaths[rp].classList.add('correct');
        letterTexts[rp].classList.add('correct');
      });
      data.entries.forEach((_, ei) => cluesList.children[ei].classList.add('correct'));
      syncUI();
    }

    function getSolution() {
      return letterState.join('').toLowerCase();
    }

    function isSolved() {
      return cellPaths.every(p => p.classList.contains('correct'));
    }

    function syncUI() {
      // Loop toggle active segment (loopBtns is built in Event wiring; syncUI first runs in Restore & focus).
      loopBtns.forEach((btn, i) => btn.classList.toggle('active', i === activeLoop));

      const allFilled = letterState.every(l => l !== '');
      const everyCellCorrect = isSolved();

      doneWrong.hidden = !(allFilled && !everyCellCorrect);

      if (!data.hashed) {
        checkBtn.disabled = !letterState[activeRingPos] ||
          cellPaths[activeRingPos].classList.contains('correct');
      }
      latch.check(everyCellCorrect);
    }

    const { saveState, restoreState, clearState } = setupStorage(storageKey('sc', data), {
      cellCount: ringSize,
      getState() {
        const correct = [];
        cellPaths.forEach((p, i) => { if (p.classList.contains('correct')) correct.push(i); });
        return { letters: letterState, correct, activeMs: timer.getElapsedMs() };
      },
      applyState(saved) {
        saved.letters.forEach((letter, i) => {
          if (!letter) return;
          letterState[i] = letter;
          letterTexts[i].textContent = letter;
        });
        saved.correct.forEach(i => {
          cellPaths[i].classList.add('correct');
          letterTexts[i].classList.add('correct');
        });
        timer.restoreMs(saved.activeMs);
      },
    });

    const timer = setupTimer({ onPause: () => saveState() });

    const congratsDialog = setupCongratsDialog({
      title: data.title,
      date: data.date,
      onPlayAgain: () => resetBoard(),
    });

    const latch = makeCompletionLatch({
      puzzleRoot: document.querySelector('.puzzle-main'),
      kind:         data.kind,
      title:        data.title,
      date:         data.date,
      getBoardHash: () => data.boardHash,
      getSolution,
      getElapsedMs: () => timer.getElapsedMs(),
      onComplete: (timeMs) => congratsDialog.open(timeMs),
    });

    // ── Build SVG ─────────────────────────────────────────────────────────────
    document.querySelector('.puzzle-main').classList.add(`layout-${data.shape}`);

    // svgEl() is provided by shared/engine-chrome.js (inlined into the bundle).
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
      path.addEventListener('click', () => {
        const alreadyActive = i === activeRingPos && document.activeElement === hiddenInput;
        focusCell(i, alreadyActive ? (activeLoop + 1) % data.loops : activeLoop);
      });
      cellsLayer.appendChild(path);
      cellPaths.push(path);
    }

    data.entries.forEach((entry, ei) => {
      if (!entry.styles || !Array.isArray(entry.styles.circle)) return;
      entry.styles.circle.forEach(posInEntry => {
        const ringPos = ringPosByEntry[ei][posInEntry];
        if (ringPos === undefined) return;
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

    const barPrimaryNum    = document.querySelector('#active-clue-primary .active-clue-num');
    const barPrimaryText   = document.querySelector('#active-clue-primary .active-clue-text');
    const barSecondaryNum  = document.querySelector('#active-clue-secondary .active-clue-num');
    const barSecondaryText = document.querySelector('#active-clue-secondary .active-clue-text');

    // ── Header & clues ────────────────────────────────────────────────────────
    renderByline(data);
    renderInstructions(data);

    // Render clue list
    const cluesList = document.getElementById('clues');
    data.entries.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'clue-item';
      li.dataset.entry = i;
      const textSpan = document.createElement('span');
      textSpan.className = 'clue-text';
      textSpan.textContent = entry.clue;
      li.appendChild(textSpan);
      cluesList.appendChild(li);
    });

    // ── Event wiring ──────────────────────────────────────────────────────────
    const hiddenInput = document.getElementById('hidden-input');

    const checkBtn = document.getElementById('check-btn');
    if (data.hashed) checkBtn.hidden = true;

    const doneWrong = document.getElementById('done-wrong');
    const keysOverlay = setupKeysOverlay(
      [
        ['Tab',       'Next entry'],
        ['Shift+Tab', 'Previous entry'],
        ['← →',       'Move along ring'],
        ['⌫',         'Clear current cell'],
        ['Space',     'Clear and advance'],
        ['.',         'Toggle direction'],
      ],
      () => hiddenInput.focus({ preventScroll: true })
    );

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
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toggle-opt' + (l === 0 ? ' active' : '');
        btn.textContent = `Clues ${first}–${last}`;
        btn.addEventListener('click', () => focusCell(activeRingPos, l));
        toggle.appendChild(btn);
        return btn;
      });
    })();

    setupKeydown(e => {
      if (latch.solved) return;
      const ringPos = activeRingPos;
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (letterState[ringPos]) {
          setCellLetter(ringPos, '');
          syncUI();
        } else {
          const prevPos = prevRingPos(ringPos, ringSize);
          const prevLoop = prevPos === ringSize - 1 && ringPos === 0
            ? (activeLoop - 1 + data.loops) % data.loops : activeLoop;
          setCellLetter(prevPos, '');
          focusCell(prevPos, prevLoop);
        }
        saveState();
      } else if (e.key === ' ') {
        e.preventDefault();
        setCellLetter(ringPos, '');
        saveState();
        advanceCell(ringPos);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        advanceCell(ringPos);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        retreatCell(ringPos);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const activeEntryIdx = entryAtCell[activeRingPos][activeLoop];
        const nextEntryIdx = e.shiftKey
          ? (activeEntryIdx - 1 + data.entries.length) % data.entries.length
          : (activeEntryIdx + 1) % data.entries.length;
        const { ringPos: targetRingPos, loop: targetLoop } = canonicalStart[nextEntryIdx];
        focusCell(targetRingPos, targetLoop);
      } else if (e.key === '.') {
        e.preventDefault();
        focusCell(activeRingPos, (activeLoop + 1) % data.loops);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                 e.key === 'PageUp'  || e.key === 'PageDown') {
        e.preventDefault();
        scrollByKey(e.key);
      }
    }, { keysOverlay });

    hiddenInput.addEventListener('input', () => {
      const ringPos = activeRingPos;
      const letter = normalize(hiddenInput.value).slice(-1).toUpperCase();
      hiddenInput.value = '';
      if (latch.solved || !letter) return;
      timer.onFirstInput();
      setCellLetter(ringPos, letter);
      // Advance before the hash check — awaiting the check first causes keystroke lag.
      advanceCell(ringPos);

      if (data.hashed) {
        checkBoardIfFilled();
      } else {
        checkAllCellsIfFilled();
      }
      saveState();
    });

    // Clue click → jump to canonical start of that entry
    Array.from(cluesList.children).forEach((li, i) => {
      li.addEventListener('click', () => {
        const { ringPos, loop } = canonicalStart[i];
        focusCell(ringPos, loop);
      });
    });

    // Check Cell (non-hashed mode only)
    // hiddenInput.focus() is required: buttons that don't call focusCell() must restore
    // focus manually, otherwise the BUTTON guard in the document keydown listener blocks navigation.
    if (!data.hashed) {
      checkBtn.addEventListener('click', () => {
        if (isCellCorrect(letterState[activeRingPos], data.letters[activeRingPos])) {
          cellPaths[activeRingPos].classList.add('correct');
          letterTexts[activeRingPos].classList.add('correct');
        } else {
          flashWrong(cellPaths[activeRingPos], flashLayer);
        }
        syncUI();
        saveState();
        hiddenInput.focus({ preventScroll: true });
      });
    }

    function resetBoard() {
      letterState.fill('');
      for (let rp = 0; rp < ringSize; rp++) {
        letterTexts[rp].textContent = '';
        cellPaths[rp].classList.remove('correct');
        letterTexts[rp].classList.remove('correct');
      }
      Array.from(cluesList.children).forEach(li => li.classList.remove('correct'));
      while (flashLayer.firstChild) flashLayer.removeChild(flashLayer.firstChild);
      clearState();
      timer.reset();
      latch.reset();
      focusCell(0, 0);
    }

    setupClearButton(
      document.getElementById('clear-btn'),
      resetBoard,
      () => hiddenInput.focus({ preventScroll: true })
    );

    // ── Restore & focus ─────────────────────────────────────────────────────────
    restoreState();
    latch.sealIfSolved(isSolved());
    focusCell(0, 0);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

if (typeof module !== 'undefined') {
  module.exports = { buildEntryMaps, nextRingPos, prevRingPos };
}
