import { useRef, useState } from 'preact/hooks';
import cw from '../../model/kinds/crushword.js';
import E from '../../model/crushwordEditing.js';
import { formatCell } from '../../model/cells.js';
import geometry from './gridGeometry.js';
import { useBoardInput, boardHasFocus } from './useBoardInput.js';
import { useFocusTarget, handleUndoRedo } from './useBoardEditing.js';
import { GridBoard } from './GridBoard.jsx';
import { ClueLists } from './ClueList.jsx';
import { plural } from './plural.js';
import { PhaseLayout } from './PhaseLayout.jsx';
import { WordList } from './WordList.jsx';
import { Checks } from './Checks.jsx';
import { KeyStrip, KeyList } from './KeyStrip.jsx';
import { BoardFrame } from './BoardFrame.jsx';
import { Latch, LatchKey } from '../Latch.jsx';
import { CellMenu } from './CellMenu.jsx';

const { CELL, cellOrigin } = geometry;
const { cellKey: key, parseCell: parse, cellIndex } = cw;
const DIRS = ['A', 'D'];
const OTHER = { A: 'D', D: 'A' };
const WORD = { A: 'Across', D: 'Down' };
const CUT = { A: 'across', D: 'down' };
// "1 Across", as the solver's clue list names an entry (cw.slotName is "Across 1", for
// messages).
const entryName = (slot) => `${slot.num} ${WORD[slot.dir]}`;

