'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { buildPage } = require('../studio/build');
const { startServer } = require('./studio-server');
const { openStudio, downloadText } = require('./helpers');

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

const CHECK_DELAY_MS = 300;   // the diagnostics debounce in studio/src/ui/App.jsx
const REPO = path.resolve(__dirname, '..');
const fixture = (rel) => path.join(REPO, rel);

// ---- helpers ----------------------------------------------------------------

const start = (page) => openStudio(page, server.url);

async function openTemplate(page, kind = 'spiral') {
  await page.locator(`#welcome [data-template="${kind}"]`).click();
  await expect(page.locator('#board')).toBeVisible();
}

async function editAsYaml(page) {
  await page.locator('#btn-edit-yaml').click();
  await expect(page.locator('#yaml-editor')).toBeVisible();
}

async function editorText(page) { return page.locator('#yaml-editor').inputValue(); }

async function setEditorText(page, text) { await page.locator('#yaml-editor').fill(text); }

async function showTest(page) { await page.locator('#phase-steps [data-view="test"]').click(); }
async function showClues(page) { await page.locator('#phase-steps [data-view="clues"]').click(); }
async function showEdit(page) { await page.locator('#phase-steps [data-view="board"]').click(); }

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

// A new 40-cell Spiral with ABC typed (so unfinished), left on the open Export panel.
async function unfinishedSpiralInExport(page) {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await page.locator('#new-size-cells').fill('40');
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
  await page.locator('.sp-cell[data-index="0"]').click();
  await page.locator('#board-input').focus();
  await page.keyboard.type('ABC');
  await openExport(page);
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
  await expect(page.locator('#drafts-note')).toHaveCount(1);   // a tooltip on the Drafts title
});

test('an example shows a preview', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  await showTest(page);
  await expect(page.frameLocator('#preview').locator('.cell').first()).toBeVisible();
});

test('the example opens in the structured editor, with no notice', async ({ page }) => {
  for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
    await start(page);
    await page.locator(`#welcome [data-template="${kind}"]`).click();
    await expect(page.locator('#board')).toBeVisible();
    await expect(page.locator('#message')).toHaveCount(0);
    await expect(page.locator('#phase-steps [data-view="board"]')).toHaveAttribute('aria-current', 'step');
  }
});

// The board's caret mark, whichever kind draws it.
const CARET = '#board .sp-caret, #board .rcaret, #board .grid-caret, #board .text-caret';
const caretMarks = (page) => page.locator(CARET).evaluateAll(els => els.map(el => el.outerHTML).join());

test('opening a template focuses the board, so arrow keys work with no click', async ({ page }) => {
  for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
    await start(page);
    await openTemplate(page, kind);
    await expect(page.locator('#board-input')).toBeFocused();
    const before = await caretMarks(page);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => caretMarks(page), { message: kind }).not.toBe(before);
  }
});

test('reloading into the board phase focuses the board; the Clues phase does not', async ({ page }) => {
  await start(page);
  await openTemplate(page, 'crushword');
  await showClues(page);
  await showEdit(page);
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('vp:studio:draft:')));
  await page.reload();
  await phaseIs(page, 'board');
  await expect(page.locator('#board-input')).toBeFocused();
  await showClues(page);
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('vp:studio:draft:')));
  await page.reload();
  await phaseIs(page, 'clues');
  // The shell focuses the board in a mount effect; let it run first.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('#board-input')).not.toBeFocused();
});

test('Edit as YAML is a toolbar button, disabled while the puzzle is incomplete', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await page.locator('#new-size-cells').fill('40');
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
  // aria-disabled, not disabled: a disabled button shows no tooltip in Firefox.
  const yamlBtn = page.locator('#btn-edit-yaml');
  await expect(yamlBtn).toHaveAttribute('aria-disabled', 'true');
  await expect(yamlBtn).not.toHaveAttribute('disabled');
  await expect(yamlBtn).toHaveAttribute('title', /resolve.*problems.*YAML/i);
  await yamlBtn.click({ force: true });   // Playwright treats aria-disabled as not enabled
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#phase-steps [data-view="board"]')).toHaveAttribute('aria-current', 'step');
});

test('Edit as YAML: the problems chip settles on the real state, not Checking…', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await ready(page);
  await editAsYaml(page);
  await ready(page);
  const original = await editorText(page);
  await setEditorText(page, 'kind: spiral\n');
  await expect(page.locator('#problems-chip')).toContainText(/problem|error/i);
  // And back: the (restored) text is checked again.
  await setEditorText(page, original);
  await ready(page);
  await page.locator('#btn-back-to-editor').click();
  await expect(page.locator('#board')).toBeVisible();
  await ready(page);
});

test('two drafts with identical text: switching between them by address settles the chip', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await page.waitForTimeout(1500);   // autosave debounce
  const first = await page.evaluate(() => location.hash);
  await page.locator('#btn-home').click();
  await openTemplate(page);
  await ready(page);
  await page.waitForTimeout(1500);
  await page.evaluate((h) => { location.hash = h; }, first);
  await expect(page.locator('#board')).toBeVisible();
  await ready(page);
});

test('Edit as YAML and Back to the editor share one slot, and YAML mode has no kind name', async ({ page }) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await start(page);
    await openTemplate(page);
    const toolbarH = () => page.evaluate(() => document.querySelector('#toolbar').getBoundingClientRect().height);
    const boxOf = async (sel) => page.locator(sel).boundingBox();
    const editBox = await boxOf('#btn-edit-yaml');
    const hBefore = await toolbarH();
    await editAsYaml(page);
    await expect(page.locator('#btn-edit-yaml')).toHaveCount(0);
    const back = page.locator('#btn-back-to-editor');
    await expect(back).toBeVisible();
    await expect(back).toHaveClass('btn');
    await expect(page.locator('#toolbar #btn-back-to-editor')).toHaveCount(1);
    await expect(page.locator('#doc-title')).toHaveCount(0);
    await expect(page.locator('#doc-meta')).toHaveCount(0);
    await expect(page.locator('#btn-export')).toBeVisible();
    // Same slot: the button before Export, and the toolbar gains no row.
    const backBox = await boxOf('#btn-back-to-editor');
    const exportBox = await boxOf('#btn-export');
    expect(backBox.x + backBox.width).toBeLessThanOrEqual(exportBox.x + 1);
    if (width === 1280) expect(Math.abs(backBox.y - editBox.y)).toBeLessThanOrEqual(2);
    expect(await toolbarH()).toBeLessThanOrEqual(hBefore + 1);
    await back.click();
    await expect(page.locator('#board')).toBeVisible();
    await expect(page.locator('#btn-edit-yaml')).toBeVisible();
  }
});

