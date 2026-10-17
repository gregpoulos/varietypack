import sc from '../../model/kinds/snake-charmer.js';
import { formatCell } from '../../model/cells.js';
import { useBoardEditing } from './useBoardEditing.js';
import { displayStatusFor } from './displayStatus.js';
import { Meter } from './Meter.jsx';
import { SequenceField } from './SequenceField.jsx';
import { RingBoard } from './RingBoard.jsx';
import { ClueSection } from './ClueSection.jsx';
import { EntryPanel } from './EntryPanel.jsx';
import { ClueList } from './ClueList.jsx';
import { ShapeSelect } from './ShapeSelect.jsx';

const { commands, positionsOf, ringLabel, lapsLabel, twin, entryAtPosition, coincidentStarts, stepPosition, entryStartPosition, breakAtCaret } = sc;

// The structured Snake Charmer editor. caret is a position over the two laps (0..2N-1);
// the active lap is the caret's, so it isn't separate state. Keys: a–z fill and advance;
// Enter composes a multi-letter cell; Backspace/Delete; ←/→ (wrapping); Tab; | splits or
// joins at the caret; . switches lap; Ctrl/Cmd+Z undoes. Typing on either lap edits ring
// cell p % N, since the letter is the same on both laps.
export function SnakeCharmerEditor({ dispatch, model, clueView, setClueView, focusRef }) {
  const N = model.ring.length;
  const { ui, caret, moveTo, exec, run, say, focus, inputProps } = useBoardEditing({
    dispatch, model, commands, focusRef,
    positions: m => 2 * m.ring.length,
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

  function cardFor(j, { crossing: isCrossing = false } = {}) {
    const entry = model.cut.entries[j];
    const positions = positionsOf(model, j);
    const shown = entry.displayAnswer ?? '';
    return {
      cutName: 'inward', j, id: entry.id,
      name: `Entry ${j + 1}`,
      range: `${ringLabel(model, j)} · ${lapsLabel(model, j)}`,
      tiles: positions.map(p => {
        const k = p % N;
        return { i: k, key: p, number: k + 1, text: model.ring[k] === '' ? '·' : model.ring[k].toUpperCase(), circled: circleSet.has(k), here: isCrossing ? k === caret % N : p === caret };
      }),
      clue: entry.clue,
      display: shown,
      displayStatus: displayStatusFor(shown, positions.map(p => model.ring[p % N])),
    };
  }

  const here = entryAtPosition(model, caret);
  const across = entryAtPosition(model, twin(model, caret));
  const crossing = across === here
    ? { cutName: 'outward', note: 'This entry covers the cell on both laps.' }
    : { ...cardFor(across, { crossing: true }), cutName: 'outward' };

  const rows = model.cut.entries.map((entry, j) => ({
    id: entry.id, j, clue: entry.clue, label: `${j + 1}.`, answer: answerOf(j), active: j === here, clash: clashEntries.has(j),
  }));
  const select = (j) => { moveTo({ caret: model.cut.starts[j], composing: false }); focus(); };
  const step = (delta) => select((here + delta + nEntries) % nEntries);


  const targets = model.cut.entries.map((_, j) => ({ value: String(j), label: `Entry ${j + 1} · ${ringLabel(model, j)}` }));

  return (
    <div class="editor snake-editor">
      <div class="board-tools">
        <span id="lap-toggle" class="seg" role="group" aria-label="Lap">
          {[1, 2].map(n => (
            <button type="button" key={n} data-lap={n} class={`seg-btn ${n === 1 ? 'in' : 'out'}`} aria-pressed={n === lapNow}
              onClick={() => { if (n !== lapNow) moveTo({ caret: twin(model, caret), composing: false }); focus(); }}>Lap {n}</button>
          ))}
        </span>
        <label class="shape">Shape{' '}
          <ShapeSelect id="shape-select" N={N} value={model.shape ?? ''} keepUnfit onChange={shape => exec('setShape', [shape || null])} />
        </label>
      </div>
      <SequenceField cells={model.ring} label="All letters, from ring cell 1" onApply={cells => exec('setRing', [cells])} />
      <div class="board-tools">
        <span class="tools">
          <button type="button" id="btn-insert-cell" class="btn" onClick={() => run('insertCell', caret % N)}>Insert cell</button>
          <button type="button" id="btn-delete-cell" class="btn" onClick={() => run('deleteCell', caret % N)}>Delete cell</button>
          <button type="button" id="btn-circle" class={'btn' + (circleSet.has(caret % N) ? ' on' : '')} aria-pressed={circleSet.has(caret % N)}
            onClick={() => run('toggleCircle', caret % N)}>Circle</button>
        </span>
        <span class="meters">
          <Meter id="meter-ring" bad={N < 8 || N % 2 === 1}><b>{N}</b> cells per lap — even, min 8</Meter>
          <Meter id="meter-entries" bad={nEntries < 3}><b>{nEntries} {nEntries === 1 ? 'entry' : 'entries'}</b> — min 3</Meter>
          {clashes.length > 0 && <Meter id="meter-shared" bad><b>{clashes.length}</b> {clashes.length === 1 ? 'cell starts' : 'cells start'} two entries</Meter>}
        </span>
      </div>
      <div id="board" class={'board ' + (lapNow === 1 ? 'in' : 'out')} onClick={focus}>
        <input id="board-input" aria-label="Board input" {...inputProps} />
        <RingBoard ring={model.ring} shape={model.shape} caret={caret} composing={composing} starts={model.cut.starts} circles={circleSet}
          onCellClick={k => moveTo({ caret: (lapNow - 1) * N + k, composing: false })}
          onGapClick={k => {
            const p = (lapNow - 1) * N + k;
            const r = breakAtCaret(model, p);
            if (r.message) say(r.message); else exec('toggleBreak', [r.index]);
          }} />
      </div>
      <p class="keys">Click a cell, then: <kbd>A–Z</kbd> fill and move on · <kbd>Space</kbd> clear the cell and move on · <kbd>Enter</kbd> multi-letter cell · <kbd>|</kbd> split or join at the cursor · <kbd>.</kbd> switch lap · <kbd>Tab</kbd> next entry · <kbd>Delete</kbd> remove the cell. The ring is one set of cells read twice, so a letter typed on either lap is the same cell.</p>
      <ClueSection clueView={clueView} setClueView={setClueView} orphans={model.orphans} targets={targets}
        onAttach={(id, value) => exec('attachOrphan', [id, Number(value)])}
        onDiscard={id => exec('discardOrphan', [id])}>
        {clueView === 'selected' ? (
          <EntryPanel main={cardFor(here)} crossing={crossing}
            onPrev={() => step(-1)} onNext={() => step(1)}
            onCircle={k => exec('toggleCircle', [k])}
            onClue={(card, text) => exec('setClue', [card.j, text], `clue:${card.id}`)}
            onDisplay={(card, text) => exec('setDisplayAnswer', [card.j, text], `display:${card.id}`)} />
        ) : (
          <div class="clue-cols">
            <ClueList cutName="entries" title="Clues" rowName="entry" rows={rows} onSelect={select}
              onClue={(j, text) => exec('setClue', [j, text], `clue:${model.cut.entries[j].id}`)} />
          </div>
        )}
      </ClueSection>
    </div>
  );
}
