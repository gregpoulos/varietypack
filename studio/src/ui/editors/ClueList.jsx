import { useLayoutEffect, useRef } from 'preact/hooks';

// A textarea that grows with its text, so long clues stay visible.
function AutoTextarea({ value, onInput, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} onInput={onInput} {...rest} />;
}

// The All clues view of one cut. Give it `rows` (a flat list), or `groups` for a cut made
// of groups, as Marching Bands' rows and bands are:
//   rows:   [{ id, j, label, answer, clue, active, clash?, attrs? }]   (attrs: extra data-* attributes for the row)
//   groups: [{ group, g, heading, rows }]   (each group is a .clue-group with its own rows)
// `clash` marks a number that more than one entry shares a start cell with.
export function ClueList({ cutName, title, rowName = title, rows, groups, onClue, onSelect }) {
  function renderRow(row, ctx) {
    return (
      <li class={'clue-row' + (row.active ? ' on' : '')} key={row.id ?? row.j} data-cut={cutName} data-entry={row.j} {...row.attrs}>
        <span class="pick">
          <button type="button" class={'clue-label' + (row.clash ? ' clash' : '')} onClick={() => onSelect(row.j, ctx)}>{row.label}</button>
          <button type="button" class="clue-answer" onClick={() => onSelect(row.j, ctx)}>{row.answer}</button>
        </span>
        <AutoTextarea class="clue-input" value={row.clue} aria-label={`Clue for ${ctx ? ctx.heading : rowName} ${ctx ? row.label : row.j + 1}`}
          onInput={e => onClue(row.j, e.currentTarget.value, ctx)} />
      </li>
    );
  }
  const count = groups ? groups.reduce((n, g) => n + g.rows.length, 0) : rows.length;
  return (
    <section class={`list ${cutName}`}>
      <h3><span class={`chip ${cutName}`}>{title}</span>{count} {count === 1 ? 'entry' : 'entries'}</h3>
      {groups ? (
        <ol class="groups">
          {groups.map(grp => (
            <li class="clue-group" key={`${grp.group}:${grp.g}`} data-group={grp.group} data-g={grp.g}>
              <h4>{grp.heading}</h4>
              <ol>{grp.rows.map(row => renderRow(row, grp))}</ol>
            </li>
          ))}
        </ol>
      ) : <ol>{rows.map(row => renderRow(row, null))}</ol>}
    </section>
  );
}