test('Undo and Redo buttons show their words and the toolbar fits', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await openTemplate(page);
  await expect(page.locator('#btn-undo')).toHaveText('↶ Undo');
  await expect(page.locator('#btn-redo')).toHaveText('↷ Redo');
  await expect(page.locator('#btn-undo')).toHaveAccessibleName('Undo');
  // Wide: the controls share one row (the toolbar wraps, so scrollWidth proves nothing).
  const mids = await page.evaluate(() => ['#btn-home', '#btn-undo', '#btn-export'].map((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return Math.round(r.top + r.height / 2);
  }));
  expect(Math.max(...mids) - Math.min(...mids), 'one row at 1280').toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // Narrow: it may wrap onto more rows, but nothing scrolls sideways or is clipped.
  await page.setViewportSize({ width: 375, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.evaluate(() => [...document.querySelectorAll('#toolbar button')].every(b => b.getBoundingClientRect().right <= innerWidth))).toBe(true);
});

for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
  test(`${kind}: Tab past the last entry and Shift+Tab before the first leave the board`, async ({ page }) => {
    await start(page);
    await openTemplate(page, kind);
    await expect(page.locator('#board-input')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#board-input'), 'Shift+Tab from the first entry').not.toBeFocused();
    await page.locator('#board-input').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#board-input'), 'one Tab moves within the board').toBeFocused();
    let left = false;
    for (let i = 0; i < 80 && !left; i++) {
      await page.keyboard.press('Tab');
      left = await page.evaluate(() => document.activeElement.id !== 'board-input');
    }
    expect(left, 'Tab leaves after the last entry').toBe(true);
  });
}

test('the disabled Edit as YAML button says why when clicked', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await page.locator('#new-size-cells').fill('40');
  await page.locator('#new-size-create').click();
  await page.locator('#btn-edit-yaml').click({ force: true });
  await expect(page.locator('#message')).toContainText(/resolve.*problems.*YAML/i);
});

test('on a narrow screen Undo and Redo keep their names and the toolbar stays compact', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await start(page);
  await openTemplate(page);
  await expect(page.locator('#btn-undo')).toHaveAccessibleName('Undo');
  await expect(page.locator('#btn-redo')).toHaveAccessibleName('Redo');
  // The words take no room: removing them outright changes nothing about the layout.
  const height = () => page.evaluate(() => document.querySelector('#toolbar').getBoundingClientRect().height);
  const withClip = await height();
  await page.addStyleTag({ content: '.btn-word { display: none !important; }' });
  expect(withClip).toBe(await height());
});

test('the document toolbar has no ⋯ menu', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await expect(page.locator('#btn-more')).toHaveCount(0);
  await expect(page.locator('#btn-edit-yaml')).toBeVisible();
});

test('YAML mode shows YAML › Test-solve', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await expect(page.locator('#phase-steps [data-view="board"]')).toHaveText('YAML');
  await expect(page.locator('#phase-steps [data-view="clues"]')).toHaveCount(0);
});

test('a YAML error shows in the problems list and leaves the preview marked stale', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
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
  await editAsYaml(page);
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

test('the test-solve theme picker restyles the preview and survives a reload', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await showTest(page);
  // Re-resolved on every assertion: the preview frame is replaced when the page rebuilds.
  const body = () => page.frameLocator('#preview').locator('body');
  await expect(page.frameLocator('#preview').locator('.cell').first()).toBeVisible();
  await expect(body()).not.toHaveCSS('font-family', /Outfit/);
  await page.locator('#opt-theme').selectOption('skeleton');
  // Skeleton's body font is Outfit; broadsheet's is not.
  await expect(body()).toHaveCSS('font-family', /Outfit/);
  await page.waitForFunction(() => Object.entries(localStorage)
    .some(([k, v]) => k.startsWith('vp:studio:draft:') && JSON.parse(v).doc.options.previewTheme === 'skeleton'));
  await page.reload();
  await showTest(page);
  await expect(page.locator('#opt-theme')).toHaveValue('skeleton');
});

test('a draft saved before the theme picker reads its preview theme from the file', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  await setEditorText(page, 'theme: skeleton\n' + (await editorText(page)));
  await page.waitForFunction(() => Object.entries(localStorage)
    .some(([k, v]) => k.startsWith('vp:studio:draft:') && /theme: skeleton/.test(JSON.parse(v).doc.yaml)));
  // An older draft has no previewTheme option at all.
  await page.evaluate(() => {
    for (const [k, v] of Object.entries(localStorage)) {
      if (!k.startsWith('vp:studio:draft:')) continue;
      const rec = JSON.parse(v);
      delete rec.doc.options.previewTheme;
      localStorage.setItem(k, JSON.stringify(rec));
    }
  });
  await page.reload();
  await showTest(page);
  await expect(page.locator('#opt-theme')).toHaveValue('skeleton');
  await expect(page.frameLocator('#preview').locator('body')).toHaveCSS('font-family', /Outfit/);
});

test('yaml export works while the puzzle has problems; the page and Hide answers do not', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  await setEditorText(page, (await editorText(page)).replace(/^kind: .*$/m, 'kind: nope'));
  await expect(page.locator('#problems-chip')).toContainText('problem');
  const typed = await editorText(page);
  await openExport(page);
  await expect(page.locator('#export-page')).toBeDisabled();
  await expect(page.locator('.export-hide')).toBeHidden();
  await expect(page.locator('#export-yaml')).toBeEnabled();
  const { text } = await download(page, '#export-yaml');
  expect(text).toBe(typed);
});

test('source YAML exports verbatim', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await setEditorText(page, '# note\n' + (await editorText(page)));
  await ready(page);
  const typed = await editorText(page);
  await openExport(page);
  const { text } = await download(page, '#export-yaml');
  expect(text).toBe(typed);
  expect(text).toContain('# note');
});

test('a page with Hide answers on ships no answers; with it off it does', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  await openExport(page);
  await expect(page.locator('#export-answers [data-value="hidden"]')).toHaveAttribute('aria-pressed', 'false');
  const plain = await download(page, '#export-page');
  expect(plain.text).toMatch(/"letters":/);
  await page.locator('#export-answers [data-value="hidden"]').click();
  const hidden = await download(page, '#export-page');
  expect(hidden.text).toContain('"hashed": true');
  expect(hidden.text).not.toMatch(/"letters":/);
});

