import spiral from '../../model/kinds/spiral.js';
import { formatCell } from '../../model/cells.js';
import { useBoardEditing } from './useBoardEditing.js';
import { keepBoardFocus, boardHasFocus } from './useBoardInput.js';
import { displayStatusFor } from './displayStatus.js';
import { SequenceField } from './SequenceField.jsx';
import { SpiralBoard } from './SpiralBoard.jsx';
import { ClueLists } from './ClueList.jsx';
import { plural } from './plural.js';
import { PhaseLayout } from './PhaseLayout.jsx';
import { WordList } from './WordList.jsx';
import { Checks } from './Checks.jsx';
import { KeyStrip, KeyList } from './KeyStrip.jsx';
import { PasteLetters } from './PasteLetters.jsx';
import { LooseCluesNotice } from './LooseCluesNotice.jsx';
import { Latch } from '../Latch.jsx';
import { CellMenu } from './CellMenu.jsx';

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
export function SpiralEditor({ dispatch, model, phase, focusRef, settings, fillClues, header }) {
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

  // The selected row also carries the spaced answer and its status (ClueList shows them
  // on that row only).
  function rowsFor(cutName) {
    const here = entryAtCell(model, cutName, caret);
    const mine = cutName === activeCut;
    return model.cuts[cutName].entries.map((entry, j) => {
      const idx = cutIndices(model, cutName, j);
      const row = {
        id: entry.id, j, clue: entry.clue,
        label: `${rangeOf(model, cutName, j)}.`,
        answer: idx.map(i => formatCell(model.cells[i])).join(''),
        active: mine && j === here,
        crossing: !mine && j === here,
      };
      if (row.active) {
        row.display = entry.displayAnswer ?? '';
        row.displayStatus = displayStatusFor(row.display, idx.map(i => model.cells[i]), readsBackward(cutName));
      }
      return row;
    });
  }

  // focusBoard: false is for a clue field gaining focus in the Clues phase, which must
  // keep it so the keys typed there stay in the field.
  const select = (cutName) => (j, { focusBoard = true } = {}) => {
    moveTo({ caret: entryFirstCell(model, cutName, j), activeCut: cutName, composing: false });
    if (focusBoard) focus();
  };

  const targets = CUTS.flatMap(cut => model.cuts[cut].entries.map((_, j) => ({
    value: `${cut}:${j}`, label: `${capital(entryLabel(cut, j))} · cells ${rangeOf(model, cut, j)}`,
  })));
  const nIn = model.cuts.inward.entries.length;
  const nOut = model.cuts.outward.entries.length;

  const lists = CUTS.map(cut => ({ cutName: cut, title: capital(cut), rowName: capital(cut), rows: rowsFor(cut) }));
  // The cell-level actions, one menu. Insert and Delete cell only in the Board phase.
  const cellItems = (structural) => [
    { id: 'btn-circle', label: 'Toggle circle', checked: circleSet.has(caret), onSelect: () => run('toggleCircle', caret) },
    { id: 'btn-rebus', label: composing ? 'Leave rebus mode' : 'Enter rebus mode', hint: 'Enter', checked: !!composing, onSelect: () => moveTo({ composing: !composing }) },
    ...(structural ? [
      { id: 'btn-insert-cell', label: 'Insert cell', onSelect: () => run('insertCell', caret) },
      { id: 'btn-delete-cell', label: 'Delete cell', hint: 'Del', onSelect: () => run('deleteCell', caret) },
    ] : []),
  ];

  return (
    <PhaseLayout phase={phase} settings={settings} fillClues={fillClues} header={header}
      toggle={(
        <Latch id="cut-toggle" label="Direction" value={activeCut}
          options={CUTS.map((cut, i) => ({ value: cut, text: capital(cut), led: i === 0 ? 'ch1' : 'ch2', attrs: { 'data-cut': cut } }))}
          onChange={cut => { moveTo({ activeCut: cut, composing: false }); focus(); }} />
      )}
      tools={(
        <span class="tools">
          <CellMenu items={cellItems(true)} focus={focus} />
          <PasteLetters><SequenceField cells={model.cells} onApply={cells => exec('setSequence', [cells])} /></PasteLetters>
        </span>
      )}
      clueTools={<span class="tools"><CellMenu items={cellItems(false)} focus={focus} /></span>}
      board={(
        <div id="board" class={'board ' + (activeCut === 'inward' ? 'in' : 'out')} onClick={focus} onMouseDown={keepBoardFocus}>
          <input id="board-input" aria-label="Board input" {...inputProps} />
          <SpiralBoard cells={model.cells} caret={caret} composing={composing} activeCut={activeCut}
            inStarts={model.cuts.inward.starts} outStarts={model.cuts.outward.starts} circles={circleSet}
            onCellClick={i => {
              const focused = boardHasFocus();
              moveTo(i === caret && focused ? { activeCut: other(activeCut), composing: false } : { caret: i, composing: false });
            }}
            onGapClick={g => exec('toggleBreak', [activeCut, gapToCutIndex(model, activeCut, g)])} />
        </div>
      )}
      keys={(
        <KeyStrip
          essential={<><kbd>A–Z</kbd> fill · <kbd>|</kbd> split/join · <kbd>.</kbd> direction · <kbd>Tab</kbd> next entry · <kbd>Enter</kbd> multi-letter cell</>}
          full={<KeyList intro="Click a cell, then:" notes="Clicking the selected cell again also switches direction."
            items={[
              [<kbd>A–Z</kbd>, 'fill and move on'],
              [<kbd>Space</kbd>, 'clear the cell and move on'],
              [<kbd>Enter</kbd>, 'multi-letter cell'],
              [<kbd>|</kbd>, 'split or join at the cursor'],
              [<kbd>.</kbd>, 'switch direction'],
              [<kbd>Tab</kbd>, 'next entry'],
              [<><kbd>←</kbd> <kbd>→</kbd></>, 'move'],
              [<kbd>Delete</kbd>, 'remove the cell'],
            ]} />} />
      )}
      checks={(
        <Checks items={[
          { id: 'meter-cells', ok: T >= 40, text: <><b>{T}</b> cells — min 40</> },
          { id: 'meter-inward', ok: nIn >= 2, text: <><b>{plural(nIn, 'entry', 'entries')}</b> inward — min 2</> },
          { id: 'meter-outward', ok: nOut >= 2, text: <><b>{plural(nOut, 'entry', 'entries')}</b> outward — min 2</> },
        ]} />
      )}
      side={(
        <>
          <LooseCluesNotice count={model.orphans.length} onShow={() => dispatch({ type: 'SET_VIEW', view: 'clues' })} />
          <WordList lists={lists} onSelect={(j, ctx) => select(ctx.cutName)(j)} looseCount={model.orphans.length} />
        </>
      )}
      clues={(
        <ClueLists lists={lists} orphans={model.orphans} targets={targets}
          onAttach={(id, value) => { const [cut, j] = value.split(':'); exec('attachOrphan', [id, cut, Number(j)]); }}
          onDiscard={id => exec('discardOrphan', [id])}
          onSelect={(j, ctx) => select(ctx.cutName)(j)}
          onFocusClue={(j, ctx) => {
            // A caret already inside this entry stays put, so tabbing into its clue
            // doesn't reset a mid-entry caret.
            if (ctx.cutName === activeCut && entryAtCell(model, activeCut, caret) === j) moveTo({ composing: false });
            else select(ctx.cutName)(j, { focusBoard: false });
          }}
          onClue={(j, text, ctx) => exec('setClue', [ctx.cutName, j, text], `clue:${ctx.cutName}:${model.cuts[ctx.cutName].entries[j].id}`)}
          onDisplay={(j, text, ctx) => exec('setDisplayAnswer', [ctx.cutName, j, text], `display:${ctx.cutName}:${model.cuts[ctx.cutName].entries[j].id}`)} />
      )} />
  );
}
