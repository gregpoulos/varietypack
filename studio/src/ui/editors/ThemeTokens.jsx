import { useState } from 'preact/hooks';
import { THEME_TOKENS } from '../../../../shared/build/themeRegistry.js';

// The puzzle's `themeTokens:` overrides, as rows of (token, value). A row exists in the
// model once it has both a name and a value; "Add token" opens an unfinished row held
// here until it does. An unsafe value still reaches the model, where the validator
// reports it in Problems.
export function ThemeTokens({ tokens, dispatch }) {
  const [pending, setPending] = useState([]);       // [{ id, name, value }]
  const send = (next) => dispatch({ type: 'MODEL_COMMAND', name: 'setHeader', args: ['themeTokens', next], key: 'header:themeTokens', now: Date.now() });
  const entries = Object.entries(tokens);
  const used = new Set([...entries.map(([k]) => k), ...pending.map(p => p.name).filter(Boolean)]);
  const options = (own) => THEME_TOKENS.filter(n => n === own || !used.has(n));

  const rename = (oldName, name) => send(Object.fromEntries(entries.map(([k, v]) => [k === oldName ? name : k, v])));
  // Clearing a value returns the row to an unfinished one (name kept), rather than
  // storing ''.
  function setValue(name, value) {
    if (value !== '') { send({ ...tokens, [name]: value }); return; }
    remove(name);
    setPending([...pending, { id: Date.now() + Math.random(), name, value: '' }]);
  }
  const remove = (name) => send(Object.fromEntries(entries.filter(([k]) => k !== name)));
  function patchPending(id, patch) {
    const row = { ...pending.find(p => p.id === id), ...patch };
    if (row.name && row.value) {
      setPending(pending.filter(p => p.id !== id));
      send({ ...tokens, [row.name]: row.value });
    } else setPending(pending.map(p => (p.id === id ? row : p)));
  }

  return (
    <div id="theme-tokens" class="theme-tokens">
      <span class="fld-label">Theme overrides <small>· change individual colors and fonts of the chosen theme</small></span>
      {entries.map(([name, value]) => (
        <div class="token-row" key={name}>
          <select class="token-name" aria-label="Token" value={name} onChange={e => rename(name, e.currentTarget.value)}>
            {options(name).map(n => <option value={n} key={n}>{n}</option>)}
          </select>
          <input class="token-value" aria-label={`Value for ${name}`} value={value} spellcheck={false} onInput={e => setValue(name, e.currentTarget.value)} />
          <button type="button" class="btn ghost token-remove" aria-label={`Remove ${name}`} onClick={() => remove(name)}>Remove</button>
        </div>
      ))}
      {pending.map(p => (
        <div class="token-row" key={p.id}>
          <select class="token-name" aria-label="Token" value={p.name} onChange={e => patchPending(p.id, { name: e.currentTarget.value })}>
            <option value="">Choose a token…</option>
            {options(p.name).map(n => <option value={n} key={n}>{n}</option>)}
          </select>
          <input class="token-value" aria-label="Value" placeholder="e.g. #1e5799" value={p.value} spellcheck={false} onInput={e => patchPending(p.id, { value: e.currentTarget.value })} />
          <button type="button" class="btn ghost token-remove" aria-label="Remove this row" onClick={() => setPending(pending.filter(x => x.id !== p.id))}>Remove</button>
        </div>
      ))}
      <button type="button" id="btn-add-token" class="btn" onClick={() => setPending([...pending, { id: Date.now() + Math.random(), name: '', value: '' }])}>Add token</button>
    </div>
  );
}