test('the font choice appears only for a theme with its own font', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  await openExport(page);
  await expect(page.locator('#export-font')).toHaveCount(0);
  await page.locator('#export-theme').selectOption('skeleton');
  await expect(page.locator('#export-font')).toBeVisible();
  await page.locator('#export-font [data-value="link"]').click();
  const { text } = await download(page, '#export-page');
  expect(text).toContain('fonts.googleapis.com');
});

test('an answers-hidden file opens in build-only mode', async ({ page }) => {
  await start(page);
  await page.setInputFiles('#open-input', fixture('spiral/test/fixtures/test-78.muddled.yaml'));
  await expect(page.locator('#muddled-panel')).toBeVisible();
  await expect(page.locator('#preview')).toBeVisible();
  await expect(page.locator('#phase-steps')).toHaveCount(0);
  await openExport(page);
  await expect(page.locator('#export-answers [data-value="hidden"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#export-answers [data-value="hidden"]')).toBeDisabled();
  await expect(page.locator('#export-page')).toBeEnabled();
});

test('an answers-hidden file says so, never "muddled"', async ({ page }) => {
  await start(page);
  await page.setInputFiles('#open-input', fixture('spiral/test/fixtures/test-78.muddled.yaml'));
  await expect(page.locator('#doc-meta')).toContainText('Answers hidden');
  await expect(page.locator('#studio')).not.toHaveText(/muddl/i);
  await expect(page.locator('#muddled-panel')).not.toHaveAttribute('aria-label', /muddl/i);
  await openExport(page);
  await expect(page.locator('#export-answers')).toBeVisible();
  // Only the download's `.muddled.yaml` suffix may say it: the file-type name from
  // exportFileName (filenames.js), matching the CLI's muddle output.
  const text = (await page.locator('#studio').innerText()).replaceAll('.muddled.yaml', '');
  expect(text).not.toMatch(/muddl/i);
});

test("an answers-hidden file's theme can be changed and exported", async ({ page }) => {
  await start(page);
  const original = yaml.load(fs.readFileSync(fixture('spiral/test/fixtures/test-78.muddled.yaml'), 'utf8'));
  await page.setInputFiles('#open-input', fixture('spiral/test/fixtures/test-78.muddled.yaml'));
  await expect(page.locator('#muddled-panel')).toBeVisible();
  await openExport(page);
  await page.locator('#export-theme').selectOption('skeleton');
  await expect(page.locator('#export-yaml')).toBeEnabled();
  const { text } = await download(page, '#export-yaml');
  const out = yaml.load(text);
  expect(out.theme).toBe('skeleton');
  expect(out.boardHash).toBe(original.boardHash);
});

test('export starts from the preview theme each time it opens', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await showTest(page);
  await page.locator('#opt-theme').selectOption('skeleton');
  await openExport(page);
  await expect(page.locator('#export-theme')).toHaveValue('skeleton');
  await page.locator('#export-theme').selectOption('broadsheet');
  await page.locator('#export-close').click();
  await openExport(page);
  await expect(page.locator('#export-theme')).toHaveValue('skeleton');
  await page.locator('#export-close').click();
  await expect(page.locator('#opt-theme')).toHaveValue('skeleton');
});

test('export opened while a check is pending: page and Hide answers wait, yaml saves, checkmark kept', async ({ page }) => {
  await page.clock.install();
  await start(page);
  await openTemplate(page);
  await showTest(page);
  await page.locator('#opt-hashed').check();
  await editAsYaml(page);
  await ready(page);
  // Freeze time so the edit's check cannot land: the puzzle stays valid, only pending.
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  const edited = (await editorText(page)).replace(/^title:.*$/m, 'title: "Pending Title"');
  await setEditorText(page, edited);
  // Preact runs effects (the check's timer, the dialog's showModal) on animation frames,
  // which the paused clock holds back; a short run lets them through, well inside the
  // debounce.
  await page.clock.runFor(50);
  await page.locator('#btn-export').click();
  await page.clock.runFor(50);
  await expect(page.locator('#export-panel')).toBeVisible();
  await expect(page.locator('#export-page')).toBeDisabled();
  await expect(page.locator('.export-hide')).toBeVisible();
  await expect(page.locator('#export-answers [data-value="hidden"]')).toBeDisabled();
  await expect(page.locator('#export-answers [data-value="hidden"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#export-answers-note')).not.toContainText('already has its answers hidden');
  await expect(page.locator('#export-theme')).toBeEnabled();
  // The yaml button saves the text as typed; the download needs no clock tick.
  const { text } = await download(page, '#export-yaml');
  expect(text).toBe(edited);
  // The check lands: both come back and the checkmark was kept.
  await page.clock.runFor(CHECK_DELAY_MS + 50);
  await expect(page.locator('#export-page')).toBeEnabled();
  await expect(page.locator('#export-answers [data-value="hidden"]')).toBeEnabled();
  await expect(page.locator('#export-answers [data-value="hidden"]')).toHaveAttribute('aria-pressed', 'true');
});

test('export opened while a check is pending on unparseable YAML: theme already locked', async ({ page }) => {
  await page.clock.install();
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await setEditorText(page, 'kind: [\n');
  await page.clock.runFor(50);
  await page.locator('#btn-export').click();
  await page.clock.runFor(50);
  await expect(page.locator('#export-panel')).toBeVisible();
  await expect(page.locator('#export-theme')).toBeDisabled();
  await expect(page.locator('#export-theme-reason')).toContainText('doesn’t parse');
});

test('export while the YAML does not parse: theme locked with a reason, yaml saves as typed', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  const broken = 'kind: [\n';
  await setEditorText(page, broken);
  await expect(page.locator('#problems-chip')).toHaveText('YAML error');
  await openExport(page);
  await expect(page.locator('#export-theme')).toBeDisabled();
  await expect(page.locator('#export-theme-reason')).toContainText('doesn’t parse');
  await expect(page.locator('#export-yaml-note')).toContainText('Saved as it stands, problems included.');
  const { text } = await download(page, '#export-yaml');
  expect(text).toBe(broken);
});

test('opening Export causes no horizontal page scroll at 1280x800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page);
  await openTemplate(page);
  await openExport(page);
  await page.locator('#export-theme').selectOption('skeleton');
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(fits).toBe(true);
});

