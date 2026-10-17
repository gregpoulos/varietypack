// The default clue view: the entry at the caret in the active cut, and the other cut's
// entry crossing it. Presentational: the editor builds each card's data.
// Without `onDisplay` there is no "answer with spacing" field (Crushword: its answer is
// the bracketed cells that the Letters field edits).
//   card: { cutName, name, range (shown as given), tiles: [{ i, key?, number, title?, text, circled, here }],
//           clue, display, displayStatus }
//   crossing may instead be { cutName, note } when there is no other entry to show.
function Tiles({ tiles, onCircle }) {
  return (
    <div class="tiles">
      {tiles.map(t => (
        <button type="button" key={t.key ?? t.i} data-index={t.i}
          class={'entry-tile' + (t.circled ? ' circled' : '') + (t.here ? ' here' : '') + (t.text.length > 1 ? ' multi' : '')}
          title={t.title ?? `Cell ${t.number}: click to ${t.circled ? 'remove the' : 'add a'} circle`}
          onClick={() => onCircle(t.i)}><small>{t.number}</small>{t.text}</button>
      ))}
    </div>
  );
}

export function EntryPanel({ main, crossing, onPrev, onNext, onCircle, onClue, onDisplay }) {
  return (
    <div id="entry-panel" class="cards">
      <div class={`card entry-card main ${main.cutName}`}>
        <div class="card-head">
          <span class={`chip ${main.cutName}`}><span class="entry-name">{main.name}</span></span>
          <span class="entry-range">{main.range}</span>
          <span class="card-nav">
            <button type="button" id="btn-prev-entry" class="btn icon" aria-label="Previous entry" onClick={onPrev}>‹</button>
            <button type="button" id="btn-next-entry" class="btn icon" aria-label="Next entry" onClick={onNext}>›</button>
          </span>
        </div>
        <Tiles tiles={main.tiles} onCircle={onCircle} />
        <label class="fld"><span>Clue</span>
          <textarea id="entry-clue" rows={2} placeholder="Write a clue" value={main.clue}
            onInput={e => onClue(main, e.currentTarget.value)} /></label>
        {onDisplay && (
          <label class="fld"><span>Answer with spacing</span>
            <input id="entry-display" value={main.display} spellcheck={false} autocomplete="off"
              onInput={e => onDisplay(main, e.currentTarget.value)} />
            <small id="entry-display-status" class={main.displayStatus.warn ? 'warn' : ''}>{main.displayStatus.text}</small></label>
        )}
      </div>
      {crossing.note ? (
        <div class={`card entry-card crossing ${crossing.cutName}`}>
          <p class="hint">{crossing.note}</p>
        </div>
      ) : (
        <div class={`card entry-card crossing ${crossing.cutName}`}>
          <div class="card-head">
            <span class={`chip ${crossing.cutName}`}><span class="entry-name">{crossing.name}</span></span>
            <span class="entry-range">{crossing.range}</span>
            <span class="tag">crosses the cursor</span>
          </div>
          <Tiles tiles={crossing.tiles} onCircle={onCircle} />
          <label class="fld"><span>Clue</span>
            <textarea id="crossing-clue" rows={2} placeholder="Write a clue" value={crossing.clue}
              onInput={e => onClue(crossing, e.currentTarget.value)} /></label>
        </div>
      )}
    </div>
  );
}
