import { useState } from 'preact/hooks';
import { STRUCTURED } from '../model/kinds/index.js';
import { parseSize } from '../model/doc.js';
import { EDITORS } from './editors/index.js';
import { kindName } from './kinds.js';

// The New puzzle size prompt (spec §5.2): new puzzles start from a chosen size, driven by
// the kind's sizeFields. A kind's SizePreview, when it has one, shows the consequences of
// the numbers as they're typed and can add choices (`extra`) to the size.
export function NewSizeForm({ kind, onCreate, onCancel }) {
  const kindModule = STRUCTURED[kind];
  const { SizePreview } = EDITORS[kind];
  const [values, setValues] = useState(() => Object.fromEntries(kindModule.sizeFields.map(f => [f.name, String(f.default)])));
  const [extra, setExtra] = useState({});
  const [error, setError] = useState(null);

  function submit(e) {
    e.preventDefault();
    const r = parseSize(kindModule, values, extra);
    if (r.error) setError(r.error);
    else onCreate(kind, r.size);
  }

  return (
    <form id="new-size-form" class="size-form" noValidate onSubmit={submit}>
      <p><b>New {kindName(kind)}.</b> How big should it be? You can change the size later.</p>
      <div class="size-fields">
        {kindModule.sizeFields.map(f => (
          <label class="fld" key={f.name}><span>{f.label}</span>
            <input type="number" id={`new-size-${f.name}`} value={values[f.name]} min={f.min} max={f.max} step={f.step ?? 1}
              inputMode="numeric" onInput={e => setValues(v => ({ ...v, [f.name]: e.currentTarget.value }))} />
          </label>
        ))}
      </div>
      {SizePreview && <div id="size-preview"><SizePreview values={values} setExtra={setExtra} /></div>}
      {error && <p id="new-size-error" class="err">{error}</p>}
      <div class="size-actions">
        <button type="submit" id="new-size-create" class="btn primary">Create</button>
        <button type="button" id="new-size-cancel" class="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
