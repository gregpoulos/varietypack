'use strict';

// Phone-layout properties, run only under the mobile projects in playwright.config.js
// (one per PHONES entry in e2e/mobile.js) against every FIXTURES puzzle, except the
// tap-target sizes: those come from each tool's chrome, not the puzzle's geometry, so
// they run on the first fixture of each tool. Each property is stated so that any
// correct layout passes it — no pixel positions, no screenshots. The phone solving view
// itself (shared/engine-phone.mjs) is what they describe; its behavior is in
// e2e/phone.spec.js.
//
// Device emulation supplies a phone viewport, DPR, touch and isMobile, but still drives
// a desktop browser's input stack: no soft keyboard, no IME. Nothing here covers those.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { FIXTURES, buildFixtures, dismissIntro, scrollFlush } = require('./mobile');

const MIN_TAP = 44; // px — Apple HIG minimum touch target
const EPS = 1;      // px of slack for sub-pixel layout rounding in viewport bounds

// The first fixture of each tool, where the chrome-only properties (tap targets) run.
const CHROME_FIXTURES = FIXTURES.filter((f, i) => FIXTURES.findIndex(g => g.tool === f.tool) === i);

// Known breakage, marked test.fail() so the suite stays green while it's recorded:
// property → fixture key → reason, or { reason, projects } to narrow to some phones.
// When a fix lands, Playwright reports the case as "expected to fail, but passed" —
// delete its entry then. Granularity is per (property, fixture): a known-failing case
// that starts failing for a second reason too stays hidden until the first is fixed.
const KNOWN_FAILURES = {
  'view-height': {},
  'no-hscroll': {},
  'svg-fits': {},
  'tap-targets': {},
  'menu-targets': {},
  'unobstructed': {},
  'flush-context': {},
};

function markKnownFailure(property, fx, testInfo) {
  const entry = KNOWN_FAILURES[property][fx.key];
  if (entry === undefined) return;
  const { reason, projects } = typeof entry === 'string' ? { reason: entry } : entry;
  test.fail(projects === undefined || projects.includes(testInfo.project.name), reason);
}

let built;
let tmpDir;
test.beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-'));
  built = new Map(buildFixtures(tmpDir).map(f => [f.key, f]));
});
test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function load(page, fx) {
  await page.goto('file://' + built.get(fx.key).htmlPath);
  await expect(page.locator('.cell').first()).toBeVisible();
  await dismissIntro(page);
}

// Rects are measured against the layout viewport (clientWidth/Height), the frame
// getBoundingClientRect() reports in.
function viewport() {
  const de = document.documentElement;
  return { width: de.clientWidth, height: de.clientHeight };
}

