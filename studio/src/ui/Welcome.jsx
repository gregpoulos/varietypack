import { useState, useEffect, useRef } from 'preact/hooks';
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

export function Welcome({ drafts, onNew, onCreate, onExample, onOpenDraft, onDeleteDraft }) {
  const [confirming, setConfirming] = useState(null);
  // The confirm replaces the Delete key that was pressed, so focus follows it to Keep,
  // and back to that draft's Delete when Keep is pressed.
  const focusAfter = useRef(null);   // 'keep' | { delete: id } | null
  const seen = useRef(confirming);   // the mount effect can run after an early click
  useEffect(() => {
    if (seen.current === confirming) return;
    seen.current = confirming;
    const want = focusAfter.current; focusAfter.current = null;
    if (!want) return;
    const target = want === 'keep' ? '.draft-delete-no' : `tr[data-id="${want.delete}"] .draft-delete`;
    document.querySelector(target)?.focus();
  }, [confirming]);
  const [sizing, setSizing] = useState(null);   // the structured kind whose size prompt is open
  return (
    <section id="welcome" class="pane-scroll" aria-label="Start screen">
      <div>
        <h2>Make a variety word puzzle</h2>
        <p class="lede">Build it, test-solve it, and export a page to publish. Everything stays on this computer.</p>
      </div>
      <div class="start-cols">
        <div>
          <h3 class="sec-title legend">New puzzle</h3>
          {sizing && <NewSizeForm kind={sizing} onCreate={onCreate} onCancel={() => setSizing(null)} />}
          <div class="kinds">
            {KINDS.map(([kind, name, desc]) => (
              <div class="kind-card" key={kind}>
                <span class="slot l" aria-hidden="true"></span>
                <div class="win paper"><KindIcon kind={kind} /></div>
                <h3 class="legend">{name}</h3>
                <p>{desc}</p>
                <div class="acts">
                  <button type="button" class="btn dark" data-kind={kind} onClick={() => (Object.hasOwn(STRUCTURED, kind) ? setSizing(kind) : onNew(kind))}>New</button>
                  <button type="button" class="btn" data-template={kind} onClick={() => onExample(kind)}>Open the example</button>
                </div>
                <span class="slot r" aria-hidden="true"></span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div class="paper track-sheet">
            <div class="ts-head">
              <h3 class="ts-title" tabindex="0" aria-describedby="drafts-note">Drafts</h3>
              <span class="ts-where">In this browser</span>
              <span id="drafts-note" class="ts-tip" role="tooltip">Drafts save as you work, in this browser only, with the answers in plain text. To keep a copy or move to another computer, use Export.</span>
            </div>
            <div class="ts-scroll">
            <table>
              <thead><tr><th>No.</th><th>Title</th><th>Kind</th><th><span class="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr class={'draft-item' + (confirming === d.id ? ' confirming' : '')} key={d.id} data-id={d.id}>
                    <td class="no">{String(i + 1).padStart(2, '0')}</td>
                    <td class="draft-title"><button type="button" class="draft-open" onClick={() => onOpenDraft(d.id)}>{d.title}</button></td>
                    {confirming === d.id ? (
                      // The confirm takes the kind and actions cells, so it reads as one
                      // short question over its two keys.
                      <td class="actions confirm" colSpan={2}>
                        <span class="draft-confirm">
                          <span class="draft-confirm-text">Delete for good?</span>
                          <span class="draft-confirm-keys">
                            <button type="button" class="btn draft-delete-yes" onClick={() => { setConfirming(null); onDeleteDraft(d.id); }}>Delete</button>
                            <button type="button" class="btn quiet draft-delete-no" onClick={() => { focusAfter.current = { delete: d.id }; setConfirming(null); }}>Keep</button>
                          </span>
                        </span>
                      </td>
                    ) : (
                      <>
                        <td class="kind" title={kindName(d.kind)}><KindIcon kind={d.kind} /><span class="sr-only">{kindName(d.kind)}</span></td>
                        <td class="actions">
                          <button type="button" class="btn draft-delete" onClick={() => { focusAfter.current = 'keep'; setConfirming(d.id); }}>Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {Array.from({ length: Math.max(2, 5 - drafts.length) }, (_, k) => (
                  <tr class="blank" key={`blank-${k}`} aria-hidden="true">
                    <td class="no">{String(drafts.length + k + 1).padStart(2, '0')}</td><td></td><td></td><td></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {drafts.length === 0 && <p class="empty">No drafts in this browser yet.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
