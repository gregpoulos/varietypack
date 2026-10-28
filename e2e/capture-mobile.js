#!/usr/bin/env node
'use strict';

// On-demand phone screenshots for reviewing layouts during mobile work — not a test,
// asserts nothing, commits nothing. Renders each puzzle on every PHONES profile
// (e2e/mobile.js) and prints the path of each PNG.
//
//   npm run capture:mobile                          # the mobile.spec.js fixtures
//   npm run capture:mobile -- <yaml-or-dir>... [-o <dir>]
//
// Output defaults to a temp directory (cleared each run) rather than test-results/,
// which every `playwright test` run wipes. A directory given with -o is never cleared.

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { spawnSync } = require('child_process');
const playwright = require('@playwright/test');
const { PHONES, buildFixtures, dismissIntro } = require('./mobile');
const parseCliArgs = require('../shared/cli/parseCliArgs');

// Builds each path (a .yaml or a directory of them) through the dispatcher, so the
// puzzle kind is auto-detected. One subdirectory per path keeps same-named puzzles
// from different tools apart.
function buildPaths(paths, tmpDir) {
  return paths.flatMap((p, i) => {
    const outDir = path.join(tmpDir, String(i));
    fs.mkdirSync(outDir);
    // build's -o names the output directory for a directory input, the file otherwise.
    const out = fs.statSync(p).isDirectory() ? outDir : path.join(outDir, path.basename(p, '.yaml') + '.html');
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.js'), 'build', p, '-o', out],
      { stdio: ['ignore', 'ignore', 'inherit'] });
    if (res.status !== 0) throw new Error(`build failed for ${p}`);
    return fs.readdirSync(outDir).filter(f => f.endsWith('.html'))
      .map(f => ({ name: `${i}-${path.basename(f, '.html')}`, htmlPath: path.join(outDir, f) }));
  });
}

async function capture(puzzles, outDir) {
  for (const { device } of PHONES) {
    const descriptor = playwright.devices[device];
    const browser = await playwright[descriptor.defaultBrowserType].launch();
    const context = await browser.newContext(descriptor);
    const phoneDir = path.join(outDir, device.replace(/\W+/g, '-').replace(/-$/, ''));
    fs.mkdirSync(phoneDir, { recursive: true });
    for (const { name, htmlPath } of puzzles) {
      const page = await context.newPage();
      await page.goto('file://' + htmlPath);
      await page.locator('.cell').first().waitFor();
      const shot = async (state, opts) => {
        const file = path.join(phoneDir, `${name}--${state}.png`);
        await page.screenshot({ path: file, ...opts });
        console.log(file);
      };
      await shot('load');
      await dismissIntro(page);
      await shot('full', { fullPage: true });
      const cells = page.locator('.cell');
      await cells.nth(Math.floor((await cells.count()) / 2)).tap();
      await shot('tapped');
      await page.close();
    }
    await browser.close();
  }
}

async function main() {
  const { values, positionals } = parseCliArgs(process.argv.slice(2), { output: { type: 'string', short: 'o' } });
  const defaultOut = path.join(os.tmpdir(), 'varietypack-mobile-captures');
  const outDir = path.resolve(values.output ?? defaultOut);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-mobile-'));
  try {
    const puzzles = positionals.length
      ? buildPaths(positionals, tmpDir)
      : buildFixtures(tmpDir).map(f => ({ name: f.key.replace('/', '--'), htmlPath: f.htmlPath }));
    // Only the default directory is cleared of earlier runs — never one the caller named.
    if (values.output === undefined) fs.rmSync(outDir, { recursive: true, force: true });
    await capture(puzzles, outDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
