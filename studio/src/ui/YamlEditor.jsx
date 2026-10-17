export function YamlEditor({ value, onInput, canReturn, onReturn }) {
  return (
    <div class="ed">
      <div class="ed-head">
        {canReturn && (
          <span id="mode-switch" class="seg small" role="group" aria-label="Editing mode">
            <button type="button" id="btn-back-to-editor" class="seg-btn" aria-pressed="false" onClick={onReturn}>Editor</button>
            <button type="button" class="seg-btn" aria-pressed="true">YAML</button>
          </span>
        )}
        <p class="ed-hint">The puzzle file as text. Problems appear in the list at the top; Test-solve shows the puzzle page.</p>
      </div>
      <textarea id="yaml-editor" spellcheck={false} aria-label="Puzzle YAML" value={value}
        onInput={e => onInput(e.currentTarget.value)} />
    </div>
  );
}
