import { VALID_THEMES } from '../../../../shared/build/themeRegistry.js';
import { ThemeTokens } from './ThemeTokens.jsx';

// "Puzzle settings": the header fields every kind shares, then the kind's own settings
// (grid resizes live there and nowhere else, so they aren't triggered by accident).
export function HeaderForm({ model, dispatch, Settings }) {
  const h = model.header;
  const set = (field) => (e) => dispatch({
    type: 'MODEL_COMMAND', name: 'setHeader', args: [field, e.currentTarget.value], key: `header:${field}`, now: Date.now(),
  });
  return (
    <section class="settings" aria-label="Puzzle settings">
      <h3>Puzzle settings</h3>
      <div class="set-grid">
        <label class="fld"><span>Title</span><input id="header-title" value={h.title} onInput={set('title')} /></label>
        <label class="fld"><span>Author</span><input id="header-author" value={h.author ?? ''} onInput={set('author')} /></label>
        <label class="fld"><span>Date</span><input id="header-date" value={String(h.date ?? '')} onInput={set('date')} /></label>
        <label class="fld"><span>Theme</span>
          <select id="header-theme" value={h.theme ?? ''} onChange={set('theme')}>
            <option value="">Default (broadsheet)</option>
            {VALID_THEMES.map(t => <option value={t} key={t}>{t}</option>)}
          </select></label>
      </div>
      <ThemeTokens tokens={h.themeTokens ?? {}} dispatch={dispatch} />
      <label class="fld"><span>Instructions</span>
        <textarea id="header-instructions" rows={3} value={h.instructions ?? ''} onInput={set('instructions')} /></label>
      {Settings && <div id="puzzle-settings"><Settings model={model} dispatch={dispatch} /></div>}
    </section>
  );
}
