import { useRef, useState } from 'preact/hooks';
import cw from '../../model/kinds/crushword.js';
import E from '../../model/crushwordEditing.js';
import { formatCell, formatSequence, parseSequence } from '../../model/cells.js';
import geometry from './gridGeometry.js';
import { useBoardInput, keepBoardFocus } from './useBoardInput.js';
import { useFocusTarget, handleUndoRedo } from './useBoardEditing.js';
import { Meter } from './Meter.jsx';
import { GridBoard } from './GridBoard.jsx';
import { LineField } from './LineField.jsx';
import { ClueSection } from './ClueSection.jsx';
import { EntryPanel } from './EntryPanel.jsx';
import { ClueList } from './ClueList.jsx';

const { CELL, cellOrigin } = geometry;
const DIRS = ['A', 'D'];
const OTHER = { A: 'D', D: 'A' };
const WORD = { A: 'Across', D: 'Down' };
const CUT = { A: 'across', D: 'down' };
const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "1 Across", as the solver's clue list names an entry (cw.slotName is "Across 1", for
// messages).
const entryName = (slot) => `${slot.num} ${WORD[slot.dir]}`;

const KEYS = (
  <p class="keys">Click a cell, then: <kbd>A–Z</kbd> fill it; at the letter limit, or on <kbd>Space</kbd>, move on · <kbd>Enter</kbd> move on keeping the letters · <kbd>#</kbd> block or open the cell · <kbd>.</kbd> switch Across/Down (or click the cell again) · <kbd>Tab</kbd> next entry · arrows move; <kbd>Alt</kbd> jumps to a cell’s edge · <kbd>Backspace</kbd> deletes.</p>
);