test('an unfinished puzzle saves a draft that reopens', async ({ page }) => {
  await unfinishedSpiralInExport(page);
  await expect(page.locator('#export-page')).toBeDisabled();
  await expect(page.locator('#export-page-note')).toContainText('Finish the puzzle first');
  await expect(page.locator('#export-theme')).toBeDisabled();
  await expect(page.locator('#export-theme-reason')).toHaveCount(0);
  await expect(page.locator('.export-hide')).toBeHidden();
  const { dl } = await download(page, '#export-yaml');
  expect(dl.suggestedFilename()).toMatch(/\.json$/);
  const file = path.join(dir, 'draft.json');
  await dl.saveAs(file);
  await page.locator('#export-close').click();
  await page.goto(server.url);
  await page.setInputFiles('#open-input', file);
  await expect(page.locator('#board')).toBeVisible();
  for (const [i, ch] of ['A', 'B', 'C'].entries()) {
    await expect(page.locator(`.sp-ltr[data-index="${i}"]`)).toHaveText(ch);
  }
});

test('the exported yaml carries the export theme', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await openExport(page);
  await page.locator('#export-theme').selectOption('skeleton');
  const { text } = await download(page, '#export-yaml');
  expect(yaml.load(text).theme).toBe('skeleton');
});

async function makeDraft(page, title) {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await ready(page);
  await setEditorText(page, (await editorText(page)).replace(/^title:.*$/m, `title: "${title}"`));
  await ready(page);
  await page.waitForTimeout(1500); // autosave debounce
}

test('drafts survive a reload', async ({ page }) => {
  await makeDraft(page, 'My Edited Title');
  await page.reload();
  // A reload returns to the open puzzle, not the start screen.
  await expect(page.locator('#yaml-editor')).toHaveValue(/title: "My Edited Title"/);
  // The title shown after a reload is the checked one; the export's file name carries it.
  await ready(page);
  await openExport(page);
  const { dl } = await download(page, '#export-yaml');
  expect(dl.suggestedFilename()).toMatch(/my-edited-title/i);
  await page.locator('#export-close').click();
  await page.locator('#btn-home').click();
  await expect(page.locator('.draft-item').filter({ hasText: 'My Edited Title' })).toBeVisible();
});

// ---- Back and Forward --------------------------------------------------------

const phaseIs = (page, view) =>
  expect(page.locator(`#phase-steps [data-view="${view}"]`)).toHaveAttribute('aria-current', 'step');

test('Back and Forward step between the start screen, a puzzle and its phases', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await expect(page).toHaveURL(/#\/d\/[^/]+\/board$/);
  const title = await page.locator('#header-title').inputValue();
  await showClues(page);
  await showTest(page);
  await phaseIs(page, 'test');
  await page.goBack();
  await phaseIs(page, 'clues');
  await page.goBack();
  await phaseIs(page, 'board');
  await page.goBack();
  await expect(page.locator('#welcome')).toBeVisible();
  await page.goForward();
  await phaseIs(page, 'board');
  await expect(page.locator('#header-title')).toHaveValue(title);
});

test('reload returns to the same puzzle and phase', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  const title = await page.locator('#header-title').inputValue();
  await showClues(page);
  await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('vp:studio:draft:')));
  await page.reload();
  await phaseIs(page, 'clues');
  await expect(page.locator('#header-title')).toHaveValue(title);
});

test('Back right after creating a puzzle still restores it on Forward', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await page.locator('#new-size-cells').fill('40');
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
  await page.locator('.sp-cell[data-index="0"]').click();
  await page.locator('#board-input').focus();
  await page.keyboard.type('ABC');
  await page.goBack();
  await expect(page.locator('#welcome')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#board')).toBeVisible();
  for (const [i, ch] of ['A', 'B', 'C'].entries()) {
    await expect(page.locator(`.sp-ltr[data-index="${i}"]`)).toHaveText(ch);
  }
});

test('Back across Edit as YAML lands in the current mode', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await showClues(page);
  await editAsYaml(page);
  const text = await editorText(page);
  await page.goBack();
  await expect(page.locator('#yaml-editor')).toBeVisible();
  expect(await editorText(page)).toBe(text);
  await expect(page).toHaveURL(/\/yaml$/);
});

test('an address for a puzzle not in this browser lands on the start screen with a note', async ({ page }) => {
  await page.goto(server.url);
  await page.goto(server.url + '?boot#/d/nope/clues');   // a new document, so this is a boot
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.locator('#message')).toContainText('isn’t saved in this browser');
  // The bad address was rewritten, not added to: Back returns to the earlier page.
  await expect(page).toHaveURL(/#\/$/);
  await page.goBack();
  await expect(page).not.toHaveURL(/\?boot/);
});

test('leaving right after a reload keeps the draft\'s title in the list', async ({ page }) => {
  await makeDraft(page, 'Quick Leave');
  await page.reload();
  await page.locator('#btn-home').click();
  await expect(page.locator('.draft-item').filter({ hasText: 'Quick Leave' })).toBeVisible();
});

test('opening one editor popover closes another', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await page.locator('#btn-cell').click();
  await expect(page.locator('#cell-menu')).toBeVisible();
  await page.locator('#btn-keys').click();
  await expect(page.locator('#keys')).toBeVisible();
  await expect(page.locator('#cell-menu')).toHaveCount(0);
  await page.locator('#btn-cell').click();
  await expect(page.locator('#cell-menu')).toBeVisible();
  await expect(page.locator('#keys')).toHaveCount(0);
  await page.locator('#btn-home').click();
  await openTemplate(page, 'crushword');
  await page.locator('#btn-grid').click();
  await expect(page.locator('#grid-settings')).toBeVisible();
  await page.locator('#btn-keys').click();
  await expect(page.locator('#keys')).toBeVisible();
  await expect(page.locator('#grid-settings')).toHaveCount(0);
  await page.locator('#btn-grid').click();
  await expect(page.locator('#grid-settings')).toBeVisible();
  await expect(page.locator('#keys')).toHaveCount(0);
});

test('Grid… sits in the Board toolbar only, for kinds with settings', async ({ page }) => {
  await start(page);
  await openTemplate(page, 'crushword');
  await expect(page.locator('#btn-grid')).toBeVisible();
  await expect(page.locator('#btn-details')).toHaveCount(0);
  await showClues(page);
  await expect(page.locator('#btn-grid')).toHaveCount(0);
  await page.locator('#btn-home').click();
  await openTemplate(page, 'spiral');
  await expect(page.locator('#btn-grid')).toHaveCount(0);
});