// Visible elements matching `selector` smaller than MIN_TAP on either side, or with
// heightOnly, in height alone.
function undersized(page, selector, { heightOnly = false } = {}) {
  return page.evaluate(({ selector, min, heightOnly }) =>
    [...document.querySelectorAll(selector)]
      .filter(el => el.checkVisibility())
      .map(el => {
        const r = el.getBoundingClientRect();
        return { el: el.id || el.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter(({ w, h }) => h < min || (!heightOnly && w < min)),
  { selector, min: MIN_TAP, heightOnly });
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

for (const fx of FIXTURES) {
  test.describe(fx.key, () => {
    test('the solving view is exactly one screen high', async ({ page }, testInfo) => {
      markKnownFailure('view-height', fx, testInfo);
      await load(page, fx);
      const box = await page.locator('#solve-view').boundingBox();
      const vp = await page.evaluate(viewport);
      expect(Math.abs(box.height - vp.height)).toBeLessThanOrEqual(EPS);
    });

    test('the page does not scroll horizontally', async ({ page }, testInfo) => {
      markKnownFailure('no-hscroll', fx, testInfo);
      await load(page, fx);
      const { scrollWidth, clientWidth } = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
      });
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    // Distinct from the scroll check: an overflow:hidden ancestor would clip an
    // oversized grid without making the page scrollable.
    test('the puzzle grid fits within the solving stage', async ({ page }, testInfo) => {
      markKnownFailure('svg-fits', fx, testInfo);
      await load(page, fx);
      const svg = await page.locator('#puzzle-svg, #ring-svg, #spiral-svg').boundingBox();
      const stage = await page.locator('#solve-stage').boundingBox();
      expect(svg.x).toBeGreaterThanOrEqual(stage.x - EPS);
      expect(svg.y).toBeGreaterThanOrEqual(stage.y - EPS);
      expect(svg.x + svg.width).toBeLessThanOrEqual(stage.x + stage.width + EPS);
      expect(svg.y + svg.height).toBeLessThanOrEqual(stage.y + stage.height + EPS);
    });

    // Grid cells are exempt: a large board can't give every cell 44px on a phone. So is
    // a drawn key's width: ten keys across a phone can't be 44px wide, and a real phone
    // keyboard's aren't.
    if (CHROME_FIXTURES.includes(fx)) test(`every visible button is at least ${MIN_TAP}px square, a key ${MIN_TAP}px tall`, async ({ page }, testInfo) => {
      markKnownFailure('tap-targets', fx, testInfo);
      await load(page, fx);
      expect(await undersized(page, 'button:not(#drawn-kb button)'), 'buttons').toEqual([]);
      expect(await undersized(page, '#drawn-kb button', { heightOnly: true }), 'keys').toEqual([]);
    });

    if (CHROME_FIXTURES.includes(fx)) test(`every options-menu item is at least ${MIN_TAP}px square`, async ({ page }, testInfo) => {
      markKnownFailure('menu-targets', fx, testInfo);
      await load(page, fx);
      // A short timeout: an intercepted tap otherwise retries for the whole test timeout.
      await page.locator('#menu-btn').tap({ timeout: 5_000 });
      await expect(page.locator('#menu-panel')).toBeVisible();
      expect(await undersized(page, '#menu-panel button, #menu-panel label')).toEqual([]);
    });

    if (CHROME_FIXTURES.includes(fx)) test(`the help menu's item is at least ${MIN_TAP}px square`, async ({ page }) => {
      await load(page, fx);
      await page.locator('#help-btn').tap({ timeout: 5_000 });
      await expect(page.locator('#help-panel')).toBeVisible();
      expect(await undersized(page, '#help-panel button')).toEqual([]);
    });

    test('no on-screen button or grid cell is covered by another element', async ({ page }, testInfo) => {
      markKnownFailure('unobstructed', fx, testInfo);
      await load(page, fx);
      expect(await obstructed(page), 'at load').toEqual([]);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      expect(await obstructed(page), 'scrolled to the bottom').toEqual([]);
    });

    // The solver scrolls the view flush once; from then on a tapped cell, its clue and
    // the keyboard are all on screen together, since the page never scrolls itself.
    // #solve-bar holds every tool's clue bar, Marching Bands' navigator included.
    test('with the view scrolled flush, a tapped cell, the clue bar and the keyboard are all on screen', async ({ page }, testInfo) => {
      markKnownFailure('flush-context', fx, testInfo);
      await load(page, fx);
      await scrollFlush(page);
      const cells = page.locator('.cell');
      const id = await cells.nth(Math.floor((await cells.count()) / 2)).getAttribute('id');
      await page.locator('#' + id).tap({ timeout: 5_000 });
      await expect(page.locator('#' + id)).toHaveClass(/active-cell/);

      const vp = await page.evaluate(viewport);
      const shown = ['.active-cell', '#solve-bar', '#drawn-kb'];
      for (const sel of shown) {
        const box = await page.locator(sel).boundingBox();
        expect(box.y, `${sel} top`).toBeGreaterThanOrEqual(-EPS);
        expect(box.y + box.height, `${sel} bottom`).toBeLessThanOrEqual(vp.height + EPS);
        expect(box.x, `${sel} left`).toBeGreaterThanOrEqual(-EPS);
        expect(box.x + box.width, `${sel} right`).toBeLessThanOrEqual(vp.width + EPS);
        const covered = await page.locator(sel).evaluate(el => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return hit && !el.contains(hit) ? (hit.id || hit.className || hit.tagName) : null;
        });
        expect(covered, `${sel} covered`).toBeNull();
      }
    });
  });
}