// The structured Crushword editor. The caret and cursor are UI state, not part of the
// undo history (the rules are in model/crushwordEditing.js, which node:test covers); the
// symmetry lock is kept on the doc (doc.ui.symmetric) but is not part of the model.
export function CrushwordEditor({ state, dispatch, model, clueView, setClueView, focusRef }) {
  const symmetric = state.doc.ui?.symmetric !== false;
  const [held, setHeld] = useState(() => E.initialUi(model));
  const [showChecks, setShowChecks] = useState(true);
  const ui = E.repair(model, held);               // after a resize or an undo the cell may be gone
  const { r, c } = ui;
  const isBlock = model.blocks[r * model.cols + c];

  // Handlers read the latest model and ui from here: a pasted string reaches onLetter
  // several times in one event, before Preact re-renders.
  const live = useRef(null);
  live.current = { model, ui, symmetric };
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
      const { model: m, ui: u, symmetric: sym } = live.current;
      if (handleUndoRedo(e, dispatch)) return;
      const res = E.pressKey(m, u, e, sym);
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
    if (next) { moveTo(next); focus(); }
  });

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
  const letterOf = (k) => { const [kr, kc] = parse(k); return model.cells[kr * model.cols + kc]; };
  const answerOf = (slot) => slot.cells.map(k => formatCell(letterOf(k))).join('');
  const entryId = (slot) => model.clues[slot.key].id;

  function onCellClick(cr, cc) {
    const focused = document.activeElement && document.activeElement.id === 'board-input';
    runResult(E.clickCell(live.current.model, live.current.ui, cr, cc, focused));
  }
  function setDir(d) {
    if (d !== ui.dir) runResult(E.pressKey(model, ui, { key: '.' }, symmetric));
    focus();
  }
  function select(slotKey) {
    const next = E.selectSlot(model, slotKey);
    if (next) { moveTo(next); focus(); }
  }
  function step(delta) {
    const list = all.filter(s => s.dir === ui.dir);
    const at = list.findIndex(s => s === main);
    select(list[(at + delta + list.length) % list.length].key);
  }
  function circle(cr, cc) { exec('toggleCircle', [cr, cc]); typeRun.current++; focus(); }

  // ── the board ────────────────────────────────────────────────────────────
  function cellAt(cr, cc) {
    const i = cr * model.cols + cc;
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

  // ── the Letters field ────────────────────────────────────────────────────
  function applyLetters(text) {
    const parsed = parseSequence(text);
    if (parsed.error) return parsed.error;
    if (parsed.cells.length !== main.len) return `${entryName(main)} has ${main.len} cells, and this has ${parsed.cells.length}.`;
    const over = parsed.cells.findIndex(x => x.length > cap);
    if (over >= 0) return `Cell ${over + 1} holds ${parsed.cells[over].length} letters; the limit is ${cap}.`;
    exec('setSlotCells', [main.key, parsed.cells]);
    typeRun.current++;
    return null;
  }

  // ── grid checks ──────────────────────────────────────────────────────────
  const chips = [];
  const chip = (cls, text, k) => chips.push(<span key={k} class={`check-chip ${cls}`}>{text}</span>);
  if (checks.missing.length) chip('bad', `No ${checks.missing.map(d => WORD[d].toLowerCase()).join(' or ')} entries`, 'missing');
  if (checks.noEntry.length) chip('bad', `${plural(checks.noEntry.length, 'cell is', 'cells are')} in no entry`, 'noentry');
  if (checks.overfull.length) chip('bad', `${plural(checks.overfull.length, 'cell holds', 'cells hold')} more than ${plural(cap, 'letter', 'letters')}`, 'over');
  if (checks.uncrossed.length) chip('warn', `${plural(checks.uncrossed.length, 'cell is', 'cells are')} crossed only once`, 'uncrossed');
  if (checks.short.length) chip('warn', `${checks.short.map(k => entryName(all.find(s => s.key === k))).join(', ')}: under ${cw.MIN_ANSWER_LETTERS} letters`, 'short');
  chip(checks.symmetric ? 'ok' : 'warn', checks.symmetric ? 'Symmetric' : 'Not symmetric', 'sym');
  chip(checks.connected ? 'ok' : 'warn', checks.connected ? 'Connected' : 'Has a separate part', 'conn');

  // ── clues ────────────────────────────────────────────────────────────────
  function cardFor(slot) {
    const cellsOf = slot.cells.map(letterOf);
    return {
      cutName: CUT[slot.dir], slotKey: slot.key, id: entryId(slot),
      name: entryName(slot),
      range: `${plural(slot.len, 'cell', 'cells')} · ${plural(cellsOf.join('').length, 'letter', 'letters')}`,
      tiles: slot.cells.map((k, i) => ({
        i: k, key: k, number: i === 0 ? slot.num : '',
        title: `Cell ${i + 1} of ${slot.len}: click to ${circleSet.has(k) ? 'remove the' : 'add a'} circle`,
        text: cellsOf[i] === '' ? '·' : cellsOf[i].toUpperCase(), circled: circleSet.has(k), here: k === key(r, c),
      })),
      clue: model.clues[slot.key].clue,
    };
  }
  const listRows = (dir) => all.filter(s => s.dir === dir).map(s => ({
    id: entryId(s), j: s.key, key: s.key, label: `${s.num}.`, answer: answerOf(s), clue: model.clues[s.key].clue,
    active: s === main, attrs: { 'data-dir': dir, 'data-key': s.key },
  }));
  const targets = all.map(s => ({ value: s.key, label: `${entryName(s)} · ${answerOf(s)}` }));
  const entries = all.length;
  const blocks = model.blocks.filter(Boolean).length;

  return (
    <div class="editor cw-editor">
      <div class="board-tools">
        <span id="direction-toggle" class="seg" role="group" aria-label="Direction">
          {DIRS.map(d => (
            <button type="button" key={d} data-dir={d} class={`seg-btn ${d === 'A' ? 'in' : 'out'}` + (d === ui.dir ? ' active' : '')}
              aria-pressed={d === ui.dir} onClick={() => setDir(d)}>{WORD[d]}</button>
          ))}
        </span>
        <span class="tools">
          <button type="button" id="btn-block" class="btn" onClick={() => { runResult(E.pressKey(model, ui, { key: '#' }, symmetric)); focus(); }}>Block <kbd>#</kbd></button>
          <button type="button" id="btn-circle" class={'btn' + (!isBlock && circleSet.has(key(r, c)) ? ' on' : '')} disabled={isBlock}
            aria-pressed={!isBlock && circleSet.has(key(r, c))} onClick={() => circle(r, c)}>Circle</button>
          <label class="check"><input type="checkbox" id="symmetry-lock" checked={symmetric}
            onChange={e => dispatch({ type: 'SET_UI', key: 'symmetric', value: e.currentTarget.checked, now: Date.now() })} /> Symmetry</label>
        </span>
        <span class="meters">
          <Meter id="meter-size"><b>{model.rows} × {model.cols}</b></Meter>
          <Meter id="meter-entries"><b>{entries}</b> {entries === 1 ? 'entry' : 'entries'}</Meter>
          <Meter id="meter-blocks"><b>{blocks}</b> {blocks === 1 ? 'block' : 'blocks'}</Meter>
        </span>
      </div>
      {main && (
        <LineField idPrefix="letters" label={`${entryName(main)} letters`} text={formatSequence(main.cells.map(letterOf))}
          hint="Type or paste the whole answer and press Enter. [SNO] is one multi-letter cell and _ an empty one." apply={applyLetters} />
      )}
      <div id="board" class={'board ' + (ui.dir === 'A' ? 'in' : 'out')} onClick={focus} onMouseDown={keepBoardFocus}>
        <input id="board-input" aria-label="Board input" {...inputProps} />
        <GridBoard rows={model.rows} cols={model.cols} cellAt={cellAt} caret={{ r, c }} composing={false}
          textCaret={isBlock ? undefined : ui.pos} underlay={underlay()} onCellClick={onCellClick} onBlockClick={onCellClick} />
      </div>
      <div id="grid-checks" class="checks">
        <h3>Grid checks</h3>
        <div class="chips">{chips}</div>
        <label class="check"><input type="checkbox" id="show-checks" checked={showChecks} onChange={e => setShowChecks(e.currentTarget.checked)} /> Show on grid</label>
      </div>
      {KEYS}
      <ClueSection clueView={clueView} setClueView={setClueView} orphans={model.orphans} targets={targets}
        orphanNote="their entries no longer start where they did"
        onAttach={(orphanId, slotKey) => exec('attachOrphan', [orphanId, slotKey])}
        onDiscard={orphanId => exec('discardOrphan', [orphanId])}>
        {clueView === 'selected' ? (
          main || cross ? (
            <EntryPanel main={cardFor(main || cross)}
              crossing={main && cross ? cardFor(cross) : { cutName: CUT[OTHER[(main || cross).dir]], note: `No ${CUT[OTHER[(main || cross).dir]]} entry crosses this cell.` }}
              onPrev={() => step(-1)} onNext={() => step(1)}
              onCircle={k => circle(...parse(k))}
              onClue={(card, text) => exec('setClue', [card.slotKey, text], `clue:${card.id}`)} />
          ) : (
            <p id="entry-panel-empty" class="hint">{isBlock ? 'Select an open cell to see its entries.' : 'This cell is in no entry. Block it or open a neighbor.'}</p>
          )
        ) : (
          <div class="clue-cols">
            {DIRS.map(d => (
              <ClueList key={d} cutName={CUT[d]} title={WORD[d]} rowName={CUT[d]} rows={listRows(d)}
                onSelect={(slotKey) => select(slotKey)}
                onClue={(slotKey, text) => exec('setClue', [slotKey, text], `clue:${model.clues[slotKey].id}`)} />
            ))}
          </div>
        )}
      </ClueSection>
    </div>
  );
}
