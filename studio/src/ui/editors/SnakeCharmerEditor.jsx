import sc from '../../model/kinds/snake-charmer.js';
import { formatCell } from '../../model/cells.js';
import { useBoardEditing } from './useBoardEditing.js';
import { boardHasFocus } from './useBoardInput.js';
import { displayTextOf } from './displayStatus.js';
import { RingBoard } from './RingBoard.jsx';
import { ClueLists } from './ClueList.jsx';
import { ShapeSelect } from './ShapeSelect.jsx';
import { plural } from './plural.js';
import { PhaseLayout } from './PhaseLayout.jsx';
import { WordList } from './WordList.jsx';
import { Checks } from './Checks.jsx';
import { KeyStrip, KeyList } from './KeyStrip.jsx';
import { BoardFrame } from './BoardFrame.jsx';
import { Latch } from '../Latch.jsx';
import { CellMenu, circleAndRebusItems } from './CellMenu.jsx';

const { commands, total, positionsOf, ringLabel, twin, entryAtPosition, coincidentStarts, stepPosition, entryStartPosition, breakAtCaret } = sc;

// The structured Snake Charmer editor. caret is a position over the two laps (0..2N-1);
// the active lap is the caret's, so it isn't separate state. Keys: a–z fill and advance;
// Enter composes a multi-letter cell; Backspace/Delete; ←/→ (wrapping); Tab; | splits or
// joins at the caret; . switches lap; Ctrl/Cmd+Z undoes. Typing on either lap edits ring
// cell p % N, since the letter is the same on both laps.
export function SnakeCharmerEditor({ dispatch, model, phase, focusRef, settings, fillClues, header }) {
  const N = model.ring.length;
  const { ui, caret, moveTo, exec, run, say, focus, inputProps } = useBoardEditing({
    dispatch, model, commands, focusRef,
    positions: total,
    nav: {
      cellOf: (m, u) => u.caret % m.ring.length,
      cell: (m, k) => m.ring[k],
      next: (m, u) => stepPosition(m, u.caret, 1),
      back: (m, u) => Math.max(0, u.caret - 1),            // Backspace stops at the first cell; it doesn't wrap round and erase the last one
      arrow: (m, u, d) => stepPosition(m, u.caret, d),
      tab: (m, u, back) => entryStartPosition(m, u.caret, back ? -1 : 1),
      breakAt: (m, u) => {
        const r = breakAtCaret(m, u.caret);
        return r.message ? r : { command: ['toggleBreak', [r.index]] };
      },
      dot: (m, u) => ({ caret: twin(m, u.caret) }),
      // The caret is a position over two laps, so a ring that grows or shrinks moves lap
      // 2's base: keep it on the same lap and ring cell.
      remap: (before, after, u) => {
        const n = before.ring.length;
        const m = after.ring.length;
        return (u.caret < n ? 0 : m) + Math.min(u.caret % n, m - 1);
      },
      focusTarget: (t, m, u) => {
        if (t.cells) return { caret: (u.caret < m.ring.length ? 0 : m.ring.length) + t.cells[0] };
        if (t.entry !== undefined) return { caret: m.cut.starts[t.entry] };
        return null;
      },
    },
  });
  const { composing } = ui;
  const lapNow = caret < N ? 1 : 2;

  const circleSet = new Set(model.circles);
  const clashes = coincidentStarts(model);
  const clashEntries = new Set();
  model.cut.starts.forEach((s, j) => { if (clashes.includes(s % N)) clashEntries.add(j); });
  const nEntries = model.cut.entries.length;

  const answerOf = (j) => positionsOf(model, j).map(p => formatCell(model.ring[p % N])).join('');

  const here = entryAtPosition(model, caret);
  const across = entryAtPosition(model, twin(model, caret));

  // The crossing row is the entry covering the caret's cell on the other lap, unless that
  // is the selected entry itself.
  const rows = model.cut.entries.map((entry, j) => {
    const row = {
      id: entry.id, j, clue: entry.clue, label: `${j + 1}.`, answer: answerOf(j),
      active: j === here, crossing: j === across && across !== here, clash: clashEntries.has(j),
    };
    if (row.active) Object.assign(row, displayTextOf(entry, positionsOf(model, j).map(p => model.ring[p % N])));
    return row;
  });
  const select = (j, { focusBoard = true } = {}) => {
    moveTo({ caret: model.cut.starts[j], composing: false });
    if (focusBoard) focus();
  };

  // One list of rows, titled for each phase: the Board phase's word list says what it
  // lists (Entries), the Clues phase what it holds (Clues).
  const listTitled = (title) => [{ cutName: 'entries', title, rowName: 'Entry', rows }];

  const targets = model.cut.entries.map((_, j) => ({ value: String(j), label: `Entry ${j + 1} · ${ringLabel(model, j)}` }));

  // The cell-level actions, one menu. Insert and Delete cell only in the Board phase.
  const cellItems = (structural) => [
    ...circleAndRebusItems({ circled: circleSet.has(caret % N), onCircle: () => run('toggleCircle', caret % N), composing, moveTo }),
    ...(structural ? [
      { id: 'btn-insert-before', label: 'Insert cell before', onSelect: () => run('insertCell', caret % N) },
      { id: 'btn-insert-after', label: 'Insert cell after', onSelect: () => run('insertCell', caret % N + 1) },
      { id: 'btn-delete-cell', label: 'Delete cell', hint: 'Del', onSelect: () => run('deleteCell', caret % N) },
    ] : []),
  ];

  return (
    <PhaseLayout phase={phase} settings={settings} fillClues={fillClues} header={header}
      toggle={(
        <Latch id="cut-toggle" label="Lap" value={lapNow}
          options={[1, 2].map(n => ({ value: n, text: `Lap ${n}`, led: n === 1 ? 'ch1' : 'ch2', attrs: { 'data-cut': n } }))}
          onChange={n => { if (n !== lapNow) moveTo({ caret: twin(model, caret), composing: false }); focus(); }} />
      )}
      tools={(
        <>
          <label class="shape">Shape{' '}
            <ShapeSelect id="shape-select" N={N} value={model.shape ?? ''} keepUnfit onChange={shape => exec('setShape', [shape || null])} />
          </label>
          <span class="tools">
            <CellMenu items={cellItems(true)} focus={focus} />
          </span>
        </>
      )}
      clueTools={<span class="tools"><CellMenu items={cellItems(false)} focus={focus} /></span>}
      board={(
        <BoardFrame channel={lapNow} focus={focus} inputProps={inputProps}>
          <RingBoard ring={model.ring} shape={model.shape} caret={caret} composing={composing} starts={model.cut.starts} circles={circleSet}
            onCellClick={k => {
              const focused = boardHasFocus();
              moveTo(k === caret % N && focused ? { caret: twin(model, caret), composing: false } : { caret: (lapNow - 1) * N + k, composing: false });
            }}
            onGapClick={k => {
              const p = (lapNow - 1) * N + k;
              const r = breakAtCaret(model, p);
              if (r.message) say(r.message); else exec('toggleBreak', [r.index]);
            }} />
        </BoardFrame>
      )}
      keys={(
        <KeyStrip
          essential={<><kbd>A–Z</kbd> fill · <kbd>|</kbd> split/join · <kbd>.</kbd> lap · <kbd>Tab</kbd> next entry · <kbd>Enter</kbd> multi-letter cell</>}
          full={<KeyList intro="Click a cell, then:"
            notes="Clicking the selected cell again also switches lap. The ring is one set of cells read twice, so a letter typed on either lap is the same cell."
            items={[
              [<kbd>A–Z</kbd>, 'fill and move on'],
              [<kbd>Space</kbd>, 'clear the cell and move on'],
              [<kbd>Enter</kbd>, 'multi-letter cell'],
              [<kbd>|</kbd>, 'split or join at the cursor'],
              [<kbd>.</kbd>, 'switch lap'],
              [<kbd>Tab</kbd>, 'next entry'],
              [<><kbd>←</kbd> <kbd>→</kbd></>, 'move'],
              [<kbd>Delete</kbd>, 'remove the cell'],
            ]} />} />
      )}
      checks={(
        <Checks items={[
          { id: 'meter-ring', ok: N >= 8 && N % 2 === 0, text: <><b>{N}</b> cells per lap — even, min 8</> },
          { id: 'meter-entries', ok: nEntries >= 3, text: <><b>{plural(nEntries, 'entry', 'entries')}</b> — min 3</> },
          ...(clashes.length > 0 ? [{ id: 'meter-shared', ok: false, text: <><b>{clashes.length}</b> {clashes.length === 1 ? 'cell starts' : 'cells start'} two entries</> }] : []),
        ]} />
      )}
      side={(
        <WordList lists={listTitled('Entries')} onSelect={j => select(j)} looseCount={model.orphans.length}
          onShowLoose={() => dispatch({ type: 'SET_VIEW', view: 'clues' })} />
      )}
      clues={(
        <ClueLists lists={listTitled('Clues')} orphans={model.orphans} targets={targets}
          onAttach={(id, value) => exec('attachOrphan', [id, Number(value)])}
          onDiscard={id => exec('discardOrphan', [id])}
          onSelect={j => select(j)}
          onFocusClue={j => {
            if (entryAtPosition(model, caret) === j) moveTo({ composing: false });
            else select(j, { focusBoard: false });
          }}
          onClue={(j, text) => exec('setClue', [j, text], `clue:${model.cut.entries[j].id}`)}
          onDisplay={(j, text) => exec('setDisplayText', [j, text], `display:${model.cut.entries[j].id}`)} />
      )} />
  );
}
