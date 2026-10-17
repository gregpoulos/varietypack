'use strict';

// Phone profiles and fixtures shared by playwright.config.js (one project per phone),
// e2e/mobile.spec.js (the property tests) and e2e/capture-mobile.js (on-demand
// screenshots for review). Device names are Playwright `devices` descriptors.

const path = require('path');

// The smallest current iPhone (WebKit) and a large Android (Chromium) — the width
// extremes a layout has to survive, one per mobile engine Playwright can emulate.
const PHONES = [
  { project: 'mobile-webkit',   device: 'iPhone SE (3rd gen)' },
  { project: 'mobile-chromium', device: 'Pixel 8' },
];

// The largest existing fixture per tool — the hardest to fit on a phone — and one per
// Snake Charmer shape, since each shape has its own geometry.
const FIXTURES = [
  { tool: 'snake-charmer',  file: 'circle-84.yaml' },
  { tool: 'snake-charmer',  file: 'stadium-88.yaml' },
  { tool: 'snake-charmer',  file: 'turn-76.yaml' },
  { tool: 'snake-charmer',  file: 'double-turn-96.yaml' },
  { tool: 'spiral',         file: 'test-122.yaml' },
  { tool: 'marching-bands', file: 'mb-17.yaml' },
  { tool: 'crushword',      file: 'cw-9.yaml' },
].map(f => ({
  ...f,
  key: `${f.tool}/${path.basename(f.file, '.yaml')}`,
  yamlPath: path.join(__dirname, '..', f.tool, 'test', 'fixtures', f.file),
}));

// Builds every fixture into tmpDir; returns FIXTURES with an htmlPath on each.
function buildFixtures(tmpDir) {
  return FIXTURES.map(f => {
    const htmlPath = path.join(tmpDir, f.key.replace('/', '--') + '.html');
    require(`../${f.tool}/cli`).buildPuzzle(f.yamlPath, htmlPath);
    return { ...f, htmlPath };
  });
}

module.exports = { PHONES, FIXTURES, buildFixtures };
