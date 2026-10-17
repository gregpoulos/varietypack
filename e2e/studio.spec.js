'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { buildPage } = require('../studio/build');
const { startServer } = require('./studio-server');

let server, dir;

test.beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-e2e-'));
  fs.writeFileSync(path.join(dir, 'index.html'), await buildPage(), 'utf8');
  server = await startServer(dir);
});

test.afterAll(async () => {
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('studio page loads without errors', async ({ page }) => {
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.goto(server.url);
  await expect(page.locator('#app')).toBeVisible();
  expect(problems).toEqual([]);
});

const REPO = path.resolve(__dirname, '..');
const fixture = (rel) => path.join(REPO, rel);

// ---- helpers ----------------------------------------------------------------

async function start(page) {
  await page.goto(server.url);
  await expect(page.locator('#welcome')).toBeVisible();
}

async function openTemplate(page, kind = 'spiral') {
  await page.locator(`#welcome [data-template="${kind}"]`).click();
  await expect(page.locator('#yaml-editor')).toBeVisible();
}

async function editorText(page) { return page.locator('#yaml-editor').inputValue(); }

async function setEditorText(page, text) { await page.locator('#yaml-editor').fill(text); }

async function showTest(page) { await page.locator('#view-switch [data-view="test"]').click(); }
async function showEdit(page) { await page.locator('#view-switch [data-view="edit"]').click(); }

async function ready(page) {
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
}

async function download(page, clickSelector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(clickSelector).click()]);
  return { dl, text: fs.readFileSync(await dl.path(), 'utf8') };
}

async function openExport(page) {
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-panel')).toBeVisible();
}

function srcdocFrame(page) { return page.frames().find(f => f.url() === 'about:srcdoc'); }

// ---- tests ------------------------------------------------------------------

test('the start screen offers every kind, its example, and the drafts note', async ({ page }) => {
  await start(page);
  await expect(page.locator('#welcome .kind-card')).toHaveCount(4);
  for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
    await expect(page.locator(`#welcome [data-kind="${kind}"]`)).toBeVisible();
    await expect(page.locator(`#welcome [data-template="${kind}"]`)).toBeVisible();
  }
  await expect(page.locator('#drafts-note')).toBeVisible();
});

test('an example opens in YAML mode and shows a preview', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await showTest(page);
  await expect(page.frameLocator('#preview').locator('.cell').first()).toBeVisible();
});

test('a YAML error shows in the problems list and leaves the preview marked stale', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await setEditorText(page, (await editorText(page)) + '\nfoo: [unclosed');
  await expect(page.locator('#problems-chip')).toHaveText('YAML error');
  await page.locator('#problems-chip').click();
  await expect(page.locator('#diagnostics .diag-parse')).toBeVisible();
  await showTest(page);
  await expect(page.locator('#preview-stale')).toBeVisible();
  await expect(page.frameLocator('#preview').locator('.cell').first()).toBeVisible();
});

test('switching views keeps a test-solve in progress', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await showTest(page);
  const frame = page.frameLocator('#preview');
  await expect(frame.locator('.cell').first()).toBeVisible();
  await frame.locator('#hidden-input').fill('A');
  await expect(frame.locator('#letter-1')).toHaveText('A');
  await showEdit(page);
  await showTest(page);
  await expect(frame.locator('#letter-1')).toHaveText('A');
});

test('export is blocked while the puzzle has errors', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await setEditorText(page, (await editorText(page)).replace(/^kind: .*$/m, 'kind: nope'));
  await expect(page.locator('#problems-chip')).toContainText('problem');
  await openExport(page);
  await expect(page.locator('#export-blocked')).toBeVisible();
  await expect(page.locator('#export-hashed')).toBeDisabled();
});

test('source YAML exports verbatim', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await setEditorText(page, '# note\n' + (await editorText(page)));
  await ready(page);
  const typed = await editorText(page);
  await openExport(page);
  const { text } = await download(page, '#export-source');
  expect(text).toBe(typed);
  expect(text).toContain('# note');
});

test('hashed HTML ships no answers', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await openExport(page);
  const { text } = await download(page, '#export-hashed');
  expect(text).toContain('"hashed": true');
  expect(text).not.toMatch(/"letters":/);
});

test('the font choice appears only for a theme with its own font', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await openExport(page);
  await expect(page.locator('#export-font')).toHaveCount(0);
  await page.locator('#export-close').click();
  await setEditorText(page, (await editorText(page)) + '\ntheme: skeleton\n');
  await ready(page);
  await openExport(page);
  await expect(page.locator('#export-font')).toBeVisible();
  await page.locator('input[name="export-font"][value="link"]').check();
  const { text } = await download(page, '#export-html');
  expect(text).toContain('fonts.googleapis.com');
});

test('a muddled file opens in build-only mode', async ({ page }) => {
  await start(page);
  await page.setInputFiles('#open-input', fixture('spiral/test/fixtures/test-78.muddled.yaml'));
  await expect(page.locator('#muddled-panel')).toBeVisible();
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#view-switch')).toHaveCount(0);
  await openExport(page);
  await expect(page.locator('#export-source')).toHaveCount(0);
  await expect(page.locator('#export-html')).toHaveCount(0);
  await expect(page.locator('#export-hashed')).toBeEnabled();
});

