'use strict';

const { defineConfig, devices } = require('@playwright/test');

// Browser-engine end-to-end tests. Run with `npm run test:e2e` (separate from the
// `node:test` unit suite, which never loads these specs). Covers all four tools'
// engines.
//
// WebKit is not redundant with Chromium. The two disagree on whether a cancelled
// pointer event still produces a `click` for touch input, which is exactly the
// mechanism #rebus-btn's focus preservation rests on — a Chromium-only suite reported
// green while the button was inert on iOS. Note that even under WebKit this only
// surfaces via `tap()`; `click()` fires either way. See the touch-tap test in
// e2e/snake-charmer.spec.js.
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
});
