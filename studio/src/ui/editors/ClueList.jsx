import { useRef, useState } from 'preact/hooks';
import { AutoTextarea } from './AutoTextarea.jsx';
import { ChannelList, channelOf } from './ChannelList.jsx';
import { OrphanTray } from './OrphanTray.jsx';
import { useKeepRowsInView } from './useKeepRowsInView.js';

// The Clues phase's clues, one list per direction, written where they are read. Give each
// ClueList the same ListSpec the Board phase's WordList takes (see there), with the clue
// and, on the selected row only, the display text added to a row:
//   row: { id, j, label, answer, clue, active, crossing, clash?, n?, attrs?, display?, displayStatus? }
// A field's accessible name is the list's `rowName` (capitalized) and the row's number
// `n`, which is j + 1 unless the editor's `j` isn't an index (Crushword's is a slot key);
// a grouped list names a field by the group's heading and the row's label instead.
// `channel` (1, 2 or null) is the list's place among its siblings (see ChannelList).
// onSelect(j, ctx) is for a click on the row's place or answer. onFocusClue(j, ctx) is
// for a clue gaining focus: the editor moves the caret to that entry without taking focus
// from the field (its select's `focusBoard: false`), and leaves a caret already inside
// the entry where it is, so tabbing into a clue doesn't reset a mid-entry caret. ctx is
// `{ cutName }`, plus the group's fields for a grouped list, as WordList passes it, so
// one handler can serve every list.
//
// Only the selected row has any display-text control, and it sits on the answer line,
// ahead of the clue, so the browser's own Tab order walks clue to clue (one stop per
// entry) and Shift+Tab from a clue reaches that entry's display text first. The control
// is a quiet "+ display text" button until the author opens it (or the entry already has
// display text), so an option most entries never use costs a few muted words. Both the
// button and the field carry `data-display-text`, the one stop Shift+Tab lands on. The
// place and answer buttons are out of the Tab order for the same reason.
export function ClueList({ list, channel = null, onSelect, onFocusClue, onClue, onDisplay }) {
  const { cutName, title, rowName = title, groups } = list;
  // The entry whose display-text field stays open even while empty, as the list's name,
  // a grouped list's heading, and the row's id (or `j` when a row has none). Set while
  // the field has focus and cleared on blur, so emptying it mid-edit keeps it open, and
  // an entry emptied some other way (an undo) shows the button again.
  const [opened, setOpened] = useState(null);
  const focusField = useRef(false);
  function renderRow(row, ctx) {
    const name = `${groups ? ctx.heading : rowName} ${groups ? row.label : row.n ?? row.j + 1}`;
    const key = `${cutName}:${groups ? `${ctx.heading}:` : ''}${row.id ?? row.j}`;
    return (
      <li class={'clue-row' + (row.active ? ' on' : '') + (row.crossing ? ' crossing' : '')} key={row.id ?? row.j}
        data-cut={cutName} data-entry={row.j} {...row.attrs}>
        <div class="pick">
          <button type="button" tabindex={-1} class={'clue-label' + (row.clash ? ' clash' : '')} onClick={() => onSelect(row.j, ctx)}>{row.label}</button>
          <button type="button" tabindex={-1} class="clue-answer" onClick={() => onSelect(row.j, ctx)}>{row.answer}</button>
          {row.active && onDisplay && (row.display || opened === key ? (
            <span class="display-text">
              <input id="entry-display" data-display-text aria-label={`Display text for ${name}`}
                aria-describedby={row.displayStatus ? 'entry-display-status' : undefined}
                value={row.display} placeholder="With spaces or hyphens, for display" spellcheck={false} autocomplete="off"
                ref={el => { if (el && focusField.current) { focusField.current = false; el.focus(); } }}
                onFocus={() => setOpened(key)} onInput={e => onDisplay(row.j, e.currentTarget.value, ctx)}
                onBlur={() => setOpened(null)} />
              {row.displayStatus && <small id="entry-display-status" class="warn">{row.displayStatus.text}</small>}
            </span>
          ) : (
            <button type="button" class="display-add" data-display-text title="Optional display text: write the answer the way it's normally spelled, with spaces and punctuation (JOANOFARC → JOAN OF ARC). It only changes how the answer reads in the saved YAML."
              onClick={() => { focusField.current = true; setOpened(key); }}>+ display text</button>
          ))}
        </div>
        <AutoTextarea class="clue-input" value={row.clue} aria-label={`Clue for ${name}`} placeholder="Write a clue"
          onFocus={() => onFocusClue?.(row.j, ctx)} onInput={e => onClue(row.j, e.currentTarget.value, ctx)} />
      </li>
    );
  }
  return <ChannelList list={list} channel={channel} renderRow={renderRow} />;
}

// The Clues phase's clue column: the loose-clue tray, then one ClueList per list, in
// columns. The four handlers are ClueList's.
export function ClueLists({ lists, orphans, targets, onAttach, onDiscard, orphanNote, ...handlers }) {
  const root = useRef(null);
  useKeepRowsInView(root, lists, 'clue-row', orphans.length);
  return (
    <div id="clue-lists" ref={root}>
      <OrphanTray orphans={orphans} targets={targets} onAttach={onAttach} onDiscard={onDiscard} note={orphanNote} />
      {lists.map((list, i) => <ClueList key={list.cutName} list={list} channel={channelOf(i, lists.length)} {...handlers} />)}
    </div>
  );
}
