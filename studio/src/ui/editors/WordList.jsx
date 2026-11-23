import { useRef } from 'preact/hooks';
import { ChannelList, channelOf } from './ChannelList.jsx';
import { LooseCluesNotice } from './LooseCluesNotice.jsx';
import { useKeepRowsInView } from './useKeepRowsInView.js';

// The Board phase's word list: one line per entry, its place and its answer. Give it the
// lists the editor builds once (the Clues phase's ClueList renders the same description):
//   list: { cutName, title, rowName, rows } or { …, groups: [{ group, g, heading, rows }] }
//   row:  { id, j, label, answer, active, crossing, clash?, n?, attrs? }
// `active` is the entry at the caret, `crossing` the other direction's entry through it.
// onSelect(j, ctx): ctx is `{ cutName }`, plus the group's fields for a grouped list, so
// one handler can tell the lists apart.
// looseCount and onShowLoose: the loose-clue notice drawn directly above the lists, which
// the column scrolls up to when it appears; its button shows the Clues phase.
export function WordList({ lists, onSelect, looseCount = 0, onShowLoose }) {
  const root = useRef(null);
  useKeepRowsInView(root, lists, 'word-row', looseCount);
  return (
    <>
      <LooseCluesNotice count={looseCount} onShow={onShowLoose} />
      <div id="word-list" ref={root}>
        {lists.map((list, i) => (
          <ChannelList key={list.cutName} list={list} channel={channelOf(i, lists.length)}
            renderRow={(row, ctx) => (
              <li class={'word-row' + (row.active ? ' on' : '') + (row.crossing ? ' crossing' : '')} key={row.id ?? row.j}
                data-cut={list.cutName} data-entry={row.j} {...row.attrs}>
                <button type="button" class="word-pick" onClick={() => onSelect(row.j, ctx)}>
                  <span class={'word-label' + (row.clash ? ' clash' : '')}>{row.label}</span>
                  <span class="word-answer">{row.answer}</span>
                </button>
              </li>
            )} />
        ))}
      </div>
    </>
  );
}
