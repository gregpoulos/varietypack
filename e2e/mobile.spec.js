'use strict';

// Phone-layout properties, run only under the mobile projects in playwright.config.js
// (one per PHONES entry in e2e/mobile.js) against every FIXTURES puzzle, except the
// tap-target sizes: those come from each tool's chrome, not the puzzle's geometry, so
// they run on the first fixture of each tool. Each property is stated so that any
// correct layout passes it — no pixel positions, no screenshots.
//
// Device emulation supplies a phone viewport, DPR, touch and isMobile, but still drives
// a desktop browser's input stack: no soft keyboard, no IME. Nothing here covers those.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { FIXTURES, buildFixtures } = require('./mobile');

const MIN_TAP = 44; // px — Apple HIG minimum touch target
const EPS = 1;      // px of slack for sub-pixel layout rounding in viewport bounds

// The first fixture of each tool, where the chrome-only properties (tap targets) run.
const CHROME_FIXTURES = FIXTURES.filter((f, i) => FIXTURES.findIndex(g => g.tool === f.tool) === i);

// Known breakage, marked test.fail() so the suite stays green while it's recorded:
// property → fixture key → reason, or { reason, projects } to narrow to some phones.
// When a fix lands, Playwright reports the case as "expected to fail, but passed" —
// delete its entry then. Granularity is per (property, fixture): a known-failing case
// that starts failing for a second reason too stays hidden until the first is fixed.
const everyChromeFixture = reason => Object.fromEntries(CHROME_FIXTURES.map(f => [f.key, reason]));
const KNOWN_FAILURES = {
  'no-hscroll': {
    'marching-bands/mb-17': 'the grid renders 578px wide, overflowing the phone viewport',
  },
  'svg-fits': {
    'marching-bands/mb-17': 'the grid renders 578px wide, overflowing the phone viewport',
  },
  'tap-targets': everyChromeFixture(
    '#menu-btn and #keys-btn are 32px, #check-btn 33px tall; the ring tools add #rebus-btn ' +
    'and their two mode/clue-list tabs at 27–28px tall'),
  'menu-targets': {
    ...everyChromeFixture('#clear-btn is 27px and the Check Cell toggle label 30px tall'),
    'marching-bands/mb-17': '#clear-btn is 27px and the Check Cell toggle label 30px tall; ' +
      'on Pixel 8 the overflow widens the layout viewport, pushing the fixed #menu-btn off-screen',
  },
  'unobstructed': {
    'marching-bands/mb-17': { reason: '#menu-btn sits over a grid cell at load', projects: ['mobile-webkit'] },
  },
  'tap-context': {
    'marching-bands/mb-17': {
      reason: 'the pinned grid box is taller than the screen (the grid renders 578px wide), ' +
        'so the active clue group has no room below it',
      projects: ['mobile-webkit'],
    },
  },
  'opaque-pinned': {},
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
}

// Rects are measured against the layout viewport (clientWidth/Height), the frame
// getBoundingClientRect() reports in.
function viewport() {
  const de = document.documentElement;
  return { width: de.clientWidth, height: de.clientHeight };
}