test('an editor popover closes when the phase changes', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await page.locator('#btn-keys').click();
  await expect(page.locator('#keys')).toBeVisible();
  await showClues(page);
  await expect(page.locator('#keys')).toHaveCount(0);
});

test('Back closes the Export dialog with the screen', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await showClues(page);
  await openExport(page);
  await page.goBack();
  await expect(page.locator('#export-panel')).toHaveCount(0);
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

test('a YAML-mode file exports its text verbatim, comments included, and reopens', async ({ page }) => {
  await start(page);
  await openTemplate(page);
  await editAsYaml(page);
  await setEditorText(page, '# keep me\n' + (await editorText(page)));
  await openExport(page);
  const { dl, text } = await download(page, '#export-yaml');
  expect(text).toContain('# keep me');
  const saved = path.join(dir, dl.suggestedFilename());
  await dl.saveAs(saved);
  await page.locator('#export-close').click();
  await page.locator('#btn-home').click();
  await page.setInputFiles('#open-input', saved);
  // A Spiral file reopens in its structured editor, which does not keep comments.
  await expect(page.locator('#board')).toBeVisible();
});

test('the preview reports a solve', async ({ page }) => {
  await start(page);
  await page.setInputFiles('#open-input', fixture('snake-charmer/test/fixtures/circle-8.yaml'));
  await editAsYaml(page);     // a Snake Charmer file opens in its editor; this test drives the page
  await ready(page);
  await showTest(page);
  await expect(page.frameLocator('#preview').locator('.cell').first()).toBeVisible();
  const frame = srcdocFrame(page);
  const letters = await frame.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const l of letters) await frame.locator('#hidden-input').fill(l.toUpperCase());
  await expect(page.locator('#preview-solved')).toBeVisible();
});

