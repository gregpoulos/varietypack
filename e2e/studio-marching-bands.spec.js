'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { serveStudio } = require('./studio-server');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { HOOKS } = require('../marching-bands/src/builder');

let studio;
test.beforeAll(async () => { studio = await serveStudio(); });
test.afterAll(async () => { await studio.close(); });

const REPO = path.resolve(__dirname, '..');
const FIXTURES = path.join(REPO, 'marching-bands/test/fixtures');
const fixture = (name) => path.join(FIXTURES, name);

// ---- helpers ----------------------------------------------------------------

async function start(page) {
  await page.goto(studio.url);
  await expect(page.locator('#welcome')).toBeVisible();
}

async function newGrid(page, size = 5) {
  await start(page);
  await page.locator('#welcome [data-kind="marching-bands"]').click();
  await page.locator('#new-size-size').fill(String(size));
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
}

async function openFile(page, file) {
  await start(page);
  await page.setInputFiles('#open-input', file);
  await expect(page.locator('#board')).toBeVisible();
}

const cell = (page, r, c) => page.locator(`rect.grid-cell[data-r="${r}"][data-c="${c}"]`);
const letter = (page, r, c) => page.locator(`text.grid-letter[data-r="${r}"][data-c="${c}"]`);
const mode = (page, m) => page.locator(`#cut-toggle [data-cut="${m}"]`);

async function type(page, letters) {
  for (const ch of letters) await page.locator('#board-input').fill(ch);
}

async function download(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  return fs.readFileSync(await dl.path(), 'utf8');
}

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
  await hit.click({ force: true });
  await expect(page.locator('polyline.loop[data-group="rows"][data-g="0"]')).toHaveCount(2);
  await cell(page, 0, 3).click();
  await page.locator('#entry-clue').fill('second entry clue');
  await hit.click({ force: true });
  await expect(page.locator('polyline.loop[data-group="rows"][data-g="0"]')).toHaveCount(1);
  await expect(page.locator('#orphan-tray .orphan')).toHaveCount(1);
});

test('the line field rewrites a row', async ({ page }) => {
  await openFile(page, path.join(REPO, 'examples/marching-bands.yaml'));
  await cell(page, 12, 3).click();
  await expect(page.locator('#line-field')).toHaveValue('RAMADAN | ACADIA');
  await page.locator('#line-field').fill('RAMA | DANACADIA');
  await page.locator('#line-field').press('Enter');
  await expect(page.locator('#line-field')).toHaveValue('RAMA | DANACADIA');
  await expect(page.locator('polyline.loop[data-group="rows"][data-g="12"]')).toHaveCount(2);
  await expect(page.locator('.split[data-group="rows"][data-g="12"]')).toHaveCount(1);
  await expect(page.locator('#orphan-tray')).toContainText('French territory conquered in Queen Anne’s War');
  await page.locator('#line-field').fill('RAMA | DANACADI');         // 12 letters in a 13-cell row
  await page.locator('#line-field').press('Enter');
  await expect(page.locator('#line-error')).toContainText('Row 13 has 13 cells, and this has 12.');
});

test('resize lives in the settings and says what it sets aside', async ({ page }) => {
  await newGrid(page, 5);
  await page.locator('#board-input').fill('Q');
  await expect(letter(page, 0, 0)).toHaveText('Q');
  await expect(page.locator('#toolbar #btn-resize')).toHaveCount(0);
  await page.locator('#puzzle-settings #btn-resize').click();
  await expect(page.locator('#resize-form')).toBeVisible();
  await page.locator('#resize-size').fill('7');
  await expect(page.locator('#resize-summary')).toBeVisible();
  await page.locator('#resize-cancel').click();
  await expect(page.locator('rect.grid-cell')).toHaveCount(24);
  await page.locator('#puzzle-settings #btn-resize').click();
  await page.locator('#resize-size').fill('7');
  await page.locator('#resize-apply').click();
  await expect(letter(page, 0, 0)).toHaveText('Q');
  await expect(page.locator('rect.grid-cell')).toHaveCount(48);
});

test('a Marching Bands fixture round-trips through the editor', async ({ page }) => {
  await openFile(page, fixture('rebus-5.yaml'));
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const exported = yaml.load(await download(page, '#export-source'));
  const original = yaml.load(fs.readFileSync(fixture('rebus-5.yaml'), 'utf8'));
  expect(buildFromObject(exported, {}, HOOKS).html).toBe(buildFromObject(original, {}, HOOKS).html);
});

test('shrinking the grid with the caret where the new center will be does not crash, and undo is safe', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openFile(page, path.join(REPO, 'examples/marching-bands.yaml'));
  await cell(page, 0, 12).click();                       // flat index 12: the center of a 5 × 5
  await page.locator('#puzzle-settings #btn-resize').click();
  await page.locator('#resize-size').fill('5');
  await page.locator('#resize-apply').click();
  await expect(page.locator('rect.grid-cell')).toHaveCount(24);
  await expect(page.locator('#board')).toBeVisible();
  await mode(page, 'bands').click();
  await expect(page.locator('.entry-card.main')).toBeVisible();
  await page.locator('#btn-undo').click();
  await expect(page.locator('rect.grid-cell')).toHaveCount(168);
  await expect(page.locator('.entry-card.main')).toBeVisible();
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

