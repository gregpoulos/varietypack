'use strict';
// Draft (de)serialization. A draft file is { studio: <version>, savedAt, doc }.

const { defaultOptions } = require('./doc');
const { STRUCTURED } = require('./kinds');

const DRAFT_VERSION = 1;

// Enough shape that the editor can open a structured draft without crashing; each kind
// knows its own model's shape.
function isModel(m) {
  return !!(m && typeof m === 'object' && Object.hasOwn(STRUCTURED, m.kind) && STRUCTURED[m.kind].isModel(m));
}
const MODES = ['yaml', 'muddled', 'structured'];

function serializeDraft(doc, savedAtIso) {
  return JSON.stringify({ studio: DRAFT_VERSION, savedAt: savedAtIso, doc }, null, 2);
}

function parseDraft(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Not a studio draft file'); }
  if (!data || typeof data !== 'object' || typeof data.studio !== 'number') {
    throw new Error('Not a studio draft file');
  }
  if (data.studio > DRAFT_VERSION) {
    throw new Error(`This draft was saved by a newer studio (version ${data.studio})`);
  }
  const d = data.doc;
  const ok = d && typeof d === 'object' && typeof d.id === 'string' && MODES.includes(d.mode)
    && (d.mode === 'structured'
      ? isModel(d.model) && d.kind === d.model.kind
      : typeof d.yaml === 'string')
    && (d.mode !== 'muddled' || (d.muddled && typeof d.muddled === 'object'));
  if (!ok) throw new Error('Not a studio draft file');
  // A hand-edited or older file may lack options; fill them in so the UI can rely on
  // them.
  return { ...d, options: { ...defaultOptions(), ...(d.options && typeof d.options === 'object' ? d.options : {}) } };
}

function indexEntry(doc, title) {
  return { id: doc.id, title, kind: doc.kind, updatedAt: doc.updatedAt };
}

module.exports = { DRAFT_VERSION, serializeDraft, parseDraft, indexEntry };
