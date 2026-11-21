import { useRef } from 'preact/hooks';
import { AutoTextarea } from './AutoTextarea.jsx';
import { ChannelList, channelOf } from './ChannelList.jsx';
import { OrphanTray } from './OrphanTray.jsx';
import { useKeepRowsInView } from './useKeepRowsInView.js';

// The Clues phase's clues, one list per direction, written where they are read. Give each
// ClueList the same ListSpec the Board phase's WordList takes (see there), with the clue
// and, on the selected row only, the spaced answer added to a row:
//   row: { id, j, label, answer, clue, active, crossing, clash?, n?, attrs?, display?, displayStatus? }
// A field's accessible name is the list's `rowName` (capitalized) and the row's number
// `n`, which is j + 1 unless the editor's `j` isn't an index (Crushword's is a slot key);
// a grouped list names a field by the group's heading and the row's label instead.
// `channel` (1, 2 or null) is the list's place among its siblings (see ChannelList).
// onSelect(j, ctx) is for a click on the row's place or answer. onFocusClue(j, ctx) is
// for a clue gaining focus, where the editor moves the caret without taking focus from
// the field. ctx is `{ cutName }`, plus the group's fields for a grouped list, as
// WordList passes it, so one handler can serve every list.
//
// Only the selected row has a spaced-answer field, and it sits on the answer line, ahead
// of the clue, so the browser's own Tab order walks clue to clue (one stop per entry) and
// Shift+Tab from a clue reaches that entry's spaced answer first. The place and answer
// buttons are out of the Tab order for the same reason.
export function ClueList({ list, channel = null, onSelect, onFocusClue, onClue, onDisplay }) {
  const { cutName, title, rowName = title, groups } = list;
  function renderRow(row, ctx) {
    const name = `${groups ? ctx.heading : rowName} ${groups ? row.label : row.n ?? row.j + 1}`;
    return (
      <li class={'clue-row' + (row.active ? ' on' : '') + (row.crossing ? ' crossing' : '')} key={row.id ?? row.j}
        data-cut={cutName} data-entry={row.j} {...row.attrs}>
        <div class="pick">
          <button type="button" tabindex={-1} class={'clue-label' + (row.clash ? ' clash' : '')} onClick={() => onSelect(row.j, ctx)}>{row.label}</button>
          <button type="button" tabindex={-1} class="clue-answer" onClick={() => onSelect(row.j, ctx)}>{row.answer}</button>
          {row.active && onDisplay && (
            <span class="spaced">
              <label for="entry-display">spaced as</label>
              <input id="entry-display" aria-label={`Spaced answer for ${name}`} aria-describedby="entry-display-status" value={row.display}
                spellcheck={false} autocomplete="off" onInput={e => onDisplay(row.j, e.currentTarget.value, ctx)} />
              <small id="entry-display-status" class={row.displayStatus.warn ? 'warn' : ''}>{row.displayStatus.text}</small>
            </span>
          )}
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
