'use strict';
// Slugs and export file names.

function slugify(title) {
  const slug = String(title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '');
  return slug || 'puzzle';
}

const SUFFIXES = {
  source: '.yaml',
  muddled: '.muddled.yaml',
  html: '.html',
  hashed: '.hashed.html',
  draft: '.vpstudio.json',
};

function exportFileName(title, type) {
  if (!SUFFIXES[type]) throw new Error(`unknown export type "${type}"`);
  return slugify(title) + SUFFIXES[type];
}

module.exports = { slugify, exportFileName };