test('opening a draft file does not overwrite the draft it was saved from', async ({ page }) => {
  await unfinishedSpiralInExport(page);
  const { dl } = await download(page, '#export-yaml');
  const saved = path.join(dir, 'old.json');
  await dl.saveAs(saved);
  await page.locator('#export-close').click();
  await page.locator('#board-input').focus();
  await page.keyboard.type('D');
  await expect(page.locator('.sp-ltr[data-index="3"]')).toHaveText('D');
  await page.waitForTimeout(1500); // autosave debounce
  await page.locator('#btn-home').click();
  await expect(page.locator('.draft-item')).toHaveCount(1);
  await page.setInputFiles('#open-input', saved);
  await expect(page.locator('.sp-ltr[data-index="2"]')).toHaveText('C');
  await expect(page.locator('.sp-ltr[data-index="3"]')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.locator('#btn-home').click();
  await expect(page.locator('.draft-item')).toHaveCount(2);
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


// ---- laptop layout ---------------------------------------------------------

// The largest board of each kind among examples/ and its test/fixtures/ (by cell count; a
// Crushword's by grid area), with a cell to click.
const LARGEST = [
  { kind: 'spiral', file: 'spiral/test/fixtures/test-122.yaml', cell: '.sp-cell[data-index="60"]' },
  { kind: 'snake-charmer', file: 'snake-charmer/test/fixtures/double-turn-96.yaml', cell: '.rc[data-k="20"]' },
  { kind: 'marching-bands', file: 'marching-bands/test/fixtures/mb-17.yaml', cell: 'rect.grid-cell[data-r="3"][data-c="3"]' },
  { kind: 'crushword', file: 'examples/crushword.yaml', cell: 'rect.grid-cell[data-r="1"][data-c="1"]' },
];

for (const { kind, file, cell } of LARGEST) {
  test(`at 1280×800 the board and the selected clue are both on screen (${kind})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await start(page);
    await page.setInputFiles('#open-input', fixture(file));
    await expect(page.locator('#board')).toBeVisible();
    await page.locator(cell).click();
    const inside = (box) => box.x >= 0 && box.y >= 0 && box.x + box.width <= 1280 && box.y + box.height <= 800;
    const fits = () => page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight);
    // The Board phase: the board fits, and the page doesn't scroll.
    expect(inside(await page.locator('#board').boundingBox())).toBe(true);
    expect(await fits()).toBe(true);
    // The Clues phase: the selected clue is on screen too. Its row scrolls into view in
    // the clue column after paint, so poll.
    await page.locator('#phase-steps [data-view="clues"]').click();
    await expect(page.locator('.clue-row.on .clue-input')).toBeVisible();
    await expect.poll(async () => inside(await page.locator('.clue-row.on .clue-input').boundingBox())).toBe(true);
    expect(inside(await page.locator('#board').boundingBox())).toBe(true);
    expect(await fits()).toBe(true);
  });
}

// ---- placeholder clues ------------------------------------------------------

const { placeholderClue } = require('../studio/src/model/placeholderClues');

// One kind: everything past each kind's mapEntries (unit-tested per kind) is shared code.
{
  const kind = 'spiral';
  test(`${kind}: an unclued entry shows placeholder text in Test-solve only`, async ({ page }) => {
    await start(page);
    await openTemplate(page, kind);
    await showClues(page);
    const first = page.locator('.clue-input').first();
    await first.fill('');
    await expect(page.locator('#problems-chip')).toContainText('problem');
    await showTest(page);
    const frame = page.frameLocator('#preview');
    await expect(page.locator('#preview-placeholders')).toBeVisible();
    await expect(page.locator('#preview-stale')).toHaveCount(0);
    await expect(frame.locator('body')).toContainText(placeholderClue(0));
    // Nothing reached the document: Export offers the draft, which has no placeholder.
    await page.locator('#btn-export').click();
    await expect(page.locator('#export-page')).toBeDisabled();
    const draft = await downloadText(page, '#export-yaml');
    expect(draft).not.toContain('Lorem ipsum');
    await page.keyboard.press('Escape');
    // Real clues everywhere: no note.
    await showClues(page);
    await page.locator('#btn-fill-clues').click();
    await showTest(page);
    await expect(page.locator('#preview-placeholders')).toBeHidden();
  });
}

// Each editor passes its own fillClues, so this one runs for every kind.
for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
  test(`${kind}: Fill empty clues fills only the empty ones, as one undo step`, async ({ page }) => {
    await start(page);
    await openTemplate(page, kind);
    await showClues(page);
    const inputs = page.locator('.clue-input');
    await expect(page.locator('#btn-fill-clues')).toBeDisabled();
    const kept = await inputs.nth(1).inputValue();
    await inputs.first().fill('');
    await expect(page.locator('#btn-fill-clues')).toBeEnabled();
    await page.locator('#btn-fill-clues').click();
    await expect(inputs.first()).toHaveValue(placeholderClue(0));
    await expect(inputs.nth(1)).toHaveValue(kept);
    await expect(page.locator('#btn-fill-clues')).toBeDisabled();
    await page.locator('#btn-undo').click();
    await expect(inputs.first()).toHaveValue('');
    await expect(inputs.nth(1)).toHaveValue(kept);
    await expect(page.locator('#btn-fill-clues')).toBeEnabled();
  });
}

test('the embedded legend font is available', async ({ page }) => {
  await start(page);
  // load() resolves with the faces it matched, so an empty list means there's no Jost
  // face at all. check() would return true in that case too.
  const faces = await page.evaluate(async () =>
    (await document.fonts.load('500 12px Jost')).map(f => ({ family: f.family.replace(/["']/g, ''), status: f.status })));
  expect(faces).toEqual([{ family: 'Jost', status: 'loaded' }]);
});

test('a latching key toggles from anywhere on it and shows keyboard focus', async ({ page, browserName }) => {
  await start(page); await openTemplate(page); await showTest(page);
  const key = page.locator('label.latch-key').filter({ has: page.locator('#opt-phone') });
  const box = await key.boundingBox();
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);   // the key's far edge
  await expect(page.locator('#opt-phone')).toBeChecked();
  if (browserName === 'webkit') {
    await page.locator('#opt-phone').focus();
  } else {
    await page.locator('#opt-hashed').focus(); await page.keyboard.press('Tab');
  }
  await expect(page.locator('#opt-phone')).toBeFocused();
  // WebKit doesn't treat a script focus as keyboard focus, and its Tab never reaches a
  // checkbox, so the ring can't be exercised there.
  if (browserName !== 'webkit') expect(await key.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
});
test('a locked latching key cannot be toggled', async ({ page }) => {
  await start(page);
  await page.setInputFiles('#open-input', fixture('spiral/test/fixtures/test-78.muddled.yaml'));
  const key = page.locator('label.latch-key').filter({ has: page.locator('#opt-hashed') });
  await key.click({ force: true });
  await expect(page.locator('#opt-hashed')).toBeChecked();
  await expect(page.locator('#opt-hashed')).toBeDisabled();
});
test('a direction latch presses one key and lights its LED', async ({ page }) => {
  await start(page); await openTemplate(page);
  await page.locator('#cut-toggle [data-cut="outward"]').click();
  await expect(page.locator('#cut-toggle [data-cut="outward"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#cut-toggle [data-cut="inward"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#cut-toggle [data-cut="outward"] .led.ch2.lit')).toHaveCount(1);
});

test('the side column starts with the Puzzle box, the checks sit under the board, and long answers wrap', async ({ page }) => {
  await start(page); await openTemplate(page, 'crushword');
  const side = page.locator('.phase-side-col');
  await expect(side.locator(':scope > *').first()).toHaveAttribute('id', 'puzzle-box');
  // The checks are outside the scrolling column, so a row reveal never scrolls them away.
  await expect(page.locator('.phase-board-col #checks')).toHaveCount(1);
  await expect(side.locator('#checks')).toHaveCount(0);
  for (const sheet of await page.locator('#word-list .sheet').all())
    expect(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.locator('#word-list .list.ch1 .ch-tag')).toHaveText('CH 1');
});
test('a check shows its state as a mark, not only as an LED color', async ({ page }) => {
  await start(page); await openTemplate(page, 'crushword');
  await expect(page.locator('#grid-check-sym .mark')).toHaveText('✓');
});

test('the toolbar stays on one row at 1280×800, even with its longest status', async ({ page }) => {
  // Failing storage gives the widest save status ("Not saved: browser storage is
  // unavailable").
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page); await openTemplate(page, 'crushword');
  await expect(page.locator('#save-status')).toHaveClass(/failed/);
  const bar = await page.locator('#toolbar').boundingBox();
  // Centers, not tops: the phase keys carry pilot LEDs above them and are taller.
  const mids = await page.locator('#toolbar .step, #btn-export, #btn-home').evaluateAll(els =>
    els.map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
  expect(Math.max(...mids) - Math.min(...mids)).toBeLessThan(12);
  expect(bar.height).toBeLessThanOrEqual(80);
  await expect(page.locator('#toolbar .step-sep')).toHaveCount(0);
});

test('the drafts sheet numbers its rows, shows no edit time, and wraps long titles', async ({ page }) => {
  // One unbroken word: a title with spaces wraps without overflow-wrap: anywhere.
  await makeDraft(page, 'Supercalifragilisticexpialidocious'.repeat(4));
  await page.locator('#btn-home').click();
  const row = page.locator('tr.draft-item').first();
  await expect(row.locator('td.no')).toHaveText('01');
  await expect(row).not.toContainText('edited');
  await expect(page.locator('.track-sheet tr.blank')).toHaveCount(4);
  expect(await page.locator('.track-sheet').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
test('deleting a draft asks inside its row', async ({ page }) => {
  await makeDraft(page, 'Row Confirm'); await page.locator('#btn-home').click();
  const row = page.locator('tr.draft-item').filter({ hasText: 'Row Confirm' });
  await row.locator('.draft-delete').click();
  await expect(row.locator('td.actions .draft-confirm .draft-delete-yes')).toBeVisible();
});

test('deleting a draft keeps keyboard focus on a key of its row', async ({ page }) => {
  await makeDraft(page, 'Focus Keeper'); await page.locator('#btn-home').click();
  const row = page.locator('tr.draft-item').filter({ hasText: 'Focus Keeper' });
  await row.locator('.draft-delete').focus(); await page.keyboard.press('Enter');
  await expect(row.locator('.draft-delete-no')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row.locator('.draft-delete')).toBeFocused();
});

for (const kind of ['spiral', 'snake-charmer', 'marching-bands', 'crushword']) {
  test(`${kind}: the Keys popover lists each key with what it does`, async ({ page }) => {
    await start(page); await openTemplate(page, kind);
    await page.locator('#btn-keys').click();
    const items = page.locator('#keys ul.keys-list > li');
    expect(await items.count()).toBeGreaterThanOrEqual(6);
    for (const li of await items.all()) {
      await expect(li.locator('kbd').first()).toBeVisible();
      expect((await li.innerText()).replace(/\s+/g, ' ').trim().length).toBeGreaterThan(6);
    }
  });
}

test('the Puzzle box stacks the title, byline and instructions, in every phase', async ({ page }) => {
  await start(page); await openTemplate(page);
  await page.locator('#header-title').fill('Short');
  const box = sel => page.locator(sel).evaluate(el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, b: r.bottom }; });
  for (const view of ['clues', 'board']) {
    await page.locator(`#phase-steps [data-view="${view}"]`).click();
    await expect(page.locator('.phase-side-col > #puzzle-box')).toBeVisible();
    const title = await box('#header-title'), by = await box('.hs-byline'), ins = await box('.hs-instructions-wrap');
    expect(by.t).toBeGreaterThanOrEqual(title.b - 1);
    expect(ins.t).toBeGreaterThanOrEqual(by.b - 1);
    // One left edge: a column, not a ragged line.
    expect(Math.abs(by.l - title.l)).toBeLessThan(1);
  }
});
test('the toolbar does not shift when the problems label changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page); await openTemplate(page, 'crushword');
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  const boxes = () => page.evaluate(() => ['#save-status', '#phase-steps', '#problems-chip', '#btn-undo', '#btn-export']
    .map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.left), Math.round(r.width), Math.round(r.top)]; }));
  const before = await boxes();
  // Block a cell: the label changes, and so does the status text at the left.
  await page.locator('#board .grid-cell').nth(30).click();
  await page.keyboard.press('#');
  await expect(page.locator('#problems-chip')).not.toContainText('Ready to export');
  expect(await boxes()).toEqual(before);
});

