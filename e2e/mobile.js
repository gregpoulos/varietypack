'use strict';

// Phone profiles, fixtures and helpers shared by playwright.config.js (one project per
// phone), e2e/mobile.spec.js (the property tests), e2e/phone.spec.js (the phone solving
// view's behavior) and e2e/capture-mobile.js (on-demand screenshots for review). Device
// names are Playwright `devices` descriptors.

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { devices } = require('@playwright/test');
const { buildPuzzleFile } = require('../test/helpers');

// The smallest current iPhone (WebKit) and a large Android (Chromium) — the width
// extremes a layout has to survive, one per mobile engine Playwright can emulate.
const PHONES = [
  { project: 'mobile-webkit',   device: 'iPhone SE (3rd gen)' },
  { project: 'mobile-chromium', device: 'Pixel 8' },
];

// The largest existing fixture per tool — the hardest to fit on a phone — and one per
// Snake Charmer shape, since each shape has its own geometry. Spiral's 78 is here too,
// as the one e2e/phone.spec.js solves on (it says why).
const FIXTURES = [
  { tool: 'snake-charmer',  file: 'circle-84.yaml' },
  { tool: 'snake-charmer',  file: 'stadium-88.yaml' },
  { tool: 'snake-charmer',  file: 'turn-76.yaml' },
  { tool: 'snake-charmer',  file: 'double-turn-96.yaml' },
  { tool: 'spiral',         file: 'test-78.yaml' },
  { tool: 'spiral',         file: 'test-122.yaml' },
  { tool: 'marching-bands', file: 'mb-17.yaml' },
  { tool: 'crushword',      file: 'cw-9.yaml' },
].map(f => ({
  ...f,
  key: `${f.tool}/${path.basename(f.file, '.yaml')}`,
  yamlPath: path.join(__dirname, '..', f.tool, 'test', 'fixtures', f.file),
}));

// One fixture per tool. Spiral's is test-78: its outward entries break at other cells
// than its inward ones, as a real Spiral's do, where test-122's line up.
const TOOL_FIXTURES = ['snake-charmer/circle-84', 'spiral/test-78', 'marching-bands/mb-17', 'crushword/cw-9']
  .map(key => FIXTURES.find(f => f.key === key));

// Builds every fixture into tmpDir; returns FIXTURES with an htmlPath on each.
function buildFixtures(tmpDir) {
  return FIXTURES.map(f => {
    const htmlPath = path.join(tmpDir, f.key.replace('/', '--') + '.html');
    buildPuzzleFile(f.yamlPath, htmlPath);
    return { ...f, htmlPath };
  });
}

// Closes the first-visit instructions card (setupPhoneLayout) a fresh page of a puzzle
// with instructions opens under, if it is showing.
async function dismissIntro(page) {
  const intro = page.locator('#intro');
  if (await intro.isVisible()) await intro.tap();
}

// Scrolls the page so the solving view's top meets the screen's.
function scrollFlush(page) {
  return page.evaluate(() => window.scrollTo({
    top: window.scrollY + document.getElementById('solve-view').getBoundingClientRect().top,
    behavior: 'instant',
  }));
}

// A clue far too long for the clue bar's two lines.
const LONG_CLUE = 'Restored watermill that once ground grain for virtually the whole surrounding ' +
  'village, now a museum of rural life with a working wheel and a tea room by the race';

// Writes <tmpDir>/<name>.yaml, the fixture with every clue replaced by `${text} (n)`
// (n counting from 1, so moving to another clue changes the text), and builds
// <tmpDir>/<name>.html from it; returns the html path.
function buildClueVariant(fixture, text, name, tmpDir) {
  let n = 0;
  const withClues = v => {
    if (Array.isArray(v)) return v.map(withClues);
    if (v === null || typeof v !== 'object') return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) =>
      [k, k === 'clue' ? `${text} (${++n})` : withClues(x)]));
  };
  const yamlPath = path.join(tmpDir, name + '.yaml');
  fs.writeFileSync(yamlPath, yaml.dump(withClues(yaml.load(fs.readFileSync(fixture.yamlPath, 'utf8')))));
  const htmlPath = path.join(tmpDir, name + '.html');
  buildPuzzleFile(yamlPath, htmlPath);
  return htmlPath;
}

// Visible buttons and grid cells whose center is on screen but not the topmost element
// there — i.e. a tap at that point would land on something else. Off-screen centers are
// skipped, so this is blind to a control pushed off the edge by horizontal overflow
// (Chromium widens the layout viewport to fit it) — that case is the no-hscroll check's
// to catch.
function obstructed(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return [...document.querySelectorAll('button, .cell')]
      .filter(el => el.checkVisibility())
      .flatMap(el => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x >= de.clientWidth || y >= de.clientHeight) return [];
        const hit = document.elementFromPoint(x, y);
        if (hit === el || el.contains(hit)) return [];
        return [{ el: el.id || el.textContent.trim().slice(0, 20), coveredBy: hit && (hit.id || hit.tagName) }];
      });
  });
}

// Landscape viewports. 658×320 is the shortest and narrowest landscape phone among
// Playwright's descriptors (Galaxy S9+); `device` is the landscape size of the phone a
// project emulates (667×375 for mobile-webkit, 863×360 for mobile-chromium).
const LANDSCAPE = {
  short: { width: 658, height: 320 },
  device: projectName => devices[PHONES.find(p => p.project === projectName).device + ' landscape'].viewport,
};
const TABLET_LANDSCAPE = { width: 1024, height: 768 };

// A muddled (hashed) Crushword, whose page has no help button.
const MUDDLED_CW = path.join(__dirname, '..', 'crushword', 'test', 'fixtures', 'cw-9.muddled.yaml');

// The bar's clue text: Marching Bands' navigator shows its own.
const BAR_TEXT = tool => (tool === 'marching-bands' ? '.nav-text' : '#active-clue-primary .active-clue-text');

module.exports = {
  PHONES, FIXTURES, TOOL_FIXTURES, LONG_CLUE, buildFixtures, buildClueVariant, dismissIntro, scrollFlush,
  obstructed, LANDSCAPE, TABLET_LANDSCAPE, MUDDLED_CW, BAR_TEXT,
};
