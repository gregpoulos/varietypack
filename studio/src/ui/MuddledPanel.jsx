import { VALID_THEMES } from '../../../shared/build/themeRegistry.js';
import { kindName } from './kinds.js';

function countEntries(node) {
  if (Array.isArray(node)) return node.reduce((n, v) => n + countEntries(v), 0);
  if (node && typeof node === 'object') {
    return (typeof node.clue === 'string' ? 1 : 0) + Object.values(node).reduce((n, v) => n + countEntries(v), 0);
  }
  return 0;
}

// Build-only mode: a muddled file can be test-solved and built, never edited.
export function MuddledPanel({ doc, check, onTheme, onExport }) {
  const m = doc.muddled;
  const title = check?.title ?? m.title ?? 'Untitled';
  const byline = [m.author, m.date].filter(Boolean).join(' · ');
  const problems = check ? [...(check.parseError ? [check.parseError] : []), ...check.errors] : [];
  return (
    <section id="muddled-panel" aria-label="Muddled file">
      <div>
        <h2>{title}</h2>
        {byline && <p class="by">{byline}</p>}
      </div>
      <div class="lock">
        <b>Answers are hidden in this file.</b>
        <span>You can test-solve it and build its puzzle page, but not edit it.</span>
      </div>
      {problems.length > 0 && (
        <div id="muddled-problems" class="lock">
          <b>This file can’t be built.</b>
          {problems.map((p, i) => <span key={i}>{p}</span>)}
        </div>
      )}
      <dl class="facts">
        <dt>Kind</dt><dd>{kindName(doc.kind)}</dd>
        <dt>Size</dt><dd>{countEntries(m)} entries</dd>
      </dl>
      <label class="fld">
        <span>Theme</span>
        <select id="muddled-theme" value={m.theme ?? 'broadsheet'} onChange={e => onTheme(e.currentTarget.value)}>
          {VALID_THEMES.map(t => <option value={t} key={t}>{t}</option>)}
        </select>
      </label>
      <p class="ed-hint">The theme is saved in the file if you export it again.</p>
      <button type="button" class="btn primary" onClick={onExport}>Export…</button>
    </section>
  );
}
