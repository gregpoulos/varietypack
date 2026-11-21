import { useEffect, useRef } from 'preact/hooks';
import mb from '../../model/kinds/marching-bands.js';
import { formatCell } from '../../model/cells.js';
import geometry from './gridGeometry.js';
import { useBoardEditing } from './useBoardEditing.js';
import { keepBoardFocus, boardHasFocus } from './useBoardInput.js';
import { displayStatusFor } from './displayStatus.js';
import { GridBoard } from './GridBoard.jsx';
import { ClueLists } from './ClueList.jsx';
import { plural } from './plural.js';
import { PhaseLayout } from './PhaseLayout.jsx';
import { WordList } from './WordList.jsx';
import { Checks } from './Checks.jsx';
import { KeyStrip, KeyList } from './KeyStrip.jsx';
import { LooseCluesNotice } from './LooseCluesNotice.jsx';
import { Latch } from '../Latch.jsx';
import { CellMenu } from './CellMenu.jsx';

const { commands, rowOf, colOf, entryOfCell, entryIds, pathIds, isCenter, groupName, shortLabel, entryName,
  advance, stepBack, moveSpatial, stepGroup, breakAtCaret, FIRST_ENTRY_MESSAGE, readsBackward } = mb;
const { CELL, cellCenter, boundary } = geometry;
const GROUPS = ['rows', 'bands'];
const other = (m) => (m === 'rows' ? 'bands' : 'rows');
const cls = (group) => (group === 'rows' ? 'c1' : 'c2');