// The structured Crushword editor. The caret and cursor are UI state, not part of the
// undo history (the rules are in model/crushwordEditing.js, which node:test covers).
export function CrushwordEditor({ dispatch, model, phase, focusRef, settings, fillClues, header }) {
  const [held, setHeld] = useState(() => E.initialUi(model));
  const [showChecks, setShowChecks] = useState(true);
  const ui = E.repair(model, held);               // after a resize or an undo the cell may be gone
  const { r, c } = ui;
  const isBlock = model.blocks[cellIndex(model, r, c)];

  // Handlers read the latest model and ui from here: a pasted string reaches onLetter
  // several times in one event, before Preact re-renders.
  const live = useRef(null);
  live.current = { model, ui };
  const typeRun = useRef(0);

  function exec(name, args, undoKey) {
    live.current.model = cw.commands[name](live.current.model, ...args);
    dispatch({ type: 'MODEL_COMMAND', name, args, key: undoKey, now: Date.now() });
  }
  // Letters typed in one go share an undo step; anything else (a click, an arrow) ends
  // the run.
  function moveTo(next, { typing = false } = {}) {
    if (!typing) typeRun.current++;
    live.current.ui = next;
    setHeld(next);
  }
  function runResult(res) {
    if (res.message) dispatch({ type: 'SHOW_MESSAGE', text: res.message });
    const typing = res.calls.some(call => call.typing);
    for (const call of res.calls) exec(call.name, call.args, call.typing ? `type:${typeRun.current}` : undefined);
    moveTo(res.ui, { typing });
  }

  const { inputProps, focus } = useBoardInput({
    onLetter(ch) {
      const { model: m, ui: u } = live.current;
      runResult(E.typeLetter(m, u, ch));
    },
    onKey(e) {
      const { model: m, ui: u } = live.current;
      if (handleUndoRedo(e, dispatch)) return;
      const res = E.pressKey(m, u, e);
      if (!res.handled) return;
      e.preventDefault();
      runResult(res);
    },
  });

  useFocusTarget(focusRef, (target) => {
    const { model: m, ui: u } = live.current;
    let next = null;
    if (target.cells) { const [tr, tc] = parse(target.cells[0]); next = E.clickCell(m, u, tr, tc, false).ui; }
    else if (target.key) next = E.selectSlot(m, target.key);
    if (!next) return false;
    moveTo(next);
    return true;
  }, focus);

  // ── derived ──────────────────────────────────────────────────────────────
  const all = cw.slots(model);
  const checks = cw.gridChecks(model);
  const cap = cw.capOf(model);
  const circleSet = new Set(model.circles);
  const numbers = {};
  for (const s of all) numbers[key(s.r, s.c)] = s.num;
  const slotAt = (dir) => (isBlock ? undefined : all.find(s => s.dir === dir && s.cells.includes(key(r, c))));
  const main = slotAt(ui.dir);
  const cross = slotAt(OTHER[ui.dir]);
  const activeCells = new Set(main ? main.cells : []);
  const overfull = new Set(checks.overfull);
  const letterOf = (k) => { const [kr, kc] = parse(k); return model.cells[cellIndex(model, kr, kc)]; };
  const answerOf = (slot) => slot.cells.map(k => formatCell(letterOf(k))).join('');
  const entryId = (slot) => model.clues[slot.key].id;

  function onCellClick(cr, cc) {
    const focused = boardHasFocus();
    runResult(E.clickCell(live.current.model, live.current.ui, cr, cc, focused));
  }
  function setDir(d) {
    if (d !== ui.dir) runResult(E.switchDirection(model, ui));
    focus();
  }
  function select(slotKey, { focusBoard = true } = {}) {
    const next = E.selectSlot(model, slotKey);
    if (!next) return;
    moveTo(next);
    if (focusBoard) focus();
  }
  // Not `run`: Crushword has its own cursor, so the typeRun bump ends the typing-undo
  // run, giving the circle its own undo step.
  function circle(cr, cc) { exec('toggleCircle', [cr, cc]); typeRun.current++; focus(); }

  // ── the board ────────────────────────────────────────────────────────────
  function cellAt(cr, cc) {
    const i = cellIndex(model, cr, cc);
    if (model.blocks[i]) return { block: true, content: '', circled: false };
    const k = key(cr, cc);
    return { block: false, content: model.cells[i], number: numbers[k], circled: circleSet.has(k), active: activeCells.has(k), over: overfull.has(k) };
  }
  function underlay() {
    if (!showChecks) return null;
    return (
      <>
        <defs>
          <pattern id="check-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line class="hatch-line" x1="0" y1="0" x2="0" y2="6" />
          </pattern>
        </defs>
        {checks.noEntry.map(k => {
          const { x, y } = cellOrigin(...parse(k));
          return <rect key={k} class="check-noentry" x={x} y={y} width={CELL} height={CELL} />;
        })}
        {checks.uncrossed.map(({ cell }) => {
          const { x, y } = cellOrigin(...parse(cell));
          return <path key={cell} class="check-uncrossed" d={`M ${x + CELL - 13} ${y} L ${x + CELL} ${y} L ${x + CELL} ${y + 13} Z`} />;
        })}
      </>
    );
  }

  // ── grid checks ──────────────────────────────────────────────────────────
  const gridItems = [];
  const gridItem = (id, text, state) => gridItems.push({ id: `grid-check-${id}`, text, ...state });
  const BAD = { ok: false }, WARN = { tone: 'warn' };
  if (checks.missing.length) gridItem('missing', `No ${checks.missing.map(d => WORD[d].toLowerCase()).join(' or ')} entries`, BAD);
  if (checks.noEntry.length) gridItem('noentry', `${plural(checks.noEntry.length, 'cell is', 'cells are')} in no entry`, BAD);
  if (checks.overfull.length) gridItem('overfull', `${plural(checks.overfull.length, 'cell holds', 'cells hold')} more than ${plural(cap, 'letter', 'letters')}`, BAD);
  if (checks.uncrossed.length) gridItem('uncrossed', `${plural(checks.uncrossed.length, 'cell is', 'cells are')} crossed only once`, WARN);
  if (checks.short.length) gridItem('short', `${checks.short.map(k => entryName(all.find(s => s.key === k))).join(', ')}: under ${cw.MIN_ANSWER_LETTERS} letters`, WARN);
  gridItem('sym', checks.symmetric ? 'Symmetric' : 'Not symmetric', checks.symmetric ? { ok: true } : WARN);
  gridItem('conn', checks.connected ? 'Connected' : 'Has a separate part', checks.connected ? { ok: true } : WARN);

  // ── clues ────────────────────────────────────────────────────────────────
  const listRows = (dir) => all.filter(s => s.dir === dir).map(s => ({
    id: entryId(s), j: s.key, n: s.num, label: `${s.num}.`, answer: answerOf(s), clue: model.clues[s.key].clue,
    active: s === main, crossing: s === cross, attrs: { 'data-dir': dir, 'data-key': s.key },
  }));
  const targets = all.map(s => ({ value: s.key, label: `${entryName(s)} · ${answerOf(s)}` }));
  const entries = all.length;
  const blocks = model.blocks.filter(Boolean).length;

  const cellItems = [
    { id: 'btn-circle', label: 'Toggle circle', checked: !isBlock && circleSet.has(key(r, c)), disabled: isBlock, onSelect: () => circle(r, c) },
    { id: 'btn-block', label: 'Toggle block', hint: '#', checked: isBlock, onSelect: () => runResult(E.toggleBlockAt(model, ui)) },
  ];
  const lists = DIRS.map(d => ({ cutName: CUT[d], title: WORD[d], rowName: WORD[d], rows: listRows(d) }));

  return (
    <PhaseLayout phase={phase} settings={settings} fillClues={fillClues} header={header}
      toggle={(
        <Latch id="direction-toggle" label="Direction" value={ui.dir}
          options={DIRS.map(d => ({ value: d, text: WORD[d], led: d === 'A' ? 'ch1' : 'ch2', attrs: { 'data-dir': d } }))}
          onChange={setDir} />
      )}
      tools={(
        <span class="tools">
          <CellMenu items={cellItems} focus={focus} />
        </span>
      )}
      clueTools={<span class="tools"><CellMenu items={cellItems} focus={focus} /></span>}
      board={(
        <BoardFrame channel={ui.dir === 'A' ? 1 : 2} focus={focus} inputProps={inputProps}>
          <GridBoard rows={model.rows} cols={model.cols} cellAt={cellAt} caret={{ r, c }} composing={false}
            textCaret={isBlock ? undefined : ui.pos} underlay={underlay()} onCellClick={onCellClick} onBlockClick={onCellClick} />
        </BoardFrame>
      )}
      keys={(
        <KeyStrip
          essential={<><kbd>A–Z</kbd> fill · <kbd>#</kbd> block · <kbd>.</kbd> direction · <kbd>Tab</kbd> next entry · <kbd>Enter</kbd> move on</>}
          full={<KeyList intro="Click a cell, then:"
            items={[
              [<kbd>A–Z</kbd>, 'fill it; at the letter limit, move on'],
              [<kbd>Space</kbd>, 'move on'],
              [<kbd>Enter</kbd>, 'move on keeping the letters'],
              [<kbd>#</kbd>, 'block or open the cell'],
              [<kbd>.</kbd>, 'switch Across/Down (or click the cell again)'],
              [<kbd>Tab</kbd>, 'next entry'],
              [<kbd>Arrows</kbd>, 'move; hold Alt to jump to a cell’s edge'],
              [<kbd>Backspace</kbd>, 'delete'],
            ]} />} />
      )}
      checks={(
        <Checks items={[
          { id: 'meter-size', text: <b>{model.rows} × {model.cols}</b> },
          { id: 'meter-entries', text: <b>{plural(entries, 'entry', 'entries')}</b> },
          { id: 'meter-blocks', text: <b>{plural(blocks, 'block', 'blocks')}</b> },
          ...gridItems,
        ]}>
          <div class="checks-foot">
            <LatchKey id="show-checks" checked={showChecks} onChange={setShowChecks}>Show on grid</LatchKey>
          </div>
        </Checks>
      )}
      side={(
        <WordList lists={lists} onSelect={slotKey => select(slotKey)} looseCount={model.orphans.length}
          onShowLoose={() => dispatch({ type: 'SET_VIEW', view: 'clues' })} />
      )}
      clues={(
        <ClueLists lists={lists} orphans={model.orphans} targets={targets}
          orphanNote="their entries no longer start where they did"
          onAttach={(orphanId, slotKey) => exec('attachOrphan', [orphanId, slotKey])}
          onDiscard={orphanId => exec('discardOrphan', [orphanId])}
          onSelect={slotKey => select(slotKey)}
          onFocusClue={slotKey => {
            // moveTo with the same ui still ends the typing run.
            if (main?.key === slotKey) moveTo(ui);
            else select(slotKey, { focusBoard: false });
          }}
          onClue={(slotKey, text) => exec('setClue', [slotKey, text], `clue:${model.clues[slotKey].id}`)} />
      )} />
  );
}
