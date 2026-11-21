export function YamlEditor({ value, onInput }) {
  return (
    <div class="ed">
      <p class="ed-hint">The puzzle file as text. Problems appear in the list at the top; Test-solve shows the puzzle page.</p>
      <textarea id="yaml-editor" spellcheck={false} aria-label="Puzzle YAML" value={value}
        onInput={e => onInput(e.currentTarget.value)} />
    </div>
  );
}
