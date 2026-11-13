'use strict';

const { defineConfig, devices } = require('@playwright/test');
const { PHONES } = require('./e2e/mobile');

const PHONE_SPECS = /(mobile|phone)\.spec\.js/;

// Browser-engine end-to-end tests. Run with `npm run test:e2e` (separate from the
// `node:test` unit suite, which never loads these specs). Covers all four tools'
// engines.
//
// WebKit is not redundant with Chromium: the two disagree on touch `click` after a
// canceled pointer event. See setupRebusButton in shared/engine-chrome.mjs, and the
// touch-tap test in e2e/snake-charmer.spec.js.
//
// The mobile projects run only e2e/mobile.spec.js, e2e/phone.spec.js,
// e2e/landscape-phone.spec.js and e2e/zoom-phone.spec.js (the phone layout, which only
// a touch-first device gets). PHONE_SPECS picks them by name: a new phone spec must end
// in `phone.spec.js`. They run under real phone descriptors (viewport, DPR, touch,
// isMobile). They still drive a desktop browser's input stack — no soft keyboard, no
// IME — and Playwright's WebKit is not iOS Safari, so they catch layout regressions,
// not every phone-only bug. The desktop projects skip all four.
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A stray `test.only` would otherwise let CI pass on a fraction of the suite.
  forbidOnly: !!process.env.CI,
  use: { screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: PHONE_SPECS },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] }, testIgnore: PHONE_SPECS },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] }, testIgnore: PHONE_SPECS },
    ...PHONES.map(({ project, device }) => ({
      // Traces only here: recording one for every desktop test costs ~45% of the run.
      name: project, use: { ...devices[device], trace: 'retain-on-failure' }, testMatch: PHONE_SPECS,
    })),
  ],
});