test('hovering the collapsed instructions underlines them, as the title does', async ({ page }) => {
  await start(page); await openTemplate(page);
  const line = page.locator('.hs-instructions-line');
  await expect(line).toBeVisible();
  await page.mouse.move(2, 2);   // the click that opened the example may have left it over the line
  expect(await line.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
  await line.hover({ force: true });   // the invisible textarea lies over it
  expect(await line.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
});

test('the drafts sheet shows a kind as its icon alone, and the delete confirm is two tidy lines', async ({ page }) => {
  await makeDraft(page, 'Kind Check'); await page.locator('#btn-home').click();
  const row = page.locator('tr.draft-item').filter({ hasText: 'Kind Check' });
  // The kind is a name for assistive tech and a tooltip, never visible text.
  await expect(row.locator('td.kind')).toHaveAttribute('title', /\w/);
  await expect(row.locator('td.kind .sr-only')).toHaveCount(1);
  expect(await row.locator('td.kind').evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(80);
  await row.locator('.draft-delete').click();
  const yes = await row.locator('.draft-delete-yes').boundingBox();
  const no = await row.locator('.draft-delete-no').boundingBox();
  const msg = await row.locator('.draft-confirm-text').boundingBox();
  // Buttons side by side on one line, under a one-line message.
  expect(Math.abs((yes.y + yes.height / 2) - (no.y + no.height / 2))).toBeLessThan(4);
  expect(msg.y + msg.height).toBeLessThanOrEqual(yes.y + 2);
  expect(msg.height).toBeLessThan(24);
});

// What each kind's Cell… menu offers. Crushword has no rebus mode: a cell holds several
// letters natively. Insert and Delete cell belong to the two kinds whose cell count is
// edited here, and only in the Board phase.
const CELL_MENUS = {
  spiral: ['btn-circle', 'btn-rebus', 'btn-insert-before', 'btn-insert-after', 'btn-delete-cell'],
  'snake-charmer': ['btn-circle', 'btn-rebus', 'btn-insert-before', 'btn-insert-after', 'btn-delete-cell'],
  'marching-bands': ['btn-circle', 'btn-rebus'],
  crushword: ['btn-circle', 'btn-block'],
};
for (const [kind, ids] of Object.entries(CELL_MENUS)) {
  test(`${kind}: the Cell… menu replaces the Circle key and lists its cell actions`, async ({ page }) => {
    await start(page); await openTemplate(page, kind);
    await expect(page.locator('#btn-circle')).toHaveCount(0);   // closed: nothing loose in the tools row
    await page.locator('#btn-cell').click();
    await expect(page.locator('#cell-menu [role^="menuitem"]')).toHaveCount(ids.length);
    for (const id of ids) await expect(page.locator(`#cell-menu #${id}`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#cell-menu')).toHaveCount(0);
  });
}
test('the Cell… menu circles a cell, enters rebus mode, and hands focus back to the board', async ({ page }) => {
  await start(page); await openTemplate(page, 'spiral');
  await page.locator('#btn-cell').click();
  const was = await page.locator('#cell-menu #btn-circle').getAttribute('aria-checked');
  await page.locator('#cell-menu #btn-circle').click();
  await expect(page.locator('#board-input')).toBeFocused();
  await page.locator('#btn-cell').click();
  await expect(page.locator('#cell-menu #btn-circle')).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
  await page.locator('#cell-menu #btn-rebus').click();
  await page.locator('#btn-cell').click();
  await expect(page.locator('#cell-menu #btn-rebus')).toHaveAttribute('aria-checked', 'true');
});
test('Crushword blocks a cell from the Cell… menu', async ({ page }) => {
  await start(page); await openTemplate(page, 'crushword');
  const blocks = () => page.locator('#board .grid-block').count();
  const before = await blocks();
  await cellMenuItemFor(page, 'btn-block');
  expect(await blocks()).not.toBe(before);
});
async function cellMenuItemFor(page, id) { await page.locator('#btn-cell').click(); await page.locator(`#cell-menu #${id}`).click(); }
test('the Clues phase keeps a Cell… menu without the structural items', async ({ page }) => {
  await start(page); await openTemplate(page, 'spiral');
  await page.locator('#phase-steps [data-view="clues"]').click();
  await page.locator('#btn-cell').click();
  await expect(page.locator('#cell-menu #btn-circle')).toBeVisible();
  await expect(page.locator('#cell-menu #btn-insert-after')).toHaveCount(0);
});

// Selecting an entry that is already in view must not scroll the side column, and a
// crossing row far away must not drag the active row to an edge.
for (const kind of ['snake-charmer', 'spiral', 'crushword']) {
  for (const view of ['board', 'clues']) {
    test(`${kind}: selecting a visible entry in the ${view} phase leaves the side column where it is`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await start(page); await openTemplate(page, kind);
      await page.locator(`#phase-steps [data-view="${view}"]`).click();
      const rowSel = view === 'clues' ? '.clue-row' : '.word-row';
      const pick = view === 'clues' ? '.clue-label' : '.word-pick';
      const col = page.locator('.phase-side-col');
      // The first rows that are fully inside the column right now.
      const visible = await page.locator(rowSel).evaluateAll(rows => {
        const c = document.querySelector('.phase-side-col').getBoundingClientRect();
        return rows.map((r, i) => [i, r.getBoundingClientRect()]).filter(([, b]) => b.top >= c.top + 4 && b.bottom <= c.bottom - 4).map(([i]) => i);
      });
      expect(visible.length).toBeGreaterThan(2);
      const before = await col.evaluate(el => el.scrollTop);
      await page.locator(rowSel).nth(visible[2]).locator(pick).click();
      await page.waitForTimeout(250);
      expect(await col.evaluate(el => el.scrollTop)).toBe(before);
    });
  }
}

test('the side column runs the full height beside the board column', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page); await openTemplate(page, 'crushword');
  for (const view of ['board', 'clues']) {
    await page.locator(`#phase-steps [data-view="${view}"]`).click();
    const side = await page.locator('.phase-side-col').boundingBox();
    const boardCol = await page.locator('.phase-board-col').boundingBox();
    expect(Math.abs(side.y - boardCol.y)).toBeLessThan(2);                     // level at the top
    expect(side.x).toBeGreaterThanOrEqual(boardCol.x + boardCol.width - 1);   // to its right
  }
});
test('with no instructions the field is a quiet prompt, and a long title never shrinks it away', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await start(page); await openTemplate(page);
  await page.locator('#header-instructions').fill('');
  await page.locator('#header-title').click();
  const wrap = page.locator('.hs-instructions-wrap');
  expect(await wrap.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // It looks and acts clickable: a pointer cursor, and a visible change on hover.
  const target = page.locator('#header-instructions');
  expect(await target.evaluate(el => getComputedStyle(el).cursor)).toBe('pointer');
  const line = page.locator('.hs-instructions-line');
  const before = await line.evaluate(el => getComputedStyle(el).textDecorationLine + getComputedStyle(el).color);
  await wrap.hover({ force: true });
  expect(await line.evaluate(el => getComputedStyle(el).textDecorationLine + getComputedStyle(el).color)).not.toBe(before);
  await page.locator('#header-instructions').fill('Read each clue twice.');
  await page.locator('#header-title').fill('An exceedingly long puzzle title that keeps on going and going '.repeat(2));
  expect((await wrap.boundingBox()).width).toBeGreaterThan(280);
});

test('clicking a draft\'s title opens it, and Delete is a key', async ({ page }) => {
  await makeDraft(page, 'Open By Title'); await page.locator('#btn-home').click();
  const row = page.locator('tr.draft-item').filter({ hasText: 'Open By Title' });
  await expect(row.locator('.draft-open')).toHaveText('Open By Title');
  await expect(row.locator('.btn.draft-delete')).toBeVisible();
  await expect(row.locator('.btn.quiet')).toHaveCount(0);
  await row.locator('.draft-open').click();
  await expect(page.locator('#yaml-editor')).toBeVisible();   // makeDraft saves a YAML-mode draft
  await expect(page.locator('#yaml-editor')).toHaveValue(/title: "?Open By Title/);
});

test('a long title wraps inside the Puzzle box at a smaller size, and every field has a limit', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await start(page); await openTemplate(page);
  const title = page.locator('#header-title');
  const sizeOf = () => title.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await title.fill('A');
  const short = await sizeOf();
  const oneLine = (await title.boundingBox()).height;
  // Up to the limit, the title stays inside the box, smaller and over more lines.
  await title.fill('W'.repeat(80));   // maxlength trims it
  expect(await title.inputValue()).toHaveLength(60);
  expect(await sizeOf()).toBeLessThan(short);
  expect((await title.boundingBox()).height).toBeGreaterThan(oneLine);
  const inner = await title.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight + 1);
  expect(inner).toBe(true);
  const tb = await title.boundingBox(), pb = await page.locator('#puzzle-box').boundingBox();
  expect(tb.x + tb.width).toBeLessThanOrEqual(pb.x + pb.width + 1);
  expect(await page.locator('.ed.structured').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  // Author and date have limits too.
  await page.locator('#header-author').fill('x'.repeat(100));
  expect((await page.locator('#header-author').inputValue()).length).toBeLessThan(100);
  await page.locator('#header-date').fill('x'.repeat(100));
  expect((await page.locator('#header-date').inputValue()).length).toBeLessThan(30);
});

test('a long drafts list scrolls inside its panel, and the drafts note is a tooltip on the title', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const entries = Array.from({ length: 16 }, (_, i) => ({ id: `d${i}`, title: `Draft ${i + 1}`, kind: 'spiral', updatedAt: 1000 + i }));
    localStorage.setItem('vp:studio:drafts', JSON.stringify(entries));
  });
  await start(page);
  await expect(page.locator('tr.draft-item')).toHaveCount(16);
  const scrolls = (sel) => page.locator(sel).evaluate(el => el.scrollHeight > el.clientHeight + 1);
  expect(await scrolls('.ts-scroll')).toBe(true);     // the panel scrolls ...
  expect(await scrolls('#welcome')).toBe(false);      // ... and the page doesn't
  // The note is out of the way until the title is hovered or focused.
  const note = page.locator('#drafts-note');
  await expect(note).toBeHidden();
  await page.locator('.ts-title').hover();
  await expect(note).toBeVisible();
  await expect(note).toContainText('Drafts save as you work');
  // It floats above the panel, so it never covers the drafts themselves.
  const tip = await note.boundingBox(), sheet = await page.locator('.track-sheet').boundingBox();
  expect(tip.y + tip.height).toBeLessThanOrEqual(sheet.y + 1);
  await page.mouse.move(2, 2);
  await expect(note).toBeHidden();
  await page.locator('.ts-title').focus();
  await expect(note).toBeVisible();
});

test('⌘← and ⌘→ in the board step browser history, which a text field would otherwise eat', async ({ page }) => {
  await start(page);
  await openTemplate(page, 'spiral');
  await showClues(page);
  await page.locator('#board-input').focus();
  await page.keyboard.press('Meta+ArrowLeft');
  await expect(page.locator('#phase-steps [data-view="board"]')).toHaveAttribute('aria-current', 'step');
  await page.locator('#board-input').focus();
  await page.keyboard.press('Meta+ArrowRight');
  await expect(page.locator('#phase-steps [data-view="clues"]')).toHaveAttribute('aria-current', 'step');
});