test("a muddled file's theme can be changed and exported", async ({ page }) => {
  await start(page);
  const original = yaml.load(fs.readFileSync(fixture('spiral/test/fixtures/test-78.muddled.yaml'), 'utf8'));
  await page.setInputFiles('#open-input', fixture('spiral/test/fixtures/test-78.muddled.yaml'));
  await expect(page.locator('#muddled-panel')).toBeVisible();
  await page.locator('#muddled-theme').selectOption('skeleton');
  await openExport(page);
  await expect(page.locator('#export-muddled')).toBeEnabled();
  const { text } = await download(page, '#export-muddled');
  const out = yaml.load(text);
  expect(out.theme).toBe('skeleton');
  expect(out.boardHash).toBe(original.boardHash);
});

async function makeDraft(page, title) {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await setEditorText(page, (await editorText(page)).replace(/^title:.*$/m, `title: "${title}"`));
  await expect(page.locator('#doc-title')).toHaveText(title);
  await page.waitForTimeout(1500); // autosave debounce
}

test('drafts survive a reload', async ({ page }) => {
  await makeDraft(page, 'My Edited Title');
  await page.reload();
  await expect(page.locator('.draft-item').filter({ hasText: 'My Edited Title' })).toBeVisible();
  await page.locator('.draft-item').filter({ hasText: 'My Edited Title' }).locator('.draft-open').click();
  await expect(page.locator('#yaml-editor')).toHaveValue(/title: "My Edited Title"/);
});

test('deleting a draft asks first', async ({ page }) => {
  await makeDraft(page, 'Doomed Draft');
  await page.locator('#btn-home').click();
  const item = page.locator('.draft-item').filter({ hasText: 'Doomed Draft' });
  await item.locator('.draft-delete').click();
  await expect(item.locator('.draft-confirm')).toBeVisible();
  await item.locator('.draft-delete-no').click();
  await expect(item).toBeVisible();
  await item.locator('.draft-delete').click();
  await item.locator('.draft-delete-yes').click();
  await expect(page.locator('.draft-item').filter({ hasText: 'Doomed Draft' })).toHaveCount(0);
});

test('a draft file round-trips', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await setEditorText(page, '# keep me\n' + (await editorText(page)));
  const typed = await editorText(page);
  await page.locator('#btn-more').click();
  const { dl } = await download(page, '#btn-save-draft');
  expect(dl.suggestedFilename()).toMatch(/\.vpstudio\.json$/);
  const saved = path.join(dir, dl.suggestedFilename());
  await dl.saveAs(saved);
  await page.locator('#btn-home').click();
  await page.setInputFiles('#open-input', saved);
  await expect(page.locator('#yaml-editor')).toHaveValue(typed);
});

test('the preview reports a solve', async ({ page }) => {
  await start(page);
  await page.setInputFiles('#open-input', fixture('snake-charmer/test/fixtures/circle-8.yaml'));
  await page.locator('#btn-edit-yaml').click();     // a Snake Charmer file opens in its editor; this test drives the page
  await expect(page.locator('#yaml-editor')).toBeVisible();
  await ready(page);
  await showTest(page);
  await expect(page.frameLocator('#preview').locator('.cell').first()).toBeVisible();
  const frame = srcdocFrame(page);
  const letters = await frame.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const l of letters) await frame.locator('#hidden-input').fill(l.toUpperCase());
  await expect(page.locator('#preview-solved')).toBeVisible();
});

test('opening a draft file does not overwrite the draft it was saved from', async ({ page }) => {
  await makeDraft(page, 'First Version');
  await page.locator('#btn-more').click();
  const { dl } = await download(page, '#btn-save-draft');
  const saved = path.join(dir, 'old.vpstudio.json');
  await dl.saveAs(saved);
  await setEditorText(page, (await editorText(page)).replace(/^title:.*$/m, 'title: "Second Version"'));
  await expect(page.locator('#doc-title')).toHaveText('Second Version');
  await page.waitForTimeout(1500); // autosave debounce
  await page.locator('#btn-home').click();
  await page.setInputFiles('#open-input', saved);
  await expect(page.locator('#yaml-editor')).toHaveValue(/First Version/);
  await page.waitForTimeout(1500);
  await page.locator('#btn-home').click();
  await expect(page.locator('.draft-item').filter({ hasText: 'Second Version' })).toBeVisible();
  await expect(page.locator('.draft-item').filter({ hasText: 'First Version' })).toBeVisible();
});

test('a failed index write leaves the previous draft intact, not a half-saved one', async ({ page }) => {
  await makeDraft(page, 'First Title');
  const draftBody = () => page.evaluate(() => {
    const k = Object.keys(localStorage).find(x => x.startsWith('vp:studio:draft:'));
    return k ? localStorage.getItem(k) : null;
  });
  const before = await draftBody();
  expect(before).toContain('First Title');
  // Storage fills up between the draft body and the index.
  await page.evaluate(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'vp:studio:drafts') throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, k, v);
    };
  });
  await setEditorText(page, (await editorText(page)).replace(/^title:.*$/m, 'title: "Second Title"'));
  await expect(page.locator('#save-status')).toHaveClass(/failed/, { timeout: 5000 });
  expect(await draftBody()).toBe(before);
});

