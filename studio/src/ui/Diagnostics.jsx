// The problems list: while a structured puzzle is incomplete, only what's missing
// (completeness); otherwise validator errors, then warnings, then notes. Text only, never
// HTML. A completeness item with a target is a button that moves the editor there.
export function Diagnostics({ check, completeness = [], onJump }) {
  const items = completeness.map(d => ['diag-error', 'Problem', d.message, d.target]);
  if (!completeness.length) {
    if (!check) return <div id="diagnostics" class="pop mid"><p>Checking…</p></div>;
    if (check.parseError) items.push(['diag-parse', 'YAML', check.parseError]);
    check.errors.forEach(e => items.push(['diag-error', 'Problem', e]));
    check.warnings.forEach(w => items.push(['diag-warning', 'Warning', w]));
    check.notes.forEach(n => items.push(['diag-note', 'Note', n]));
  }
  const blocking = completeness.length || (check ? (check.parseError ? 1 : 0) + check.errors.length : 0);
  return (
    <div id="diagnostics" class="pop mid">
      {blocking > 0 && <p><b>{!completeness.length && check.parseError ? 'The YAML has an error.' : `${blocking} problem${blocking === 1 ? '' : 's'} stop export.`}</b> Warnings don’t.</p>}
      {items.length === 0
        ? <p class="diag-ok">No problems. Every export is ready.</p>
        : (
          <ul>
            {items.map(([cls, label, text, target], i) => (
              <li class={cls} key={i}>
                <span class="lvl">{label}</span>
                {target && onJump
                  ? <button type="button" class="diag-jump" onClick={() => onJump(target)}>{text}</button>
                  : <span>{text}</span>}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
