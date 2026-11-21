// A horizontal fader for a small whole-number setting: an engraved group holding a ladder
// of LEDs that light up to the value, a native range input styled as a fader cap in a
// slot (so keys, touch and screen readers come from the browser), and the numbers printed
// under the detents. The LEDs and the printed scale repeat the value for the eye only, so
// they are hidden from assistive technology.
//   id, label, min, max, value (a whole number), onChange(n)
export function Fader({ id, label, min, max, value, onChange }) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <fieldset class="engraved fader-group">
      <legend>{label}</legend>
      <div class="fader-ladder" aria-hidden="true">
        {steps.map(n => <span key={n} class={'led amber' + (n <= value ? ' lit' : '')}></span>)}
      </div>
      <input type="range" id={id} class="fader" min={min} max={max} step="1" value={value} aria-label={label}
        onInput={e => onChange(Number(e.currentTarget.value))} />
      <div class="fader-scale" aria-hidden="true">
        {steps.map(n => <span key={n} class={n === value ? 'cur' : ''}>{n}</span>)}
      </div>
    </fieldset>
  );
}
