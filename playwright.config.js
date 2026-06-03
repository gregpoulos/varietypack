'use strict';

const { defineConfig } = require('@playwright/test');

// Browser-engine end-to-end tests. Run with `npm run test:e2e` (separate from the
// `node:test` unit suite, which never loads these specs). See TODOS.md for the
// broader plan to cover all three tools' engines.
module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    browserName: 'chromium',
  },
});
