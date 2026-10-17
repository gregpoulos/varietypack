import { useState } from 'preact/hooks';
import { KINDS, kindName } from './kinds.js';
import { STRUCTURED } from '../model/kinds/index.js';
import { NewSizeForm } from './NewSizeForm.jsx';

function KindIcon({ kind }) {
  if (kind === 'spiral') {
    let d = '';
    for (let t = 0; t <= 5.2 * Math.PI; t += 0.2) {
      const r = 2 + t * 1.15;
      d += (d ? 'L' : 'M') + (22 + r * Math.cos(t)).toFixed(1) + ' ' + (22 + r * Math.sin(t)).toFixed(1);
    }
    return <svg viewBox="0 0 44 44" aria-hidden="true"><path class="k1" d={d} /></svg>;
  }
  if (kind === 'snake-charmer') {
    return <svg viewBox="0 0 44 44" aria-hidden="true"><rect class="k1" x="4" y="11" width="36" height="22" rx="11" /><rect class="k2" x="9" y="16" width="26" height="12" rx="6" /></svg>;
  }
  if (kind === 'marching-bands') {
    return <svg viewBox="0 0 44 44" aria-hidden="true"><rect class="k2" x="4" y="4" width="36" height="36" fill="none" /><rect class="k2" x="11" y="11" width="22" height="22" fill="none" /><path class="k1" d="M4 22h36" /></svg>;
  }
  const blocks = new Set([3, 9, 15, 21]);
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      cells.push(<rect class={blocks.has(r * 5 + c) ? 'kb' : 'kc'} x={4 + c * 7.2} y={4 + r * 7.2} width="7.2" height="7.2" />);
    }
  }
  return <svg viewBox="0 0 44 44" aria-hidden="true">{cells}</svg>;
}

function when(updatedAt) {
  return updatedAt ? new Date(updatedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

export function Welcome({ drafts, onNew, onCreate, onExample, onOpenDraft, onDeleteDraft }) {
  const [confirming, setConfirming] = useState(null);
  const [sizing, setSizing] = useState(null);   // the structured kind whose size prompt is open
  return (
    <section id="welcome" class="pane-scroll" aria-label="Start screen">
      <div>
        <h2>Make a variety word puzzle</h2>
        <p class="lede">Build it, test-solve it, and export a page to publish. Everything stays on this computer.</p>
      </div>
      <div class="start-cols">
        <div>
          <h3 class="sec-title">New puzzle</h3>
          {sizing && <NewSizeForm kind={sizing} onCreate={onCreate} onCancel={() => setSizing(null)} />}
          <div class="kinds">
            {KINDS.map(([kind, name, desc]) => (
              <div class="kind-card" key={kind}>
                <KindIcon kind={kind} />
                <h3>{name}</h3>
                <p>{desc}</p>
                <div class="acts">
                  <button type="button" class="btn primary" data-kind={kind} onClick={() => (Object.hasOwn(STRUCTURED, kind) ? setSizing(kind) : onNew(kind))}>New</button>
                  <button type="button" class="btn" data-template={kind} onClick={() => onExample(kind)}>Open the example</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 class="sec-title">Drafts in this browser</h3>
          {drafts.length === 0
            ? <p class="empty">No drafts in this browser yet.</p>
            : (
              <ul class="drafts">
                {drafts.map(d => (
                  <li class="draft-item" key={d.id}>
                    <span class="draft-text">
                      <span class="draft-title">{d.title}</span>
                      <span class="draft-meta">{kindName(d.kind)} · edited {when(d.updatedAt)}</span>
                    </span>
                    <button type="button" class="btn draft-open" onClick={() => onOpenDraft(d.id)}>Open</button>
                    <button type="button" class="btn ghost draft-delete" onClick={() => setConfirming(d.id)}>Delete</button>
                    {confirming === d.id && (
                      <span class="draft-confirm">
                        Delete this draft for good?
                        <button type="button" class="btn draft-delete-yes" onClick={() => { setConfirming(null); onDeleteDraft(d.id); }}>Delete</button>
                        <button type="button" class="btn ghost draft-delete-no" onClick={() => setConfirming(null)}>Keep</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          <p id="drafts-note" class="note">Drafts save as you work, in this browser only, with the answers in plain text. To keep a copy or move to another computer, use Download draft file in the ⋯ menu.</p>
        </div>
      </div>
    </section>
  );
}
