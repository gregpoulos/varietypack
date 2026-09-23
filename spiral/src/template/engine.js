/* global window, document */
(function () {
  'use strict';

  function init() {
    // ── Data & constants ────────────────────────────────────────────────────
    const data       = window.PUZZLE_DATA;
    const totalCells = data.cells.length;

    // ── Geometry & index maps ────────────────────────────────────────────────
    // svgEl() is provided by shared/engine-chrome.js (inlined into the bundle).
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

    // Everything that differs between the two reading directions, in one table:
    // the cell→entry map, the entry list, each entry's cells, the step to the next
    // cell (inward counts up, outward counts down), the clue list's element id, the
    // range label, the bar's direction label, and the other direction's name.
    // inwardRange/outwardRange are function declarations below, hoisted into scope here.
    const DIRS = {
      inward: {
        map: inwardMap,  entries: data.inward,  entryCells: inwardEntryCells,
        step: 1,  listId: 'inward-clues',  range: inwardRange,  label: 'Inward',  opposite: 'outward',
      },
      outward: {
        map: outwardMap, entries: data.outward, entryCells: outwardEntryCells,
        step: -1, listId: 'outward-clues', range: outwardRange, label: 'Outward', opposite: 'inward',
      },
    };

    // ── State ────────────────────────────────────────────────────────────────
    let activeCell = 1;
    let direction  = 'inward';

    // ── Logic functions ──────────────────────────────────────────────────────
    // #hidden-input is static markup, present regardless of when this runs, so declaring
    // this ahead of the hiddenInput const (Event wiring) is safe.
    const refocus = () => document.getElementById('hidden-input').focus({ preventScroll: true });

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

    const cellLetters = new Map();

    function getCellLetter(n) { return cellLetters.get(n) || ''; }

    // Marks (or unmarks) cell n's correct state on both its cell and letter elements
    // together, so the two can never drift out of sync.
    function setCorrect(n, on) {
      cellPaths[n].classList.toggle('correct', on);
      letterTexts[n].classList.toggle('correct', on);
    }

    function setCellLetter(n, letter) {
      if (letter) cellLetters.set(n, letter);
      else cellLetters.delete(n);
      setLetterText(letterTexts[n], letter);
      setCorrect(n, false);
    }

    // Multi-letter (rebus) entry state. Commit is wired at exactly one place — the top
    // of focusCell — which covers every cursor move because activeCell is assigned
    // nowhere else.
    const composer = makeComposer({
      getContent: n => getCellLetter(n),
      setContent: (n, s) => setCellLetter(n, s),
      getCellEl:  n => cellPaths[n],
      onCommit:   () => { syncUI(); checker.checkIfFilled(); saveState(); },
    });

    // Board state and answer checking. inwardEntryCells.flat() is cells 1→N — the
    // canonical board string order. markSolved marks clue items in *both* modes, per
    // the mode-symmetry rule in docs/CROSS_TOOL_SPEC.md → Answer checking.
    const checker = makeBoardChecker({
      cellIds:             inwardEntryCells.flat(),
      getContent:          n => getCellLetter(n),
      isCellFilled:        n => composer.isCellFilled(n),
      isCellMarkedCorrect: n => cellPaths[n].classList.contains('correct'),
      hashed:              !!data.hashed,
      getExpected:         n => data.letters && data.letters[n - 1],
      getBoardHash:        () => data.boardHash,
      markSolved: () => {
        data.cells.forEach(c => setCorrect(c.cell_number, true));
        document.querySelectorAll('.clue-item').forEach(li => li.classList.add('correct'));
      },
      syncUI: () => syncUI(),
    });

    function checkCell() {
      const n = activeCell;
      // The focus call is required on every path out: the button holds focus here, and the
      // document keydown listener's BUTTON guard would swallow the next navigation key.
      // The already-correct guard skips a redundant re-save.
      if (!cellPaths[n].classList.contains('correct') && composer.isCellFilled(n)) {
        if (isCellCorrect(getCellLetter(n), data.letters[n - 1])) {
          setCorrect(n, true);
          saveState();          // only this branch mutates persisted state
        } else {
          flashWrong(cellPaths[n], flashLayer);
        }
      }
      syncUI();
      refocus();
    }

    function inwardRange(i) {
      const arr = inwardEntryCells[i];
      return `${arr[0]}–${arr[arr.length - 1]}`;
    }

    function outwardRange(i) {
      const cells = outwardEntryCells[i];
      return `${Math.min(...cells)}–${Math.max(...cells)}`;
    }

    // Builds one direction's <li class="clue-item"> list. Inward and outward differ only in
    // which list/entries/range-fn/cell-array they read and which direction they set on click —
    // folded into one function parameterized by `dir` rather than two copy-pasted blocks.
    function renderCluesFor(dir) {
      const { listId, entries, range: rangeFor, entryCells: entryCellsFor } = DIRS[dir];
      const list = document.getElementById(listId);

      entries.forEach((entry, i) => {
        const li = document.createElement('li');
        li.className = 'clue-item';
        li.dataset.direction  = dir;
        li.dataset.entryIndex = i;
        const rangeSpan = document.createElement('span');
        rangeSpan.className = 'clue-range';
        rangeSpan.textContent = rangeFor(i) + '.';
        const textSpan = document.createElement('span');
        textSpan.className = 'clue-text';
        textSpan.innerHTML = entry.clue; // pre-rendered markdown HTML — see shared/build/renderMarkdown.js
        li.append(rangeSpan, textSpan);
        li.addEventListener('click', e => {
          // A clue can render a real link (see docs/CROSS_TOOL_SPEC.md ->
          // Markdown formatting) — let it open on its own rather than also
          // treating the click as selecting this entry.
          if (e.target.closest('a')) return;
          direction = dir;
          focusCell(entryCellsFor[i][0]);
        });
        list.appendChild(li);
      });
    }

    function renderClues() {
      renderCluesFor('inward');
      renderCluesFor('outward');
    }

    function focusCell(n) {
      composer.commitIfMoved(n);
      activeCell = n;
      refocus();
      syncUI();
    }

    function onCellClick(n) {
      if (n === activeCell) direction = DIRS[direction].opposite;
      focusCell(n);
    }

    // The one rebus toggle, shared by the Enter key and #rebus-btn. Both entry points must
    // behave identically, so neither gets its own copy of the composer call. Committing
    // does not advance the cursor — only an explicit move (arrow, Tab, click) does.
    function toggleRebus() {
      composer.enter(activeCell);
      syncUI();
    }

    // Declared above syncUI (which calls rebusBtn.sync()) — see docs/CROSS_TOOL_SPEC.md →
    // "Enter / Rebus button" for the TDZ rationale. Never hidden and never disabled —
    // unlike checkBtn. See setupRebusButton.
    const rebusBtn = setupRebusButton(document.getElementById('rebus-btn'), {
      onToggle:    toggleRebus,
      isComposing: () => composer.isComposing(activeCell),
      isSolved:    () => latch.solved,
      refocus,
    });

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
      toggleOpts.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.dir === direction);
      });
      // Composition also ends on any cursor move, which never touches the button.
      rebusBtn.sync();

      const cur         = DIRS[direction];
      const opp         = DIRS[cur.opposite];
      const curMap      = cur.map;
      const curEntryIdx = curMap[activeCell].entryIndex;

      data.cells.forEach(cell => {
        const el  = cellPaths[cell.cell_number];
        const cel = curMap[cell.cell_number];
        el.classList.toggle('active-entry', !!cel && cel.entryIndex === curEntryIdx);
        el.classList.toggle('active-cell',  cell.cell_number === activeCell);
      });

      const oppDir      = cur.opposite;
      const oppEntryIdx = opp.map[activeCell].entryIndex;

      document.querySelectorAll('.clue-item').forEach(item => {
        const itemDir = item.dataset.direction;
        const itemIdx = Number(item.dataset.entryIndex);
        item.classList.toggle('active-clue',
          itemDir === direction && itemIdx === curEntryIdx);
        item.classList.toggle('secondary-entry',
          itemDir === oppDir && itemIdx === oppEntryIdx);
      });

      barPrimaryDir.textContent    = cur.label;
      barPrimaryNum.textContent     = cur.range(curEntryIdx) + '.';
      barPrimaryText.innerHTML      = cur.entries[curEntryIdx].clue; // pre-rendered markdown HTML — see shared/build/renderMarkdown.js
      barSecondaryDir.textContent  = opp.label;
      barSecondaryNum.textContent  = opp.range(oppEntryIdx) + '.';
      barSecondaryText.innerHTML   = opp.entries[oppEntryIdx].clue; // pre-rendered markdown HTML

      if (!data.hashed && checkBtn) {
        checkBtn.disabled = !composer.isCellFilled(activeCell) ||
          cellPaths[activeCell].classList.contains('correct');
      }

      // Chevron on leading edge of active cell pointing in direction of travel
      const ac = data.cells[activeCell - 1];
      chevronEl.setAttribute('d', chevronPathD(ac, direction === 'inward'));

      const solved = checker.isSolved();
      const allFilled = checker.isBoardFilled();
      doneWrong.hidden = !(allFilled && !solved);
      latch.check(solved);
    }

    const saveKey = storageKey('sp', data);
    const { saveState, restoreState, clearState } = setupStorage(saveKey, {
      cellCount: totalCells,
      getState() {
        const letters = {};
        cellLetters.forEach((v, k) => { letters[k] = v; });
        const correct = [];
        data.cells.forEach(c => {
          if (cellPaths[c.cell_number].classList.contains('correct')) correct.push(c.cell_number);
        });
        return {
          letters, correct, activeMs: timer.getElapsedMs(),
          composing: composer.getComposing(),
        };
      },
      applyState(saved) {
        Object.entries(saved.letters).forEach(([k, v]) => {
          const n = Number(k);
          cellLetters.set(n, v);
          setLetterText(letterTexts[n], v);
        });
        saved.correct.forEach(n => setCorrect(n, true));
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

    const toggleOpts = Array.from(document.querySelectorAll('.toggle-opt'));
    const checkBtn   = document.getElementById('check-btn');
    const doneWrong  = document.getElementById('done-wrong');

    // ── Header & clues ───────────────────────────────────────────────────────
    renderByline(data);
    renderInstructions(data);
    renderClues();

    // ── Event wiring ─────────────────────────────────────────────────────────
    toggleOpts.forEach(btn => {
      btn.addEventListener('click', () => {
        direction = btn.dataset.dir;
        focusCell(activeCell);
      });
    });


    function resetBoard() {
      resetAndRefocus({
        composer, clearState, timer, latch,
        clearBoard() {
          cellLetters.clear();
          data.cells.forEach(c => {
            setLetterText(letterTexts[c.cell_number], '');
            setCorrect(c.cell_number, false);
          });
          document.querySelectorAll('.clue-item').forEach(li => li.classList.remove('correct'));
          flashLayer.replaceChildren();
          direction = 'inward';
        },
        focusInitial: () => focusCell(inwardEntryCells[0][0]),
      });
    }

    setupControls({
      checkBtn, hashed: data.hashed, onCheck: checkCell,
      onClear: resetBoard, refocus, key: saveKey,
    });

    const hiddenInput = document.getElementById('hidden-input');

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
    }, { keysOverlay });

    hiddenInput.addEventListener('input', () => {
      const typed = normalize(hiddenInput.value).toUpperCase();
      hiddenInput.value = '';
      if (latch.solved || !typed) return;
      timer.onFirstInput();
      // typeLetter applies the slice(-1) rule on the non-composing path; advance only
      // when it says so, so capacity never triggers an advance.
      if (composer.typeLetter(activeCell, typed)) focusCell(nextInDir(activeCell, direction));
      else syncUI();

      // One checker call for both modes — advance first, then check, so the cursor
      // never lags a keystroke behind the hash comparison.
      checker.checkIfFilled();
      saveState();
    });

    svg.addEventListener('click', e => {
      if (e.target === svg) refocus();
    });

    // ── Restore & focus ──────────────────────────────────────────────────────
    const resumeCell = restoreAndSeal({ restoreState, checker, latch, composer });
    // Resume on the restored composing cell — see docs/CROSS_TOOL_SPEC.md → "Composition
    // is saved state" for why this is load-bearing, not a convenience.
    focusCell(resumeCell === null ? 1 : resumeCell);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
