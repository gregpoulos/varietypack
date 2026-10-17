import { OrphanTray } from './OrphanTray.jsx';

// The clue area every structured editor shares: the Selected entry / All clues switch,
// the orphan tray above the clues, then whichever view the editor renders as children.
export function ClueSection({ clueView, setClueView, orphans, targets, onAttach, onDiscard, orphanNote, children }) {
  return (
    <div class="clues">
      <div class="clues-head">
        <h3>Clues</h3>
        <span id="clue-view" class="seg small" role="group" aria-label="Clue editing">
          <button type="button" class="seg-btn" data-view="selected" aria-pressed={clueView === 'selected'}
            onClick={() => setClueView('selected')}>Selected entry</button>
          <button type="button" class="seg-btn" data-view="all" aria-pressed={clueView === 'all'}
            onClick={() => setClueView('all')}>All clues</button>
        </span>
      </div>
      <OrphanTray orphans={orphans} targets={targets} onAttach={onAttach} onDiscard={onDiscard} note={orphanNote} />
      {children}
    </div>
  );
}
