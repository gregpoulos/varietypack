// The frame a Clues-phase ClueList and a Board-phase WordList share: the section, the
// channel head (LED, CH tag, name, entry count) and the paper sheet of rows. Each list
// passes its own row renderer.
//   list: a ListSpec { cutName, title, rows } or { …, groups: [{ group, g, heading, rows }] }
//   channel: 1, 2, or null for a single list, which shows no CH tag (there is no second
//     channel to tell it from) and takes channel 1's color
//   renderRow(row, ctx): ctx is `{ cutName }`, plus the group's fields for a grouped list
// A list's channel among its siblings: 1 or 2, or null for a single list.
export const channelOf = (i, count) => (count > 1 ? i + 1 : null);

export function ChannelList({ list, channel, renderRow }) {
  const { cutName, title, rows, groups } = list;
  const ch = channel ?? 1;
  const all = groups ? groups.flatMap(g => g.rows) : rows;
  const count = all.length;
  return (
    <section class={`list ${cutName} ch${ch}`}>
      <h3 class="chan-head">
        <span class={`led ch${ch}${all.some(r => r.active) ? ' lit' : ''}`} aria-hidden="true"></span>
        {channel && <span class="ch-tag">CH {channel}</span>}
        <span class="chan-name">{title}</span>
        <span class="chan-count">{count} {count === 1 ? 'entry' : 'entries'}</span>
      </h3>
      <div class="paper sheet">
        {groups ? (
          <ol class="groups">
            {groups.map(grp => (
              <li class="clue-group" key={`${grp.group}:${grp.g}`} data-group={grp.group} data-g={grp.g}>
                <h4>{grp.heading}</h4>
                <ol>{grp.rows.map(row => renderRow(row, { ...grp, cutName }))}</ol>
              </li>
            ))}
          </ol>
        ) : <ol>{rows.map(row => renderRow(row, { cutName }))}</ol>}
      </div>
    </section>
  );
}
