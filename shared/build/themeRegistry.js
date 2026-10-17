'use strict';

// Single source of truth for valid themes and their font metadata.
// fonts: null = system fonts only
// fonts.faces = [{family, weight, style, file}] for --font embed; file is relative to
//   shared/themes/ or absolute
// fonts.cdn = {source, url} for --font link (optional; omit for embed-only themes)
const THEME_REGISTRY = {
  broadsheet: { fonts: null },
  skeleton: {
    fonts: {
      faces: [
        { family: 'Outfit', weight: '100 900', style: 'normal', file: 'fonts/skeleton/outfit-variable.woff2' },
      ],
      cdn: {
        source: 'google',
        url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap'
      }
    }
  },
};

const VALID_THEMES = Object.keys(THEME_REGISTRY);

// The --font values: how a custom-font theme delivers its fonts (faces or cdn).
const FONT_MODES = ['embed', 'link'];

// Every token theme-base.css declares, without the --theme- prefix: the names a puzzle's
// `themeTokens:` may override. shared/test/themeRegistry.test.js fails if the two drift.
const THEME_TOKENS = [
  'font-body', 'font-display', 'font-button', 'font-cell', 'color-header-rule',
  'title-tracking', 'title-transform', 'color-title', 'byline-style', 'byline-size',
  'color-bg', 'color-text', 'color-muted', 'color-bar-border', 'color-soft-border',
  'color-btn-bg', 'color-btn-text', 'color-btn-hover', 'color-btn-disabled', 'button-tracking',
  'color-btn2-bg', 'color-btn2-border', 'color-btn2-hover', 'color-clear-fg',
  'color-clear-hover-fg', 'color-cell-bg', 'color-cell-stroke', 'color-cell-text',
  'color-highlight', 'color-band-even', 'color-highlight-band-even', 'color-active',
  'color-active-stroke', 'color-clue-hover', 'color-secondary-entry', 'clue-radius',
  'color-secondary-active', 'color-secondary-active-stroke', 'color-correct-bg',
  'color-correct-stroke', 'color-correct-text', 'clue-filled-decoration',
  'clue-filled-opacity', 'color-circle', 'color-curl', 'color-cell-center',
  'color-instructions', 'instructions-size', 'color-overlay', 'color-congrats-bg',
  'color-congrats-border', 'color-congrats-text', 'card-radius', 'color-wrong-bg',
  'color-wrong-border', 'color-wrong-text', 'color-danger',
];

module.exports = { THEME_REGISTRY, VALID_THEMES, FONT_MODES, THEME_TOKENS };
