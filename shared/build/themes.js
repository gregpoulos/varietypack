'use strict';
// A page's stylesheet: the theme's tokens and fonts, composed with the shared and
// per-tool CSS.

const fs   = require('fs');
const path = require('path');
const { THEME_REGISTRY, VALID_THEMES, FONT_MODES } = require('./themeRegistry');

const SHARED_DIR = path.join(__dirname, '..');

// The cascade layers of a page's stylesheet, weakest first (composeThemeCss).
const LAYERS = ['base', 'tool', 'theme', 'phone', 'print'];

function buildFontCss(themeName, themeEntry, fontMode) {
  if (!themeEntry || !themeEntry.fonts) return '';
  if (!fontMode) fontMode = themeEntry.fonts.faces ? 'embed' : 'link';
  if (fontMode === 'link') {
    if (!themeEntry.fonts.cdn) {
      throw new Error(`theme '${themeName}' has no CDN font source; --font link is not supported`);
    }
    return `@import url('${themeEntry.fonts.cdn.url}');\n`;
  }
  if (!themeEntry.fonts.faces) {
    throw new Error(`theme '${themeName}' has no local font files declared; --font embed is not supported`);
  }
  return themeEntry.fonts.faces.map(face => {
    const filePath = path.isAbsolute(face.file)
      ? face.file
      : path.join(SHARED_DIR, 'themes', face.file);
    let data;
    try {
      data = fs.readFileSync(filePath);
    } catch {
      throw new Error(`theme '${themeName}' embed failed: file not found: ${face.file}`);
    }
    const b64 = data.toString('base64');
    return `@font-face {\n  font-family: '${face.family}';\n  font-weight: ${face.weight};\n  font-style: ${face.style};\n  src: url('data:font/woff2;base64,${b64}') format('woff2');\n}\n`;
  }).join('\n');
}

// The puzzle's `themeTokens:` as one :root block. Values were validated by
// validateCommonHeader (no `;`, braces, `url(` …), so interpolating them here is safe.
function themeTokensCss(themeTokens) {
  const entries = Object.entries(themeTokens ?? {});
  if (!entries.length) return '';
  return ':root {\n' + entries.map(([k, v]) => `  --theme-${k}: ${v};\n`).join('') + '}\n';
}

// One cascade layer: `css` wrapped in `@layer <name> { … }`.
function layer(name, css) {
  return `@layer ${name} {\n${css}\n}\n`;
}

// Assembles the full inlined stylesheet for a tool build, as cascade layers. A rule in a
// later layer beats a rule in an earlier one whatever their selectors, so which file a
// rule is in decides what it can override, and no selector has to be padded to win:
//   base   shared/base.css: the reset and the structure every tool shares
//   tool   the tool's base.css: its own layout
//   theme  theme-base (neutral --theme-* defaults), <theme>-tokens (overrides), the
//          puzzle's themeTokens (override the theme's own), then theme-components (every
//          var-driven rule, so it picks all of those up)
//   phone  shared/phone.css: the phone solving view, which rearranges all of the above
//   print  shared print-base, then the tool's print.css
// Within a layer the usual rules hold (specificity, then source order). Font CSS comes
// before the layers, unlayered: --font link emits an @import, which CSS ignores after
// any rule but the `@layer` statement, and @font-face is unaffected by layers.
// Owns theme defaulting (→ broadsheet), so builders don't repeat it. It also refuses an
// unregistered theme or font mode, which a build has already reported by then (the
// YAML's theme in validateCommonHeader, the flags in validateBuildOptions). Adding a
// theme = drop a <theme>-tokens.css in shared/themes and add an entry in
// themeRegistry.js; no branch in this function.
function composeThemeCss(templateDir, theme = 'broadsheet', fontMode, themeTokens) {
  // Own-property check: a plain lookup would take toString and the other names every
  // object inherits as themes.
  if (!Object.hasOwn(THEME_REGISTRY, theme)) {
    throw new Error(`Unknown theme "${theme}". Must be one of: ${VALID_THEMES.join(', ')}.`);
  }
  const themeEntry = THEME_REGISTRY[theme];
  if (fontMode !== undefined && !FONT_MODES.includes(fontMode)) {
    throw new Error(`Unknown font mode "${fontMode}". Must be "embed" or "link".`);
  }
  const fontCss = buildFontCss(theme, themeEntry, fontMode);
  const shared = (rel) => fs.readFileSync(path.join(SHARED_DIR, rel), 'utf8');
  const tool   = (rel) => fs.readFileSync(path.join(templateDir, rel), 'utf8');

  return fontCss
    + `@layer ${LAYERS.join(', ')};\n`
    + layer('base', shared('base.css'))
    + layer('tool', tool('base.css'))
    + layer('theme', shared('themes/theme-base.css') + '\n'
      + shared(`themes/${theme}-tokens.css`) + '\n'
      + themeTokensCss(themeTokens)
      + shared('themes/theme-components.css'))
    + layer('phone', shared('phone.css'))
    + layer('print', shared('themes/print-base.css') + '\n' + tool('print.css'));
}

module.exports = { composeThemeCss, buildFontCss };
