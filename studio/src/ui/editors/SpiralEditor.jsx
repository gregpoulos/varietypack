import spiral from '../../model/kinds/spiral.js';
import { formatCell } from '../../model/cells.js';
import { useBoardEditing } from './useBoardEditing.js';
import { keepBoardFocus } from './useBoardInput.js';
import { displayStatusFor } from './displayStatus.js';
import { Meter } from './Meter.jsx';
import { SequenceField } from './SequenceField.jsx';
import { SpiralBoard } from './SpiralBoard.jsx';
import { ClueSection } from './ClueSection.jsx';
import { EntryPanel } from './EntryPanel.jsx';
import { ClueList } from './ClueList.jsx';

const { commands, cutIndices, entryLabel, entryAtCell, entryFirstCell, stepRead, entryStart, breakAtCaret, gapToCutIndex, readsBackward } = spiral;
const CUTS = ['inward', 'outward'];
const capital = (s) => s[0].toUpperCase() + s.slice(1);
const other = (cut) => (cut === 'inward' ? 'outward' : 'inward');

function rangeOf(model, cut, j) {
  const nums = cutIndices(model, cut, j).map(i => i + 1);
  const lo = Math.min(...nums), hi = Math.max(...nums);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

// The structured Spiral editor. caret, composing and activeCut are UI state, not part of
// the undo history. Keys: a–z fill and advance; Enter composes a multi-letter cell;
// Backspace/Delete; ←/→; Tab; | splits or joins; . switches cut; Ctrl/Cmd+Z undoes.
export function SpiralEditor({ dispatch, model, clueView, setClueView, focusRef }) {
  const T = model.cells.length;
  const { ui, caret, moveTo, exec, run, focus, inputProps } = useBoardEditing({
    dispatch, model, commands, focusRef,
    positions: m => m.cells.length,
    initialUi: { activeCut: 'inward' },
    nav: {
      cellOf: (m, u) => u.caret,
      cell: (m, i) => m.cells[i],
      next: (m, u) => stepRead(m, u.activeCut, u.caret, 1),
      back: (m, u) => stepRead(m, u.activeCut, u.caret, -1),
      arrow: (m, u, d) => Math.min(Math.max(u.caret + d, 0), m.cells.length - 1),
      tab: (m, u, back) => entryStart(m, u.activeCut, u.caret, back ? -1 : 1),
      breakAt: (m, u) => {
        const r = breakAtCaret(m, u.activeCut, u.caret);
        return r.message ? r : { command: ['toggleBreak', [u.activeCut, r.index]] };
      },
      dot: (m, u) => ({ activeCut: other(u.activeCut) }),
      focusTarget: (t, m) => {
        if (t.cells) return { caret: t.cells[0] };
        if (t.cut !== undefined) return { caret: entryFirstCell(m, t.cut, t.entry), activeCut: t.cut };
        return null;
      },
    },
  });
  const { composing, activeCut } = ui;

  const circleSet = new Set(model.circles);

  function cardFor(cutName) {
    const j = entryAtCell(model, cutName, caret);
    const idx = cutIndices(model, cutName, j);
    const entry = model.cuts[cutName].entries[j];
    const shown = entry.displayAnswer ?? '';
    return {
      cutName, j, id: entry.id,
      name: capital(entryLabel(cutName, j)),
      range: `cells ${rangeOf(model, cutName, j)}`,
      tiles: idx.map(i => ({ i, number: i + 1, text: model.cells[i] === '' ? '·' : model.cells[i].toUpperCase(), circled: circleSet.has(i), here: i === caret })),
      clue: entry.clue,
      display: shown,
      displayStatus: displayStatusFor(shown, idx.map(i => model.cells[i]), readsBackward(cutName)),
    };
  }

  function rowsFor(cutName) {
    const here = entryAtCell(model, cutName, caret);
    return model.cuts[cutName].entries.map((entry, j) => ({
      id: entry.id, j, clue: entry.clue,
      label: `${rangeOf(model, cutName, j)}.`,
      answer: cutIndices(model, cutName, j).map(i => formatCell(model.cells[i])).join(''),
      active: cutName === activeCut && j === here,
    }));
  }

  const select = (cutName) => (j) => {
    moveTo({ caret: entryFirstCell(model, cutName, j), activeCut: cutName, composing: false });
    focus();
  };
  function step(delta) {
    const n = model.cuts[activeCut].entries.length;
    const j = (entryAtCell(model, activeCut, caret) + delta + n) % n;
    select(activeCut)(j);
  }

  const targets = CUTS.flatMap(cut => model.cuts[cut].entries.map((_, j) => ({
    value: `${cut}:${j}`, label: `${capital(entryLabel(cut, j))} · cells ${rangeOf(model, cut, j)}`,
  })));
  const nIn = model.cuts.inward.entries.length;
  const nOut = model.cuts.outward.entries.length;
  const entries = (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

  return (
    <div class="editor spiral-editor">
      <SequenceField cells={model.cells} onApply={cells => exec('setSequence', [cells])} />
      <div class="board-tools">
        <span id="cut-toggle" class="seg" role="group" aria-label="Direction">
          {CUTS.map(cut => (
            <button type="button" key={cut} data-cut={cut} class={`seg-btn ${cut === 'inward' ? 'in' : 'out'}` + (cut === activeCut ? ' active' : '')}
              aria-pressed={cut === activeCut} onClick={() => { moveTo({ activeCut: cut, composing: false }); focus(); }}>{capital(cut)}</button>
          ))}
        </span>
        <span class="tools">
          <button type="button" id="btn-insert-cell" class="btn" onClick={() => run('insertCell', caret)}>Insert cell</button>
          <button type="button" id="btn-delete-cell" class="btn" onClick={() => run('deleteCell', caret)}>Delete cell</button>
          <button type="button" id="btn-circle" class={'btn' + (circleSet.has(caret) ? ' on' : '')} aria-pressed={circleSet.has(caret)}
            onClick={() => run('toggleCircle', caret)}>Circle</button>
        </span>
        <span class="meters">
          <Meter id="meter-cells" bad={T < 40}><b>{T}</b> cells — min 40</Meter>
          <Meter id="meter-inward" bad={nIn < 2}><b>{entries(nIn)}</b> inward — min 2</Meter>
          <Meter id="meter-outward" bad={nOut < 2}><b>{entries(nOut)}</b> outward — min 2</Meter>
        </span>
      </div>
      <div id="board" class={'board ' + (activeCut === 'inward' ? 'in' : 'out')} onClick={focus} onMouseDown={keepBoardFocus}>
        <input id="board-input" aria-label="Board input" {...inputProps} />
        <SpiralBoard cells={model.cells} caret={caret} composing={composing} activeCut={activeCut}
          inStarts={model.cuts.inward.starts} outStarts={model.cuts.outward.starts} circles={circleSet}
          onCellClick={i => {
            // Clicking the selected cell again switches direction, as in the solver, but
            // only once the board has focus: the first click just selects.
            const focused = document.activeElement && document.activeElement.id === 'board-input';
            moveTo(i === caret && focused ? { activeCut: other(activeCut), composing: false } : { caret: i, composing: false });
          }}
          onGapClick={g => exec('toggleBreak', [activeCut, gapToCutIndex(model, activeCut, g)])} />
      </div>
      <p class="keys">Click a cell, then: <kbd>A–Z</kbd> fill and move on · <kbd>Space</kbd> clear the cell and move on · <kbd>Enter</kbd> multi-letter cell · <kbd>|</kbd> split or join at the cursor · <kbd>.</kbd> switch direction · <kbd>Tab</kbd> next entry · <kbd>Delete</kbd> remove the cell. Clicking the selected cell again also switches direction.</p>
      <ClueSection clueView={clueView} setClueView={setClueView} orphans={model.orphans} targets={targets}
        onAttach={(id, value) => { const [cut, j] = value.split(':'); exec('attachOrphan', [id, cut, Number(j)]); }}
        onDiscard={id => exec('discardOrphan', [id])}>
        {clueView === 'selected' ? (
          <EntryPanel main={cardFor(activeCut)} crossing={cardFor(other(activeCut))}
            onPrev={() => step(-1)} onNext={() => step(1)}
            onCircle={i => exec('toggleCircle', [i])}
            onClue={(card, text) => exec('setClue', [card.cutName, card.j, text], `clue:${card.cutName}:${card.id}`)}
            onDisplay={(card, text) => exec('setDisplayAnswer', [card.cutName, card.j, text], `display:${card.cutName}:${card.id}`)} />
        ) : (
          <div class="clue-cols">
            {CUTS.map(cut => (
              <ClueList key={cut} cutName={cut} title={capital(cut)} rows={rowsFor(cut)} onSelect={select(cut)}
                onClue={(j, text) => exec('setClue', [cut, j, text], `clue:${cut}:${model.cuts[cut].entries[j].id}`)} />
            ))}
          </div>
        )}
      </ClueSection>
    </div>
  );
}
