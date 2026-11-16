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

// A token no rule reads is a name authors can set in `themeTokens:` to no effect.
test('every token is read by theme-components.css or by another token in theme-base.css', () => {
  const themes = path.join(__dirname, '..', 'themes');
  const css = fs.readFileSync(path.join(themes, 'theme-components.css'), 'utf8')
    + fs.readFileSync(path.join(themes, 'theme-base.css'), 'utf8');
  const unread = THEME_TOKENS.filter(name => !css.includes(`var(--theme-${name})`) && !css.includes(`var(--theme-${name},`));
  assert.deepEqual(unread, []);
});

test('THEME_TOKENS includes the masthead, title-size and corner-radius tokens', () => {
  for (const name of ['header-align', 'title-size', 'control-radius', 'icon-button-radius']) {
    assert.ok(THEME_TOKENS.includes(name), name);
  }
});
