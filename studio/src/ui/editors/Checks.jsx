// The Board phase's checks, one engraved row of readouts under the board. Each item shows
// its state as an LED (green met, red not met, amber warning) and as a mark beside it
// (✓ ✗ !), so it never depends on color alone. An item with neither is information only
// (a count), and the counts come first. `children` end the row (Crushword's Show on grid
// key).
//   items: [{ id, text, ok?, tone? }]   text may be markup; the id is the item's element id.
//   ok: true is met, false is not met; tone: 'warn' is a warning.
const LOOKS = {
  ok: { cls: ' ok', led: 'green', mark: '✓', note: ' (met)' },
  bad: { cls: ' bad', led: 'red', mark: '✗', note: ' (not met)' },
  warn: { cls: ' warn', led: 'amber', mark: '!', note: ' (warning)' },
};

export function Checks({ items, children }) {
  return (
    <section id="checks" class="check-list engraved" aria-labelledby="checks-legend">
      <h3 id="checks-legend" class="legend">Checks</h3>
      <ul>
        {items.map(({ id, text, ok, tone }) => {
          const look = ok === true ? LOOKS.ok : ok === false ? LOOKS.bad : tone === 'warn' ? LOOKS.warn : null;
          return (
            <li id={id} key={id} class={'check-item' + (look ? look.cls : '')}>
              {look && <span class={`led ${look.led} lit`} aria-hidden="true"></span>}
              {look && <span class="mark" aria-hidden="true">{look.mark}</span>}
              <span>{text}{look && <span class="sr-only">{look.note}</span>}</span>
            </li>
          );
        })}
      </ul>
      {children}
    </section>
  );
}
