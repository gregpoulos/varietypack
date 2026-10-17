'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { THEME_TOKENS } = require('../build/themeRegistry');

// The drift guard: THEME_TOKENS is the list of overridable tokens, and theme-base.css is
// where they're declared. Adding a token to one without the other fails here.
test('THEME_TOKENS is exactly the set of tokens theme-base.css declares', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'themes', 'theme-base.css'), 'utf8');
  const root = css.slice(css.indexOf(':root'));
  const declared = new Set([...root.matchAll(/--theme-([a-z0-9-]+)\s*:/g)].map(m => m[1]));
  assert.deepEqual([...declared].sort(), [...THEME_TOKENS].sort());
});
