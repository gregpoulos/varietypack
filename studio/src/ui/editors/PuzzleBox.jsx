import { useState } from 'preact/hooks';
import { AutoTextarea } from './AutoTextarea.jsx';
import header from '../../model/header.js';

const { HEADER_LIMITS, titleSizePx } = header;

// A text input exactly as wide as its text (or its placeholder, when empty), so a hover
// underline spans the words and not the row. The hidden twin in ::after, filled from
// the data attribute, sets the width; the input is laid over it.
function Fit({ kind, value, placeholder, ...input }) {
  return (
    <span class={`fit ${kind}`} data-fit={value || placeholder}>
      <input placeholder={placeholder} value={value} {...input} />
    </span>
  );
}

// The title, byline and instructions, at the top of the side column in both phases. It
// scrolls with the list below it: it is set once and rarely looked at again, so it gives
// its room back once the list scrolls.
export function PuzzleBox({ model, dispatch }) {
  const h = model.header;
  const [editingInstructions, setEditingInstructions] = useState(false);
  const setField = (field, value) => dispatch({
    type: 'MODEL_COMMAND', name: 'setHeader', args: [field, value], key: `header:${field}`, now: Date.now(),
  });
  const set = (field) => (e) => setField(field, e.currentTarget.value);
  const date = String(h.date ?? '');
  const author = h.author ?? '';
  return (
    <section id="puzzle-box" class="puzzle-box engraved" aria-labelledby="puzzle-legend">
      <h3 id="puzzle-legend" class="legend">Puzzle</h3>
      {/* The title wraps in the narrow column, so it is a textarea that refuses line
          breaks: Enter does nothing, and a pasted break becomes a space. */}
      <AutoTextarea id="header-title" class="hs-title" aria-label="Title" placeholder="Untitled puzzle" value={h.title}
        style={{ fontSize: `${titleSizePx(h.title.length)}px` }} maxlength={HEADER_LIMITS.title} spellcheck={false}
        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
        onInput={e => setField('title', e.currentTarget.value.replace(/\s*[\r\n]+\s*/g, ' '))} />
      <div class="hs-byline">
        <label class="hs-cap" for="header-author">By</label>
        <Fit kind="inline" id="header-author" aria-label="Author" class="hs-inline" placeholder="author" value={author} maxlength={HEADER_LIMITS.author} onInput={set('author')} />
        <label class="hs-cap" for="header-date">Date</label>
        <Fit kind="inline" id="header-date" aria-label="Date" class="hs-inline" placeholder="date" value={date} maxlength={HEADER_LIMITS.date} onInput={set('date')} />
      </div>
      {/* A textarea draws no ellipsis, so the collapsed field is a display of the first
          lines with the real textarea laid over it, invisible: a press lands on the
          textarea, which grows in place while it has focus. Most puzzles have no
          instructions, so an empty field is only a quiet prompt, not tape. */}
      <div class={'hs-instructions-wrap' + (h.instructions || editingInstructions ? ' tape' : ' empty')}>
        <div class={'hs-instructions-line' + (h.instructions ? '' : ' empty')} aria-hidden="true" hidden={editingInstructions}>
          {h.instructions || 'Add instructions'}
        </div>
        <AutoTextarea id="header-instructions" class={'hs-instructions' + (editingInstructions ? '' : ' collapsed')}
          placeholder="Add instructions" aria-label="Instructions" value={h.instructions ?? ''} onInput={set('instructions')}
          onFocus={() => setEditingInstructions(true)} onBlur={() => setEditingInstructions(false)} />
      </div>
    </section>
  );
}
