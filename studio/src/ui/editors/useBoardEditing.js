import { useEffect, useRef, useState } from 'preact/hooks';
import { useBoardInput } from './useBoardInput.js';

// The caret, typing and undo plumbing every structured board editor shares: UI state that
// isn't in the undo history, commands that apply to the model before Preact re-renders,
// one undo step per run of typing, and the key map. A kind plugs in what is different
// about its board through `nav`.
//
//   commands: the kind module's commands.   positions(model): how many caret positions there are.
//   initialUi: extra UI state beyond { caret, composing } (Spiral's active cut).
//   nav (every callback gets the model and the live ui, `{ caret, composing, ...initialUi }`):
//     cellOf(model, ui)      the cell index the caret edits
//     cell(model, idx)       that cell's content
//     next(model, ui)        caret after a letter is typed
//     back(model, ui)        caret Backspace steps to from an empty cell
//     arrow(model, ui, d)    caret for ← (d = -1) and → (d = 1)
//     tab(model, ui, back)   caret for Tab / Shift+Tab
//     breakAt(model, ui)     { command: [name, ...args] } to toggle a break at the caret, or { message }
//     vertical(model, ui, d) optional: caret for ↑ (d = -1) and ↓ (d = 1); without it those keys are left alone
//     delete(model, ui)      optional: { command: [name, args] } for Delete; default removes the cell (deleteCell)
//     dot(model, ui)         the ui patch for "." (switch cut / lap)
//     remap(before, after, ui)  optional: the caret once a command has changed how many
//                            positions there are (insert/delete a cell); without it the caret is clamped
//     focusTarget(target, model, ui)  a ui patch for a diagnostics target the kind owns, or null
// Returns { ui, caret, moveTo, exec, run, say, focus, inputProps }.
export function useBoardEditing({ dispatch, model, commands, positions, initialUi = {}, nav, focusRef }) {
  const T = positions(model);
  const [raw, setUi] = useState({ caret: 0, composing: false, ...initialUi });
  const ui = { ...raw, caret: Math.min(raw.caret, T - 1) };

  // A pasted or filled string reaches onLetter several times in one event, before Preact
  // re-renders. `live` carries the latest model and cursor so each letter sees the last.
  const live = useRef(null);
  live.current = { model, ui };

  function exec(name, args = [], key) {
    const before = live.current.model;
    const after = commands[name](before, ...args);
    live.current.model = after;
    dispatch({ type: 'MODEL_COMMAND', name, args, key, now: Date.now() });
    if (nav.remap && positions(after) !== positions(before)) moveTo({ caret: nav.remap(before, after, live.current.ui) });
  }
  // Letters typed in one go share an undo step. Anything that isn't typing (a click, an
  // arrow key, Enter) ends the run, so one Ctrl+Z undoes one run, not the whole session.
  const typeRun = useRef(0);
  const typeKey = () => `type:${typeRun.current}`;
  function moveTo(patch, { typing = false } = {}) {
    if (!typing) typeRun.current++;
    live.current.ui = { ...live.current.ui, ...patch };
    setUi(u => ({ ...u, ...patch }));
  }
  const say = (text) => dispatch({ type: 'SHOW_MESSAGE', text });

  const { inputProps, focus } = useBoardInput({
    onLetter(ch) {
      const { model: m, ui: u } = live.current;
      const idx = nav.cellOf(m, u);
      if (u.composing) {
        exec('setCell', [idx, nav.cell(m, idx) + ch], typeKey());
      } else {
        exec('setCell', [idx, ch], typeKey());
        moveTo({ caret: nav.next(m, u) }, { typing: true });
      }
    },
    onKey(e) {
      const { model: m, ui: u } = live.current;
      const key = e.key;
      if (handleUndoRedo(e, dispatch)) return;
      const idx = nav.cellOf(m, u);
      let handled = true;
      if (key === 'Enter') {
        moveTo({ composing: !u.composing });
      } else if (key === 'Backspace') {
        if (u.composing) exec('setCell', [idx, nav.cell(m, idx).slice(0, -1)], typeKey());
        else if (nav.cell(m, idx) !== '') exec('setCell', [idx, '']);
        else {
          const back = nav.back(m, u);
          exec('setCell', [nav.cellOf(m, { ...u, caret: back }), '']);
          moveTo({ caret: back });
        }
      } else if (key === ' ') {
        // As on the puzzle page: Space clears the cell and moves on (composing ends with
        // the move).
        exec('setCell', [idx, '']);
        moveTo({ caret: nav.next(m, u), composing: false });
      } else if (key === 'Delete') {
        const r = nav.delete ? nav.delete(m, u) : { command: ['deleteCell', [idx]] };
        exec(...r.command);
        moveTo({ composing: false });
      } else if ((key === 'ArrowUp' || key === 'ArrowDown') && nav.vertical) {
        moveTo({ caret: nav.vertical(m, u, key === 'ArrowUp' ? -1 : 1), composing: false });
      } else if (key === 'ArrowLeft') {
        moveTo({ caret: nav.arrow(m, u, -1), composing: false });
      } else if (key === 'ArrowRight') {
        moveTo({ caret: nav.arrow(m, u, 1), composing: false });
      } else if (key === 'Tab') {
        moveTo({ caret: nav.tab(m, u, e.shiftKey), composing: false });
      } else if (key === '|') {
        const r = nav.breakAt(m, u);
        if (r.message) say(r.message);
        else exec(...r.command);
      } else if (key === '.') {
        moveTo({ ...nav.dot(m, u), composing: false });
      } else {
        handled = false;   // ArrowUp/Down, #, …: left to the browser
      }
      if (handled) e.preventDefault();
    },
  });

  useFocusTarget(focusRef, (target) => {
    const { model: m, ui: u } = live.current;
    const patch = nav.focusTarget(target, m, u);
    if (patch) { moveTo({ ...patch, composing: false }); focus(); }
  });

  const run = (name, ...args) => { exec(name, args); focus(); };

  return { ui, caret: ui.caret, moveTo, exec, run, say, focus, inputProps };
}

// Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z and Ctrl+Y redo. Any Ctrl/Cmd chord is swallowed
// (the board input has nothing else to do with one). → true when `e` was such a chord.
// Shared by every structured editor, whether or not it is built on useBoardEditing.
export function handleUndoRedo(e, dispatch) {
  if (!(e.ctrlKey || e.metaKey)) return false;
  e.preventDefault();
  const k = e.key.toLowerCase();
  dispatch({ type: (k === 'z' && e.shiftKey) || k === 'y' ? 'REDO' : 'UNDO', now: Date.now() });
  return true;
}

// The diagnostics list jumps into an editor through App's focusRef: header and orphan
// targets are the same for every kind, and `kindTarget(target)` handles the rest. Every
// structured editor calls this once.
export function useFocusTarget(focusRef, kindTarget) {
  useEffect(() => {
    focusRef.current = (target) => {
      if (target.header) { document.getElementById(`header-${target.header}`)?.focus(); return; }
      if (target.orphan) { document.querySelector(`.orphan[data-id="${target.orphan}"] select`)?.focus(); return; }
      kindTarget(target);
    };
    return () => { focusRef.current = null; };
  }, []);
}
