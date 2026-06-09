'use strict';

// Single source of truth for valid themes and their font metadata.
// fonts: null = system fonts only
// fonts.faces = [{family, weight, style, file}] for --font embed; file is relative to shared/themes/ or absolute
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

module.exports = { THEME_REGISTRY, VALID_THEMES };
