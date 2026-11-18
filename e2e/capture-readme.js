#!/usr/bin/env node
'use strict';

// Regenerates the README's screenshots, docs/images/<kind>.png: each example, in the
// default theme, as a 1280×900 desktop page in Chromium. Not a test. Run it when the
// look of a page changes, and review the diff before committing: fonts and rendering
// differ by machine, so a regeneration elsewhere changes every image.
//
//   npm run capture:readme

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { spawnSync } = require('child_process');
const playwright = require('@playwright/test');
const { KINDS } = require('../shared/build/tools');

const ROOT = path.join(__dirname, '..');
const IMAGES = path.join(ROOT, 'docs', 'images');

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-readme-'));
  const browser = await playwright.chromium.launch();
  try {
    // Builds the examples the way a user would, so the shots show the default theme.
    const res = spawnSync(process.execPath, [path.join(ROOT, 'cli.js'), 'build', path.join(ROOT, 'examples'), '-o', tmpDir],
      { stdio: ['ignore', 'ignore', 'inherit'] });
    if (res.status !== 0) throw new Error('building the examples failed');

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    for (const kind of KINDS) {
      await page.goto('file://' + path.join(tmpDir, `${kind}.html`));
      await page.locator('.cell').first().waitFor();
      const file = path.join(IMAGES, `${kind}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