// Visible elements matching `selector` smaller than MIN_TAP on either side.
function undersized(page, selector) {
  return page.evaluate(({ selector, min }) =>
    [...document.querySelectorAll(selector)]
      .filter(el => el.checkVisibility())
      .map(el => {
        const r = el.getBoundingClientRect();
        return { el: el.id || el.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter(({ w, h }) => w < min || h < min),
  { selector, min: MIN_TAP });
}

// Visible buttons and grid cells whose center is on screen but not the topmost
// element there — i.e. a tap at that point would land on something else. With
// allowScrollUnder, in-flow content covered by a sticky/fixed element is exempt: that
// is ordinary scrolling under a pinned bar, not a layout defect. Anything pinned that
// is covered still counts — it's meant to stay usable at every scroll position.
// Off-screen centers are skipped, so this is blind to a fixed control pushed off the
// edge by horizontal overflow (Chromium widens the layout viewport to fit it) — that
// case is the no-hscroll check's to catch.
function obstructed(page, { allowScrollUnder }) {
  return page.evaluate(allowScrollUnder => {
    const de = document.documentElement;
    const pinned = el => {
      for (let n = el; n instanceof Element; n = n.parentElement) {
        const { position } = getComputedStyle(n);
        if (position === 'sticky' || position === 'fixed') return true;
      }
      return false;
    };
    return [...document.querySelectorAll('button, .cell')]
      .filter(el => el.checkVisibility())
      .flatMap(el => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x < 0 || y < 0 || x >= de.clientWidth || y >= de.clientHeight) return [];
        const hit = document.elementFromPoint(x, y);
        if (hit === el || el.contains(hit)) return [];
        if (allowScrollUnder && hit && !pinned(el) && pinned(hit)) return [];
        return [{ el: el.id || el.textContent.trim().slice(0, 20), coveredBy: hit && (hit.id || hit.tagName) }];
      });
  }, allowScrollUnder);
}

for (const fx of FIXTURES) {
  test.describe(fx.key, () => {
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
    test('the puzzle grid fits within the viewport width', async ({ page }, testInfo) => {
      markKnownFailure('svg-fits', fx, testInfo);
      await load(page, fx);
      const box = await page.locator('#puzzle-svg, #ring-svg, #spiral-svg').boundingBox();
      const vp = await page.evaluate(viewport);
      expect(box.x).toBeGreaterThanOrEqual(-EPS);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width + EPS);
    });

    // Grid cells are exempt: a large board can't give every cell 44px on a phone.
    if (CHROME_FIXTURES.includes(fx)) test(`every visible button is at least ${MIN_TAP}px square`, async ({ page }, testInfo) => {
      markKnownFailure('tap-targets', fx, testInfo);
      await load(page, fx);
      expect(await undersized(page, 'button')).toEqual([]);
    });

    if (CHROME_FIXTURES.includes(fx)) test(`every options-menu item is at least ${MIN_TAP}px square`, async ({ page }, testInfo) => {
      markKnownFailure('menu-targets', fx, testInfo);
      await load(page, fx);
      // A short timeout: an intercepted tap otherwise retries for the whole test timeout.
      await page.locator('#menu-btn').tap({ timeout: 5_000 });
      await expect(page.locator('#menu-panel')).toBeVisible();
      expect(await undersized(page, '#menu-panel button, #menu-panel label')).toEqual([]);
    });

    // Hit-testing rather than rectangle intersection: sticky grids legitimately cover
    // content scrolled beneath them, which is also why clue items aren't checked.
    test('no on-screen button or grid cell is covered by another element', async ({ page }, testInfo) => {
      markKnownFailure('unobstructed', fx, testInfo);
      await load(page, fx);
      expect(await obstructed(page, { allowScrollUnder: false }), 'at load').toEqual([]);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      expect(await obstructed(page, { allowScrollUnder: true }), 'scrolled to the bottom').toEqual([]);
    });

    // Clue text scrolls beneath a pinned grid, so the grid must hide it rather than draw
    // over it. Hit-testing can't see transparency, hence reading the background itself.
    test('a pinned box over the clues paints an opaque background', async ({ page }, testInfo) => {
      markKnownFailure('opaque-pinned', fx, testInfo);
      await load(page, fx);
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const seeThrough = await page.evaluate(() => {
        const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const clues = [...document.querySelectorAll('.clue-item')].map(el => el.getBoundingClientRect());
        return [...document.querySelectorAll('body *')]
          .filter(el => getComputedStyle(el).position === 'sticky' && el.checkVisibility())
          .filter(el => clues.some(c => overlaps(c, el.getBoundingClientRect())))
          .filter(el => {
            const bg = getComputedStyle(el).backgroundColor;
            return bg === 'transparent' || /^rgba\(.*,\s*0?\.?\d*\)$/.test(bg) && !/,\s*1\)$/.test(bg);
          })
          .map(el => el.className || el.tagName);
      });
      expect(seeThrough).toEqual([]);
    });

    // Run at load and again scrolled to the bottom, where a clue near the top of the list
    // starts out behind a pinned grid: "on screen" means visible, not covered by it.
    test('tapping a cell keeps both it and its clue on screen', async ({ page }, testInfo) => {
      markKnownFailure('tap-context', fx, testInfo);
      await load(page, fx);
      const cells = page.locator('.cell');
      // Marching Bands has no active-clue bar; its active clue group carries
      // .active-clue.
      const clue = (await page.locator('#active-clue-bar').count()) ? '#active-clue-bar' : '.active-clue';

      const expectContextShown = async when => {
        await expect(page.locator('.active-cell')).toBeVisible();
        const vp = await page.evaluate(viewport);
        for (const sel of ['.active-cell', clue]) {
          const box = await page.locator(sel).first().boundingBox();
          expect(box.y, `${when}: ${sel} top`).toBeGreaterThanOrEqual(-EPS);
          expect(box.y + box.height, `${when}: ${sel} bottom`).toBeLessThanOrEqual(vp.height + EPS);
          expect(box.x, `${when}: ${sel} left`).toBeGreaterThanOrEqual(-EPS);
          expect(box.x + box.width, `${when}: ${sel} right`).toBeLessThanOrEqual(vp.width + EPS);
          const covered = await page.locator(sel).first().evaluate(el => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return hit && !el.contains(hit) ? (hit.id || hit.className || hit.tagName) : null;
          });
          expect(covered, `${when}: ${sel} covered`).toBeNull();
        }
      };

      await cells.nth(Math.floor((await cells.count()) / 2)).tap({ timeout: 5_000 });
      await expectContextShown('at load');

      // Any cell wholly on screen and tappable there: a tall grid's top rows may have
      // left the screen, and an unpinned grid (Spiral, Snake Charmer) has scrolled away
      // entirely.
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const reachable = await page.evaluate(() => {
        const de = document.documentElement;
        for (const el of document.querySelectorAll('.cell')) {
          const r = el.getBoundingClientRect();
          const onScreen = r.left >= 0 && r.top >= 0 && r.right <= de.clientWidth && r.bottom <= de.clientHeight;
          if (onScreen && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el) return el.id;
        }
        return null;
      });
      if (reachable) {
        await page.locator('#' + reachable).tap({ timeout: 5_000 });
        await expectContextShown('scrolled to the bottom');
      }
    });
  });
}
