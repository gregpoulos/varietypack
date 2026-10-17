import { useState } from 'preact/hooks';

// Clues whose entry disappeared. Each can be attached to a live entry or discarded, so
// clue text is never silently deleted. targets: [{ value, label }]; `note` says why they
// lost their entry, in the kind's terms.
export function OrphanTray({ orphans, targets, onAttach, onDiscard, note = 'a split was removed, so these lost their entry' }) {
  const [picked, setPicked] = useState({});
  if (!orphans.length) return null;
  return (
    <div id="orphan-tray" class="orphans">
      <h3>Unattached clues <small>· {note}</small></h3>
      {orphans.map(o => {
        // A pick can outlive its entry (a merge removed it); fall back to the first
        // target.
        const value = targets.some(t => t.value === picked[o.id]) ? picked[o.id] : targets[0]?.value;
        return (
          <div class="orphan" key={o.id} data-id={o.id}>
            <p><q class="orphan-clue">{o.clue}</q> <small class="orphan-from">was {o.from}</small></p>
            <div class="orphan-actions">
              <select class="orphan-target" aria-label="Entry to attach this clue to" value={value}
                onChange={e => setPicked(p => ({ ...p, [o.id]: e.currentTarget.value }))}>
                {targets.map(t => <option value={t.value} key={t.value}>{t.label}</option>)}
              </select>
              <button type="button" class="btn orphan-attach" onClick={() => onAttach(o.id, value)}>Attach</button>
              <button type="button" class="btn ghost orphan-discard" onClick={() => onDiscard(o.id)}>Discard</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
