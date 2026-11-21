'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { serveStudio } = require('./studio-server');
const { expectGridFits, expectTabLeavesClues, openGrid, openStudio, openStudioFile, downloadText: download, typeBoard: type, showPhase } = require('./helpers');
const { clickGapLine } = require('./helpers');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { HOOKS } = require('../marching-bands/src/builder');

let studio;
test.beforeAll(async () => { studio = await serveStudio(); });
test.afterAll(async () => { await studio.close(); });

const REPO = path.resolve(__dirname, '..');
const FIXTURES = path.join(REPO, 'marching-bands/test/fixtures');
const fixture = (name) => path.join(FIXTURES, name);

// ---- helpers ----------------------------------------------------------------

const start = (page) => openStudio(page, studio.url);

async function newGrid(page, size = 5) {
  await start(page);
  await page.locator('#welcome [data-kind="marching-bands"]').click();
  await page.locator('#new-size-size').fill(String(size));
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
}

const openFile = (page, file) => openStudioFile(page, studio.url, file);

const cell = (page, r, c) => page.locator(`rect.grid-cell[data-r="${r}"][data-c="${c}"]`);
const letter = (page, r, c) => page.locator(`text.grid-letter[data-r="${r}"][data-c="${c}"]`);
const mode = (page, m) => page.locator(`#cut-toggle [data-cut="${m}"]`);

// ---- tests ------------------------------------------------------------------

test('the size prompt previews the grid', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="marching-bands"]').click();
  await expect(page.locator('#new-size-size')).toHaveValue('13');
  await expect(page.locator('#size-preview svg rect')).toHaveCount(169);
  await expect(page.locator('#size-preview svg rect.t-blk')).toHaveCount(1);
  await page.locator('#new-size-size').fill('12');
  await expect(page.locator('#size-preview svg rect')).toHaveCount(144);
  await expect(page.locator('#size-preview svg rect.t-blk')).toHaveCount(0);
  await expect(page.locator('#size-summary')).toContainText('12 × 12');
  await page.locator('#new-size-size').fill('30');
  await expect(page.locator('#size-preview svg')).toHaveCount(0);
  await expect(page.locator('#size-preview')).toContainText('Choose a whole number from 3 to 25.');
});

test('a new Marching Bands opens with a black center', async ({ page }) => {
  await newGrid(page, 5);
  await expect(page.locator('rect.grid-cell')).toHaveCount(24);
  await expect(page.locator('rect.grid-block')).toHaveCount(1);
});

test('typing in bands mode follows the clockwise path', async ({ page }) => {
  await newGrid(page, 5);
  await mode(page, 'bands').click();
  await type(page, 'ABCDE');
  for (const [c, ch] of ['A', 'B', 'C', 'D', 'E'].entries()) await expect(letter(page, 0, c)).toHaveText(ch);
  await type(page, 'F');
  await expect(letter(page, 1, 4)).toHaveText('F');
});

test('each entry is a loop', async ({ page }) => {
  await openFile(page, fixture('mb-5.yaml'));
  const src = yaml.load(fs.readFileSync(fixture('mb-5.yaml'), 'utf8'));
  const rowEntries = src.rows.reduce((n, r) => n + r.entries.length, 0);
  const bandEntries = src.bands.reduce((n, b) => n + b.entries.length, 0);
  await expect(page.locator('polyline.loop')).toHaveCount(rowEntries);
  await mode(page, 'bands').click();
  await expect(page.locator('polyline.loop')).toHaveCount(bandEntries);
});

test('clicking a boundary splits and joins', async ({ page }) => {
  await newGrid(page, 5);
  const hit = page.locator('line.split-hit[data-gap="rows:0:2"]');
  await clickGapLine(hit);
  await expect(page.locator('polyline.loop[data-group="rows"][data-g="0"]')).toHaveCount(2);
  await cell(page, 0, 3).click();
  await showPhase(page, 'clues');
  await page.locator('.clue-row.on .clue-input').fill('second entry clue');
  await clickGapLine(hit);
  await expect(page.locator('polyline.loop[data-group="rows"][data-g="0"]')).toHaveCount(1);
  await expect(page.locator('#orphan-tray .orphan')).toHaveCount(1);
});

test('resize lives in the settings and says what it sets aside', async ({ page }) => {
  await newGrid(page, 5);
  await page.locator('#board-input').fill('Q');
  await expect(letter(page, 0, 0)).toHaveText('Q');
  await expect(page.locator('#toolbar #btn-resize')).toHaveCount(0);
  await openGrid(page);
  await page.locator('#puzzle-settings #btn-resize').click();
  await expect(page.locator('#resize-form')).toBeVisible();
  await page.locator('#resize-size').fill('7');
  await expect(page.locator('#resize-summary')).toBeVisible();
  await page.locator('#puzzle-settings #btn-resize').click();    // a second press closes the form
  await expect(page.locator('#resize-form')).toHaveCount(0);
  await expect(page.locator('rect.grid-cell')).toHaveCount(24);
  await openGrid(page);
  await page.locator('#puzzle-settings #btn-resize').click();
  await page.locator('#resize-size').fill('7');
  await page.locator('#resize-apply').click();
  await expect(letter(page, 0, 0)).toHaveText('Q');
  await expect(page.locator('rect.grid-cell')).toHaveCount(48);
});

test('the Grid popover stays inside the window at 1280×800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, path.join(REPO, 'examples/marching-bands.yaml'));
  await openGrid(page);
  await page.locator('#puzzle-settings #btn-resize').click();
  await expect(page.locator('#resize-form')).toBeVisible();
  await expectGridFits(page);
});

