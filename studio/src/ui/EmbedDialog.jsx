import { useEffect, useRef, useState } from 'preact/hooks';
import core from '../core/index.js';
import { exportFileName } from '../model/filenames.js';
import { buildEmbed, embedSnippet } from '../model/exporters.js';
import { download } from './download.js';

// Export for embedding in another site (spec §10): the answers-hidden page built to post
// solves to the host's origin only, and the iframe snippet to paste there. Opened from
// the Export panel.
export function EmbedDialog({ doc, font, title, dispatch, onClose }) {
  const ref = useRef(null);
  const [origin, setOrigin] = useState('');
  const [url, setUrl] = useState(exportFileName(title, 'hashed'));
  const problem = origin ? core.validateEmbedOrigin(origin) : null;
  const ready = origin !== '' && !problem;
  const snippet = embedSnippet({ url, title });

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function onDownload() {
    try {
      const out = buildEmbed(doc, { font, embedOrigin: origin });
      download(exportFileName(title, 'hashed'), out.text, out.mime);
    } catch (err) {
      dispatch({ type: 'SHOW_MESSAGE', text: `Export failed: ${err.message}` });
    }
  }

  return (
    <dialog id="embed-dialog" ref={ref} aria-labelledby="embed-title"
      onClose={onClose} onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      <div class="sheet-head">
        <div>
          <h2 id="embed-title">Embed in another site</h2>
          <p>The page posts a finished solve, with the solution, to the origin you name and to nobody else. The site checks it against the puzzle’s hash, so it never needs the answers.</p>
        </div>
        <button type="button" id="embed-close" class="btn" onClick={() => ref.current.close()}>Close</button>
      </div>
      <label class="fld"><span>Origin of the site that will show the puzzle</span>
        <input id="embed-origin" value={origin} placeholder="https://hunt.example.com" spellcheck={false} autocomplete="off"
          onInput={e => setOrigin(e.currentTarget.value.trim())} />
      </label>
      {problem
        ? <p id="embed-origin-error" class="err">{problem}</p>
        : <p class="hint">Just the scheme and host (and port), like https://hunt.example.com: no path, no trailing slash.</p>}
      <button type="button" id="btn-embed-download" class="btn primary" disabled={!ready} onClick={onDownload}>Download the page</button>
      <label class="fld"><span>Where you’ll put that file (for the snippet)</span>
        <input id="embed-url" value={url} spellcheck={false} autocomplete="off" onInput={e => setUrl(e.currentTarget.value)} />
      </label>
      <label class="fld"><span>Paste this on the host page</span>
        <textarea id="embed-snippet" readOnly rows={10} value={snippet} />
      </label>
      <button type="button" id="btn-copy-snippet" class="btn" onClick={() => navigator.clipboard?.writeText(snippet).catch(() => {})}>Copy snippet</button>
      <p class="hint">Only the answers-hidden page gives a verifiable solve. Whether a solver’s progress is kept inside a cross-origin iframe depends on the browser, and hasn’t been checked.</p>
    </dialog>
  );
}
