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
    // #hidden-input is static markup, present regardless of when this runs, so declaring
    // this ahead of the hiddenInput const (Event wiring) is safe.
    const refocus = () => document.getElementById('hidden-input').focus({ preventScroll: true });

    const letterState = new Array(ringSize).fill('');

    // Marks (or unmarks) ring position rp's correct state on both its cell and letter
    // elements together, so the two can never drift out of sync.
    function setCorrect(rp, on) {
      cellPaths[rp].classList.toggle('correct', on);
      letterTexts[rp].classList.toggle('correct', on);
    }

    function setCellLetter(ringPos, letter) {
      letterState[ringPos] = letter;
      setLetterText(letterTexts[ringPos], letter);
      setCorrect(ringPos, false);
    }

    // Multi-letter (rebus) entry state. Commit is wired at exactly one place — the top
    // of focusCell — which covers every cursor move because activeRingPos is assigned
    // nowhere else.
    const composer = makeComposer({
      getContent: rp => letterState[rp],
      setContent: (rp, s) => setCellLetter(rp, s),
      getCellEl:  rp => cellPaths[rp],
      onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    });

    // Board state and answer checking. Ring positions 0..N-1 are the canonical board
    // string order. markSolved marks clue items in *both* modes, per the mode-symmetry
    // rule in docs/CROSS_TOOL_SPEC.md → Answer checking.
    const checker = makeBoardChecker({
      cellIds:             Array.from({ length: ringSize }, (_, rp) => rp),
      getContent:          rp => letterState[rp],
      isCellFilled:        rp => composer.isCellFilled(rp),
      isCellMarkedCorrect: rp => cellPaths[rp].classList.contains('correct'),
      hashed:              !!data.hashed,
      getExpected:         rp => data.letters && data.letters[rp],
      getBoardHash:        () => data.boardHash,
      markSolved: () => {
        letterState.forEach((_, rp) => setCorrect(rp, true));
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

    // The one rebus toggle, shared by the Enter key and #rebus-btn. Both entry points must
    // behave identically, so neither gets its own copy of the composer call. Committing
    // does not advance the cursor — only an explicit move (arrow, Tab, click) does.
    function toggleRebus() {
      composer.enter(activeRingPos);
      syncUI();
    }

    // Declared above syncUI (which calls rebusBtn.sync()) — see docs/CROSS_TOOL_SPEC.md →
    // "Enter / Rebus button" for the TDZ rationale. Never hidden and never disabled —
    // unlike checkBtn. See setupRebusButton.
    const rebusBtn = setupRebusButton(document.getElementById('rebus-btn'), {
      onToggle:    toggleRebus,
      isComposing: () => composer.isComposing(activeRingPos),
      isSolved:    () => latch.solved,
      refocus,
    });

    function syncUI() {
      // Loop toggle active segment (loopBtns is built in Event wiring; syncUI first runs in Restore & focus).
      loopBtns.forEach((btn, i) => btn.classList.toggle('active', i === activeLoop));
      // Composition also ends on any cursor move, which never touches the button.
      rebusBtn.sync();

      // Active entry, plus the other loop's entry through the same cell as the
      // secondary highlight (snake-charmer-specific — see CLAUDE.md → SVG ring rendering).
      const activeEntryIdx = entryAtCell[activeRingPos][activeLoop];
      const activeEntryPositions = new Set(
        activeEntryIdx >= 0 ? ringPosByEntry[activeEntryIdx] : []
      );
      const otherLoop = (activeLoop + 1) % data.loops;
      const secondaryEntryIdx = entryAtCell[activeRingPos][otherLoop];
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
        p.classList.toggle('active-cell', rp === activeRingPos);
      });
      // Repaint active cell last within its layer so its border isn't covered by a neighbour's fill.
      cellsLayer.appendChild(cellPaths[activeRingPos]);

      Array.from(cluesList.children).forEach((li, i) => {
        li.classList.toggle('active-clue', i === activeEntryIdx);
        li.classList.toggle('secondary-entry', i === secondaryEntryIdx && i !== activeEntryIdx);
      });

      barPrimaryNum.textContent    = `${activeEntryIdx + 1}.`;
      barPrimaryText.innerHTML     = data.entries[activeEntryIdx].clue; // pre-rendered markdown HTML — see shared/build/renderMarkdown.js
      barSecondaryNum.textContent  = `${secondaryEntryIdx + 1}.`;
      barSecondaryText.innerHTML   = data.entries[secondaryEntryIdx].clue; // pre-rendered markdown HTML

      const allFilled = checker.isBoardFilled();
      const everyCellCorrect = checker.isSolved();

      doneWrong.hidden = !(allFilled && !everyCellCorrect);

      if (!data.hashed) {
        checkBtn.disabled = !composer.isCellFilled(activeRingPos) ||
          cellPaths[activeRingPos].classList.contains('correct');
      }
      latch.check(everyCellCorrect);
    }

    const saveKey = storageKey('sc', data);
    const { saveState, restoreState, clearState } = setupStorage(saveKey, {
      cellCount: ringSize,
      getState() {
        const correct = [];
        cellPaths.forEach((p, i) => { if (p.classList.contains('correct')) correct.push(i); });
        return {
          letters: letterState, correct, activeMs: timer.getElapsedMs(),
          composing: composer.getComposing(),
        };
      },
      applyState(saved) {
        saved.letters.forEach((letter, i) => {
          if (!letter) return;
          letterState[i] = letter;
          setLetterText(letterTexts[i], letter);
        });
        saved.correct.forEach(i => setCorrect(i, true));
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
      textSpan.innerHTML = entry.clue; // pre-rendered markdown HTML — see shared/build/renderMarkdown.js
      li.appendChild(textSpan);
      cluesList.appendChild(li);
    });

    // ── Event wiring ──────────────────────────────────────────────────────────
    const hiddenInput = document.getElementById('hidden-input');

    const checkBtn = document.getElementById('check-btn');

    const doneWrong = document.getElementById('done-wrong');
    const keysOverlay = setupKeysOverlay(
      [
        ['Tab',       'Next entry'],
        ['Shift+Tab', 'Previous entry'],
        ['← →',       'Move along ring'],
        ['⌫',         'Clear current cell'],
        ['Space',     'Clear and advance'],
        ['Enter',     'Multi-letter cell'],
        ['.',         'Toggle direction'],
      ],
      refocus
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
        if (composer.backspace(ringPos)) {
          syncUI();
          saveState();
          return;
        }
        if (letterState[ringPos]) {
          setCellLetter(ringPos, '');
          syncUI();
        } else {
          setCellLetter(prevRingPos(ringPos, ringSize), '');
          retreatCell(ringPos);
        }
        saveState();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        toggleRebus();
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
      const typed = normalize(hiddenInput.value).toUpperCase();
      hiddenInput.value = '';
      if (latch.solved || !typed) return;
      timer.onFirstInput();
      // typeLetter applies the slice(-1) rule on the non-composing path; advance only
      // when it says so, so capacity never triggers an advance.
      if (composer.typeLetter(ringPos, typed)) advanceCell(ringPos);
      else syncUI();

      // One checker call for both modes — advance first, then check, so the cursor
      // never lags a keystroke behind the hash comparison.
      checker.checkIfFilled();
      saveState();
    });

    // Clue click → jump to canonical start of that entry
    Array.from(cluesList.children).forEach((li, i) => {
      li.addEventListener('click', e => {
        // A clue can render a real link (see docs/CROSS_TOOL_SPEC.md ->
        // Markdown formatting) — let it open on its own rather than also
        // treating the click as selecting this entry.
        if (e.target.closest('a')) return;
        const { ringPos, loop } = canonicalStart[i];
        focusCell(ringPos, loop);
      });
    });

    // Check Cell (non-hashed mode only)
    function checkCell() {
      const rp = activeRingPos;
      // The focus call is required on every path out: the button holds focus here, and the
      // document keydown listener's BUTTON guard would swallow the next navigation key.
      // The already-correct guard skips a redundant re-save.
      if (!cellPaths[rp].classList.contains('correct') && composer.isCellFilled(rp)) {
        if (isCellCorrect(letterState[rp], data.letters[rp])) {
          setCorrect(rp, true);
          saveState();          // only this branch mutates persisted state
        } else {
          flashWrong(cellPaths[rp], flashLayer);
        }
      }
      syncUI();
      refocus();
    }


    function resetBoard() {
      resetAndRefocus({
        composer, clearState, timer, latch,
        clearBoard() {
          letterState.fill('');
          for (let rp = 0; rp < ringSize; rp++) {
            setLetterText(letterTexts[rp], '');
            setCorrect(rp, false);
          }
          Array.from(cluesList.children).forEach(li => li.classList.remove('correct'));
          flashLayer.replaceChildren();
        },
        focusInitial: () => focusCell(0, 0),
      });
    }

    setupControls({
      checkBtn, hashed: data.hashed, onCheck: checkCell,
      onClear: resetBoard, refocus, key: saveKey,
    });

    // ── Restore & focus ─────────────────────────────────────────────────────────
    const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
    // Resume on the restored composing cell — see docs/CROSS_TOOL_SPEC.md → "Composition
    // is saved state" for why this is load-bearing, not a convenience.
    focusCell(resumeCell === null ? 0 : resumeCell, activeLoop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

if (typeof module !== 'undefined') {
  module.exports = { buildEntryMaps, nextRingPos, prevRingPos };
}