test('a Marching Bands fixture round-trips through the editor', async ({ page }) => {
  await openFile(page, fixture('rebus-5.yaml'));
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const exported = yaml.load(await download(page, '#export-yaml'));
  const original = yaml.load(fs.readFileSync(fixture('rebus-5.yaml'), 'utf8'));
  expect(buildFromObject(exported, {}, HOOKS).html).toBe(buildFromObject(original, {}, HOOKS).html);
});

test('shrinking the grid with the caret where the new center will be does not crash, and undo is safe', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openFile(page, path.join(REPO, 'examples/marching-bands.yaml'));
  await cell(page, 0, 12).click();                       // flat index 12: the center of a 5 × 5
  await openGrid(page);
  await page.locator('#puzzle-settings #btn-resize').click();
  await page.locator('#resize-size').fill('5');
  await page.locator('#resize-apply').click();
  await expect(page.locator('rect.grid-cell')).toHaveCount(24);
  await expect(page.locator('#board')).toBeVisible();
  await mode(page, 'bands').click();
  await showPhase(page, 'clues');
  await expect(page.locator('.clue-row.on .clue-input')).toBeVisible();
  await page.locator('#btn-undo').click();
  await expect(page.locator('rect.grid-cell')).toHaveCount(168);
  await expect(page.locator('.clue-row.on .clue-input')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Backspace on an empty first cell of a band does not erase the band\'s last cell', async ({ page }) => {
  await newGrid(page, 5);
  await mode(page, 'bands').click();
  await type(page, 'ABCDEFGHIJKLMNOP');                  // fills band A all the way round (16 cells)
  await expect(letter(page, 1, 0)).toHaveText('P');      // the band's last cell: (2, 1)
  await cell(page, 0, 0).click();
  await page.locator('#board-input').focus();
  await page.keyboard.press('Backspace');                // clears (1,1)
  await page.keyboard.press('Backspace');                // empty first cell: nothing before it
  await expect(letter(page, 0, 0)).toHaveCount(0);
  await expect(letter(page, 1, 0)).toHaveText('P');
});

test('clicking the selected cell again switches between rows and bands', async ({ page }) => {
  await newGrid(page, 5);
  await cell(page, 1, 1).click();
  await expect(mode(page, 'rows')).toHaveAttribute('aria-pressed', 'true');
  await cell(page, 1, 1).click();
  await expect(mode(page, 'bands')).toHaveAttribute('aria-pressed', 'true');
});

test('the Board phase shows Marching Bands\' word list and checks', async ({ page }) => {
  const file = path.join(REPO, 'examples/marching-bands.yaml');
  await openFile(page, file);
  const src = yaml.load(fs.readFileSync(file, 'utf8'));
  const n = [...src.rows, ...src.bands].reduce((sum, g) => sum + g.entries.length, 0);
  await expect(page.locator('#word-list .word-row')).toHaveCount(n);
  await cell(page, 12, 3).click();
  await expect(page.locator('.word-row.on')).toHaveCount(1);
  await expect(page.locator('.word-row.crossing')).toHaveCount(1);
  await expect(page.locator('#checks #meter-rows')).toContainText('row entries');
});

test('the Board phase fits one screen at laptop size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, path.join(REPO, 'examples/marching-bands.yaml'));
  const fits = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight <= window.innerHeight,
    pane: (el => el.scrollHeight <= el.clientHeight)(document.getElementById('edit-view')),
  }));
  expect(fits).toEqual({ page: true, pane: true });
  const box = await page.locator('#board').boundingBox();
  expect(box.height).toBeGreaterThan(300);
});

test('Tab walks clue to clue and the board follows; Shift+Tab reaches the spacing field', async ({ page }) => {
  await openFile(page, path.join(REPO, 'examples/marching-bands.yaml'));
  await showPhase(page, 'clues');
  const inputs = page.locator('.clue-row .clue-input');
  await inputs.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(inputs.nth(1)).toBeFocused();
  await expect(page.locator('.clue-row.on')).toHaveCount(1);
  await expect(page.locator('.clue-row.on .clue-input')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.clue-row.on #entry-display')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(inputs.nth(0)).toBeFocused();
  // The last clue's Tab leaves the list: no wrap, no trap.
  await expectTabLeavesClues(page, inputs.last());
});

test('focusing the clue of the entry the caret is in leaves the caret, and a different entry clue moves it', async ({ page }) => {
  await openFile(page, path.join(REPO, 'examples/marching-bands.yaml'));
  await cell(page, 0, 3).click();
  await showPhase(page, 'clues');
  const caret = () => page.locator('rect.grid-caret').evaluate(el => el.getAttribute('x') + ',' + el.getAttribute('y'));
  const before = await caret();
  await page.locator('.clue-row.on .clue-input').focus();
  expect(await caret()).toBe(before);
  // Another entry's clue moves the caret there, and the keys stay in the clue field.
  const other = page.locator('.clue-row:not(.on):not(.crossing) .clue-input').first();
  await other.focus();
  await expect(page.locator('.clue-row.on .clue-input')).toBeFocused();
  expect(await caret()).not.toBe(before);
  await expect(page.locator('#board-input')).not.toBeFocused();
});

test('a missing-clue problem opens Clues with that entry\'s clue focused', async ({ page }) => {
  await newGrid(page);
  await page.locator('#problems-chip').click();
  await page.locator('#diagnostics .diag-jump', { hasText: /has no clue/ }).first().click();
  await expect(page.locator('#phase-steps [data-view="clues"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.clue-row.on .clue-input')).toBeFocused();
});
