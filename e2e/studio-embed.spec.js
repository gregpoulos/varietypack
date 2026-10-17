'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { startServer, serveStudio } = require('./studio-server');
const { buildPuzzle } = require('../snake-charmer/cli');
const { sha256hex } = require('../shared/sha256hex.mjs');

const REPO = path.resolve(__dirname, '..');
const FIXTURE = path.join(REPO, 'snake-charmer/test/fixtures/circle-8.yaml');
// circle-8's ring reads a a b b b c c c; the hashed page has no letters, so the test
// types them.
const RING = 'aabbbccc';

let hostDir, host;
test.beforeAll(async () => {
  hostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-embed-'));
  fs.writeFileSync(path.join(hostDir, 'host.html'), `<!doctype html><meta charset="utf-8"><title>Host</title>
<iframe id="puzzle" style="width:900px;height:3000px;border:0"></iframe>
<script>
  document.getElementById('puzzle').src = new URLSearchParams(location.search).get('p');
  window.__msgs = [];
  addEventListener('message', function (e) { window.__msgs.push(e.data); });
</script>`);
  host = await startServer(hostDir);
});
test.afterAll(async () => { await host.close(); fs.rmSync(hostDir, { recursive: true, force: true }); });

// Each test builds its own page, so parallel workers never rewrite one another's file.
let built = 0;
function buildFor(embedOrigin) {
  const name = `puzzle-${process.pid}-${built++}.html`;
  buildPuzzle(FIXTURE, path.join(hostDir, name), { muddle: true, ...(embedOrigin ? { embedOrigin } : {}) });
  return name;
}

async function openHost(page, name) {
  await page.goto(`${host.url}host.html?p=${name}`);
  await expect(page.frameLocator('#puzzle').locator('#hidden-input')).toBeAttached();
}

async function solve(page) {
  const input = page.frameLocator('#puzzle').locator('#hidden-input');
  for (const ch of RING) await input.fill(ch);
}

const messages = (page, type) => page.evaluate(t => window.__msgs.filter(m => m && m.type === t), type);

test('an embedded puzzle reports its content height, not the frame\'s', async ({ page }) => {
  await openHost(page, buildFor(host.url.replace(/\/$/, '')));
  await expect.poll(async () => (await messages(page, 'varietypack:resize')).length).toBeGreaterThan(0);
  const [first] = await messages(page, 'varietypack:resize');
  expect(first.height).toBeGreaterThan(0);
  expect(first.height).toBeLessThan(3000);     // the frame is 3000px tall; the page's own height is what's reported
});

test('a solve posts the solution to the named origin', async ({ page }) => {
  await openHost(page, buildFor(host.url.replace(/\/$/, '')));
  await solve(page);
  await expect.poll(async () => (await messages(page, 'varietypack:complete')).length).toBe(1);
  const [done] = await messages(page, 'varietypack:complete');
  expect(typeof done.solution).toBe('string');
  expect(sha256hex(done.solution)).toBe(done.boardHash);
});

test('a solve is not posted to a different origin', async ({ page }) => {
  await openHost(page, buildFor('https://elsewhere.example'));
  await solve(page);
  await page.waitForTimeout(1000);
  expect(await messages(page, 'varietypack:complete')).toHaveLength(0);
});

test.describe('the studio', () => {
  let studio;
  test.beforeAll(async () => { studio = await serveStudio(); });
  test.afterAll(async () => { await studio.close(); });

  async function openFixture(page) {
    await page.goto(studio.url);
    await page.setInputFiles('#open-input', FIXTURE);
    await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  }

  test('the embed dialog downloads an embeddable build', async ({ page }) => {
    await openFixture(page);
    await page.locator('#btn-export').click();
    await page.locator('#export-embed').click();
    await expect(page.locator('#embed-dialog')).toBeVisible();
    await expect(page.locator('#btn-embed-download')).toBeDisabled();
    await page.locator('#embed-origin').fill('https://hunt.example.com/path');
    await expect(page.locator('#embed-origin-error')).toContainText('must be an origin like');
    await expect(page.locator('#btn-embed-download')).toBeDisabled();
    await page.locator('#embed-origin').fill('https://hunt.example.com');
    await expect(page.locator('#embed-origin-error')).toHaveCount(0);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-embed-download').click()]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    expect(text).toContain('"embedOrigin": "https://hunt.example.com"');
    expect(text).toContain('"hashed": true');
    await expect(page.locator('#embed-snippet')).toHaveValue(/data-varietypack/);
  });

  test('theme overrides are edited in the puzzle settings and reach the built page', async ({ page }) => {
    await openFixture(page);
    await page.locator('#btn-add-token').click();
    await page.locator('#theme-tokens .token-name').selectOption('color-bg');
    await page.locator('#theme-tokens .token-value').fill('#abc123');
    await expect(page.locator('#theme-tokens .token-row')).toHaveCount(1);
    await expect(page.locator('#problems-chip')).toContainText('Ready to export');
    await page.locator('#btn-export').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#export-html').click()]);
    expect(fs.readFileSync(await dl.path(), 'utf8')).toContain('--theme-color-bg: #abc123;');
  });

  test('an unsafe override value is reported and blocks export', async ({ page }) => {
    await openFixture(page);
    await page.locator('#btn-add-token').click();
    await page.locator('#theme-tokens .token-name').selectOption('color-bg');
    await page.locator('#theme-tokens .token-value').fill('red; background: url(x)');
    await expect(page.locator('#problems-chip')).toContainText('problem');
  });

  test('clearing an override value keeps the row and leaves the puzzle exportable', async ({ page }) => {
    await openFixture(page);
    await page.locator('#btn-add-token').click();
    await page.locator('#theme-tokens .token-name').selectOption('color-bg');
    await page.locator('#theme-tokens .token-value').fill('#abc123');
    await page.locator('#theme-tokens .token-value').fill('');
    await expect(page.locator('#theme-tokens .token-row')).toHaveCount(1);
    await expect(page.locator('#theme-tokens .token-name')).toHaveValue('color-bg');
    await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  });
});
