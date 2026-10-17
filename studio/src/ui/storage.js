// localStorage for drafts. Every access is wrapped in try/catch: storage can be missing,
// blocked or full, and the studio must work without it.
import { serializeDraft, parseDraft, indexEntry } from '../model/drafts.js';

const INDEX_KEY = 'vp:studio:drafts';
const draftKey = (id) => `vp:studio:draft:${id}`;

function readIndex() {
  try {
    const raw = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(e => e && typeof e.id === 'string') : [];
  } catch { return []; }
}

// → IndexEntry[], newest first ([] on any failure)
export function loadIndex() {
  return readIndex().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// Writes the draft and upserts the index; false on failure. The two writes aren't atomic,
// so when the index write fails the draft body goes back to what it was (or is removed if
// new): a body no index entry points to would be unreachable and keep taking up space.
export function saveDraft(doc, title) {
  const key = draftKey(doc.id);
  let previous = null;
  try { previous = localStorage.getItem(key); } catch { /* storage unavailable: the write below fails too */ }
  try {
    localStorage.setItem(key, serializeDraft(doc, new Date().toISOString()));
    const index = readIndex().filter(e => e.id !== doc.id);
    index.push(indexEntry(doc, title));
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    try {
      if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key, previous);
    } catch { /* nothing more to do */ }
    return false;
  }
}

// → doc|null
export function loadDraft(id) {
  try {
    const raw = localStorage.getItem(draftKey(id));
    return raw ? parseDraft(raw) : null;
  } catch { return null; }
}

export function deleteDraft(id) {
  try {
    localStorage.removeItem(draftKey(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter(e => e.id !== id)));
  } catch { /* nothing to delete from */ }
}