// The structured Marching Bands editor. The caret is a 0-based flat cell index (id - 1)
// and is never the center block; `mode` is 'rows' or 'bands'. Keys: a–z fill and advance
// along the row or clockwise around the band; arrows move on the grid; Enter composes a
// multi-letter cell; | splits or joins before the caret; . switches mode; Tab steps to
// the next row or band.
export function MarchingBandsEditor({ dispatch, model, phase, focusRef, settings, fillClues, header }) {
  const N = model.size;
  const { ui, caret: heldCaret, moveTo, exec, run, say, focus, inputProps } = useBoardEditing({
    dispatch, model, commands, focusRef,
    positions: m => m.size * m.size,
    initialUi: { mode: 'rows' },
    nav: {
      cellOf: (m, u) => u.caret + 1,
      cell: (m, id) => m.cells[id - 1],
      next: (m, u) => { const id = advance(m, u.mode, u.caret + 1, 1); return id === null ? u.caret : id - 1; },
      back: (m, u) => { const id = stepBack(m, u.mode, u.caret + 1); return id === null ? u.caret : id - 1; },   // never wraps: Backspace at a band's start would erase its last cell
      arrow: (m, u, d) => { const id = moveSpatial(m, u.caret + 1, 0, d); return id === null ? u.caret : id - 1; },
      vertical: (m, u, d) => { const id = moveSpatial(m, u.caret + 1, d, 0); return id === null ? u.caret : id - 1; },
      tab: (m, u, back) => { const id = stepGroup(m, u.mode, u.caret + 1, back ? -1 : 1); return id === null ? null : id - 1; },
      breakAt: (m, u) => breakAtCaret(m, u.mode, u.caret + 1),
      delete: (m, u) => ({ command: ['setCell', [u.caret + 1, '']] }),
      dot: (m, u) => ({ mode: other(u.mode) }),
      focusTarget: (t, m) => {
        if (t.cells) return { caret: t.cells[0] - 1 };
        if (t.group) return { caret: entryIds(m, t.group, t.g, t.entry)[0] - 1, mode: t.group };
        return null;
      },
    },
  });
  const { mode, composing } = ui;

  // A resize (made in the settings, or undone) changes N, which changes what a flat index
  // means, and the held caret can even be the new center block. So the caret is repaired
  // at render, never left to an effect (that would draw one frame with an impossible
  // cell): the same row and column if that cell is still on the board, otherwise the
  // first cell.
  const last = useRef({ N, caret: heldCaret });
  let caret = heldCaret;
  const resized = last.current.N !== N;
  if (resized) {
    const { N: n1, caret: old } = last.current;
    const r = Math.floor(old / n1), c = old % n1;
    caret = r < N && c < N && !isCenter(N, r * N + c + 1) ? r * N + c : 0;
  } else if (isCenter(N, caret + 1)) {
    caret = 0;
  }
  useEffect(() => {
    if (caret !== heldCaret) moveTo({ caret, composing: false });
    last.current = { N, caret };
  });
  const id = caret + 1;

  const circleSet = new Set(model.circles);
  const rc = (cellId) => ({ r: rowOf(N, cellId), c: colOf(N, cellId) });
  const act = entryOfCell(model, mode, id);
  const cross = entryOfCell(model, other(mode), id);

  // focusBoard: false is for a clue field gaining focus in the Clues phase, which must
  // keep it so the keys typed there stay in the field.
  const select = (group, g, j, { focusBoard = true } = {}) => {
    moveTo({ caret: entryIds(model, group, g, j)[0] - 1, mode: group, composing: false });
    if (focusBoard) focus();
  };
  const allEntries = (group) => model[group].flatMap((cut, g) => cut.entries.map((_, j) => ({ g, j })));
  const answerOf = (group, g, j) => entryIds(model, group, g, j).map(i => formatCell(model.cells[i - 1])).join('');

  // ── the board ────────────────────────────────────────────────────────────
  const paths = new Map();   // one path per row or band per render, not one per edge
  const pathOf = (group, g) => {
    const k = `${group}:${g}`;
    if (!paths.has(k)) paths.set(k, pathIds(model, group, g));
    return paths.get(k);
  };
  const edgeOf = (group, g, i) => {
    const path = pathOf(group, g);
    return boundary(rc(path[(i - 1 + path.length) % path.length]), rc(path[i]));
  };
  const key = (e) => `${e.x1},${e.y1},${e.x2},${e.y2}`;
  function underlay() {
    const loops = model[mode].flatMap((cut, g) => cut.entries.map((_, j) => {
      const pts = entryIds(model, mode, g, j).map(i => { const { x, y } = cellCenter(rc(i).r, rc(i).c); return `${x},${y}`; });
      if (pts.length === 1) pts.push(pts[0]);                 // one cell: repeat the point so it draws as a dot
      return <polyline key={`${g}:${j}`} class={`loop shade-${j % 2}` + (g === act.g && j === act.j ? ' active' : '')}
        data-group={mode} data-g={g} data-entry={j} stroke-width={CELL * 0.66} points={pts.join(' ')} />;
    }));
    // Every split of both modes; where a row split and a band split share a boundary,
    // draw them side by side.
    const splits = GROUPS.flatMap(group => model[group].flatMap((cut, g) =>
      cut.starts.filter(s => !(s === 0 && group === 'rows')).map(s => ({ group, g, s, e: edgeOf(group, g, s) }))));
    const keys = (group) => new Set(splits.filter(x => x.group === group).map(x => key(x.e)));
    const shared = new Set([...keys('rows')].filter(k => keys('bands').has(k)));
    const lines = [other(mode), mode].flatMap(group => splits.filter(x => x.group === group).map(({ g, s, e }) => {
      const off = shared.has(key(e)) ? (group === 'rows' ? -2.6 : 2.6) : 0;
      const dx = e.x1 === e.x2 ? off : 0, dy = e.x1 === e.x2 ? 0 : off;
      return <line key={`${group}:${g}:${s}`} class={`split ${cls(group)}` + (group === mode ? '' : ' weak')} data-group={group} data-g={g} data-start={s}
        x1={e.x1 + dx} y1={e.y1 + dy} x2={e.x2 + dx} y2={e.y2 + dy} />;
    }));
    // Where each current-mode entry starts: its label, as in the clue list (1a, 1b … Aa,
    // Ab …).
    const labels = model[mode].flatMap((cut, g) => {
      const path = pathIds(model, mode, g);
      return cut.starts.map((s, j) => {
        const { r, c } = rc(path[s]);
        const o = geometry.cellOrigin(r, c);
        return <text key={`${g}:${j}`} class="entry-label" x={o.x + 3} y={o.y + 10}>{shortLabel(mode, g, j)}</text>;
      });
    });
    return <>{loops}{lines}{labels}</>;
  }
  function overlay() {
    const hits = [];
    model[mode].forEach((cut, g) => {
      const L = pathOf(mode, g).length;
      for (let i = mode === 'rows' ? 1 : 0; i < L; i++) {
        const e = edgeOf(mode, g, i);
        hits.push(
          <line key={`${g}:${i}`} class="split-hit" data-gap={`${mode}:${g}:${i}`} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
            onClick={() => {
              if (i === 0) say(FIRST_ENTRY_MESSAGE.bands);
              else exec('toggleBreak', [mode, g, i]);
            }}>
            <title>Split or join {groupName(mode, g).toLowerCase()} here</title>
          </line>,
        );
      }
    });
    return <>{hits}</>;
  }
  function cellAt(r, c) {
    const cellId = r * N + c + 1;
    return isCenter(N, cellId)
      ? { block: true, content: '', circled: false }
      : { block: false, content: model.cells[cellId - 1], circled: circleSet.has(cellId) };
  }
  function onCellClick(r, c) {
    const next = r * N + c;
    const focused = boardHasFocus();
    moveTo(next === caret && focused ? { mode: other(mode), composing: false } : { caret: next, composing: false });
  }

  // ── clues ────────────────────────────────────────────────────────────────
  // The selected row also carries the spaced answer and its status (ClueList shows them
  // on that row only).
  const groupsFor = (group) => model[group].map((cut, g) => ({
    group, g, heading: groupName(group, g),
    rows: cut.entries.map((entry, j) => {
      const row = {
        id: entry.id, j, clue: entry.clue, label: shortLabel(group, g, j), answer: answerOf(group, g, j),
        active: group === mode && act.g === g && act.j === j,
        crossing: group !== mode && cross.g === g && cross.j === j,
      };
      if (row.active) {
        const ids = entryIds(model, group, g, j);
        row.display = entry.displayAnswer ?? '';
        row.displayStatus = displayStatusFor(row.display, ids.map(i => model.cells[i - 1]), readsBackward(model, group, g, ids));
      }
      return row;
    }),
  }));
  const targets = GROUPS.flatMap(group => allEntries(group).map(({ g, j }) => ({
    value: `${group}:${g}:${j}`, label: `${entryName(group, g, j)} · ${answerOf(group, g, j)}`,
  })));
  const count = (group) => model[group].reduce((n, cut) => n + cut.entries.length, 0);

  const cellItems = [
    { id: 'btn-circle', label: 'Toggle circle', checked: circleSet.has(id), onSelect: () => run('toggleCircle', id) },
    { id: 'btn-rebus', label: composing ? 'Leave rebus mode' : 'Enter rebus mode', hint: 'Enter', checked: !!composing, onSelect: () => moveTo({ composing: !composing }) },
  ];
  const lists = GROUPS.map(group => ({ cutName: group, title: group === 'rows' ? 'Rows' : 'Bands', rowName: group === 'rows' ? 'Row' : 'Band', groups: groupsFor(group) }));

  return (
    <PhaseLayout phase={phase} settings={settings} fillClues={fillClues} header={header}
      toggle={(
        <Latch id="cut-toggle" label="Mode" value={mode}
          options={GROUPS.map(group => ({ value: group, text: group === 'rows' ? 'Rows' : 'Bands', led: group === 'rows' ? 'ch1' : 'ch2', attrs: { 'data-cut': group } }))}
          onChange={group => { moveTo({ mode: group, composing: false }); focus(); }} />
      )}
      tools={(
        <span class="tools">
          <CellMenu items={cellItems} focus={focus} />
        </span>
      )}
      clueTools={<span class="tools"><CellMenu items={cellItems} focus={focus} /></span>}
      board={(
        <div id="board" class={'board ' + (mode === 'rows' ? 'in' : 'out')} onClick={focus} onMouseDown={keepBoardFocus}>
          <input id="board-input" aria-label="Board input" {...inputProps} />
          <GridBoard rows={N} cols={N} cellAt={cellAt} caret={rc(id)} composing={composing} rowNumbers
            underlay={underlay()} overlay={overlay()} onCellClick={onCellClick} />
        </div>
      )}
      keys={(
        <KeyStrip
          essential={<><kbd>A–Z</kbd> fill · <kbd>|</kbd> split/join · <kbd>.</kbd> rows/bands · <kbd>Tab</kbd> next row or band · <kbd>Enter</kbd> multi-letter cell</>}
          full={<KeyList intro="Click a cell, then:"
            items={[
              [<kbd>A–Z</kbd>, 'fill and move on, along the row or clockwise around the band'],
              [<kbd>Space</kbd>, 'clear the cell and move on'],
              [<kbd>Enter</kbd>, 'multi-letter cell'],
              [<kbd>|</kbd>, 'split or join before the cursor'],
              [<kbd>.</kbd>, 'switch between rows and bands (or click the cell again)'],
              [<kbd>Tab</kbd>, 'next row or band'],
              [<kbd>Arrows</kbd>, 'move on the grid'],
            ]} />} />
      )}
      checks={(
        <Checks items={[
          { id: 'meter-size', text: <b>{N} × {N}</b> },
          { id: 'meter-rows', text: <b>{plural(count('rows'), 'row entry', 'row entries')}</b> },
          { id: 'meter-bands', text: <b>{plural(count('bands'), 'band entry', 'band entries')}</b> },
        ]} />
      )}
      side={(
        <>
          <LooseCluesNotice count={model.orphans.length} onShow={() => dispatch({ type: 'SET_VIEW', view: 'clues' })} />
          <WordList lists={lists} onSelect={(j, ctx) => select(ctx.group, ctx.g, j)} looseCount={model.orphans.length} />
        </>
      )}
      clues={(
        <ClueLists lists={lists} orphans={model.orphans} targets={targets}
          onAttach={(orphanId, value) => { const [group, g, j] = value.split(':'); exec('attachOrphan', [orphanId, group, Number(g), Number(j)]); }}
          onDiscard={orphanId => exec('discardOrphan', [orphanId])}
          onSelect={(j, ctx) => select(ctx.group, ctx.g, j)}
          onFocusClue={(j, ctx) => {
            // A caret already inside this entry stays put, so tabbing into its clue
            // doesn't reset a mid-entry caret.
            if (ctx.group === mode && ctx.g === act.g && j === act.j) moveTo({ composing: false });
            else select(ctx.group, ctx.g, j, { focusBoard: false });
          }}
          onClue={(j, text, ctx) => exec('setClue', [ctx.group, ctx.g, j, text], `clue:${model[ctx.group][ctx.g].entries[j].id}`)}
          onDisplay={(j, text, ctx) => exec('setDisplayAnswer', [ctx.group, ctx.g, j, text], `display:${model[ctx.group][ctx.g].entries[j].id}`)} />
      )} />
  );
}
