// The studio's two latching controls. They are components because the look depends on
// their structure (several elements, LEDs, ARIA wiring); a plain button is a `.btn`.

// A two-position toggle: a labeled group of keys, the selected one latched and lit.
// onChange runs on every click, even on the pressed key, because the editors refocus the
// board then. `attrs` carries each key's data-* attributes.
export function Latch({ id, label, options, value, onChange, disabled = false, describedBy }) {
  return (
    <span id={id} class="latch" role="group" aria-label={label} aria-describedby={describedBy}>
      {options.map(o => {
        const pressed = o.value === value;
        return (
          <button type="button" key={o.value} class="btn latch-btn" data-value={o.value}
            aria-pressed={pressed} disabled={disabled} onClick={() => onChange(o.value)} {...o.attrs}>
            <span class={`led ${o.led}${pressed ? ' lit' : ''}`} aria-hidden="true"></span>{o.text}
          </button>
        );
      })}
    </span>
  );
}

// An on/off setting as one key with an amber LED. The checkbox stays native, laid
// invisibly over the whole key (CSS), so a click anywhere toggles it, ids and
// assistive tech keep working, and a disabled or locked key can't be toggled.
export function LatchKey({ id, checked, onChange, disabled = false, children, describedBy }) {
  return (
    <label class={'btn latch-key' + (checked ? ' on' : '') + (disabled ? ' off' : '')}>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} aria-describedby={describedBy}
        onChange={e => onChange(e.currentTarget.checked)} />
      <span class={'led amber' + (checked ? ' lit' : '')} aria-hidden="true"></span>{children}
    </label>
  );
}
