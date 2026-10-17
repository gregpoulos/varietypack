'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { serveStudio } = require('./studio-server');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { HOOKS } = require('../snake-charmer/src/builder');
const { validate } = require('../snake-charmer/src/validator');

let studio;
test.beforeAll(async () => { studio = await serveStudio(); });
test.afterAll(async () => { await studio.close(); });

const REPO = path.resolve(__dirname, '..');
const fixture = (name) => path.join(REPO, 'snake-charmer/test/fixtures', name);

// ---- helpers ----------------------------------------------------------------

async function start(page) {
  await page.goto(studio.url);
  await expect(page.locator('#welcome')).toBeVisible();
}

async function openSizePrompt(page) {
  await start(page);
  await page.locator('#welcome [data-kind="snake-charmer"]').click();
  await expect(page.locator('#new-size-form')).toBeVisible();
}

async function newRing(page, cells = 16) {
  await openSizePrompt(page);
  await page.locator('#new-size-cells').fill(String(cells));
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
}

async function openFile(page, file) {
  await start(page);
  await page.setInputFiles('#open-input', file);
  await expect(page.locator('#board')).toBeVisible();
}

const cell = (page, k) => page.locator(`.rc[data-k="${k}"]`);
const letter = (page, k) => page.locator(`.rl[data-k="${k}"]`);
const gap = (page, k) => page.locator(`.rgap[data-gap="${k}"]`);
const lap = (page, n) => page.locator(`#lap-toggle [data-lap="${n}"]`);

async function fillRing(page, letters) {
  await page.locator('#sequence-field').fill(letters);
  await page.locator('#sequence-field').press('Enter');
}

async function download(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  return fs.readFileSync(await dl.path(), 'utf8');
}

// ---- tests ------------------------------------------------------------------

test('the size prompt previews the shapes that fit', async ({ page }) => {
  await openSizePrompt(page);
  await expect(page.locator('#new-size-cells')).toHaveValue('48');
  await expect(page.locator('#size-preview svg path')).toHaveCount(48);
  const values = () => page.locator('#size-shape option').evaluateAll(os => os.map(o => o.value));
  expect(await values()).toEqual(['', 'circle', 'stadium', 'turn', 'double-turn']);
  await page.locator('#new-size-cells').fill('44');
  await expect(page.locator('#size-shape option[value="double-turn"]')).toHaveCount(0);
  await page.locator('#new-size-cells').fill('45');
  await expect(page.locator('#size-preview svg')).toHaveCount(0);
  await expect(page.locator('#size-preview')).toContainText('Every shape needs an even number of cells per lap, from 8 to 120.');
  await expect(page.locator('#size-shape')).toBeDisabled();
  await page.locator('#new-size-cells').fill('48');
  await page.locator('#size-shape').selectOption('turn');
  await page.locator('#new-size-create').click();
  await expect(page.locator('#shape-select')).toHaveValue('turn');
});

test('a new Snake Charmer opens on the ring', async ({ page }) => {
  await newRing(page, 16);
  await expect(page.locator('path.rc')).toHaveCount(16);
  await page.locator('#problems-chip').click();
  const errors = page.locator('#diagnostics .diag-error');
  await expect(errors.filter({ hasText: 'Ring cells 1–16 are empty.' })).toHaveCount(1);
  await expect(errors.filter({ hasText: /Entry 1 .* has no clue/ })).toHaveCount(1);
});

test('a break near the end of lap 1 makes an entry that straddles into lap 2', async ({ page }) => {
  await newRing(page, 16);
  await fillRing(page, 'ABCDEFGHIJKLMNOP');
  await gap(page, 5).click({ force: true });
  await gap(page, 11).click({ force: true });
  await lap(page, 2).click();
  await gap(page, 6).click({ force: true });      // position 22
  await gap(page, 12).click({ force: true });     // position 28
  await page.locator('#clue-view [data-view="all"]').click();
  await expect(page.locator('.clue-row')).toHaveCount(5);
  await expect(page.locator('.clash')).toHaveCount(0);
  // the entry starting at position 11 covers positions 11-21, across the boundary at 16
  const answer = page.locator('.clue-row[data-entry="2"] .clue-answer');
  await expect(answer).toHaveText('LMNOPABCDEF');
});

test('typing on lap 2 edits the shared ring cell', async ({ page }) => {
  await newRing(page, 16);
  await lap(page, 2).click();
  await cell(page, 2).click();
  await page.locator('#board-input').fill('Q');
  await expect(letter(page, 2)).toHaveText('Q');
  await lap(page, 1).click();
  await expect(letter(page, 2)).toHaveText('Q');
});

test('a cell where two entries start shows both numbers', async ({ page }) => {
  await newRing(page, 16);
  await lap(page, 2).click();
  await gap(page, 0).click({ force: true });
  await expect(page.locator('text.rnum.clash')).toHaveText('1/2');
  await expect(page.locator('#meter-shared')).toBeVisible();
});

test('an odd count draws a plain circle', async ({ page }) => {
  await newRing(page, 16);
  await cell(page, 4).click();
  await page.locator('#btn-delete-cell').click();
  await expect(page.locator('#board-note')).toBeVisible();
  await expect(page.locator('path.rc')).toHaveCount(15);
});

test('the shape select lists only shapes that fit', async ({ page }) => {
  await openFile(page, fixture('double-turn-42.yaml'));
  await expect(page.locator('#shape-select option[value="turn"]')).toHaveCount(0);
  await page.locator('#shape-select').selectOption('stadium');
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const text = await download(page, '#export-source');
  expect(yaml.load(text).shape).toBe('stadium');
});

test('a Snake Charmer fixture round-trips through the editor', async ({ page }) => {
  await openFile(page, fixture('rebus-8.yaml'));
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const exported = yaml.load(await download(page, '#export-source'));
  const original = yaml.load(fs.readFileSync(fixture('rebus-8.yaml'), 'utf8'));
  expect(buildFromObject(exported, {}, HOOKS).html).toBe(buildFromObject(original, {}, HOOKS).html);
});

test('a complete puzzle exports YAML that validates', async ({ page }) => {
  await newRing(page, 16);
  await fillRing(page, 'ABCDEFGHIJKLMNOP');
  await gap(page, 5).click({ force: true });
  await gap(page, 11).click({ force: true });
  await page.locator('#header-title').fill('Ring Made In The Studio');
  await page.locator('#clue-view [data-view="all"]').click();
  const inputs = page.locator('.clue-input');
  await expect(inputs).toHaveCount(3);
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill(`Clue number ${i + 1}`);
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const puzzle = yaml.load(await download(page, '#export-source'));
  expect(puzzle.title).toBe('Ring Made In The Studio');
  expect(validate(puzzle).errors).toEqual([]);
});

test('Backspace at the first cell does not wrap round and erase the last one', async ({ page }) => {
  await newRing(page, 16);
  await fillRing(page, 'ABCDEFGHIJKLMNOP');
  await cell(page, 0).click();
  await page.locator('#board-input').focus();
  await page.keyboard.press('Backspace');      // clears cell 1
  await page.keyboard.press('Backspace');      // already empty: nothing before it to clear
  await expect(letter(page, 0)).toHaveCount(0);
  await expect(letter(page, 15)).toHaveText('P');
});

test('the crossing card marks the shared cell, as the main card does', async ({ page }) => {
  await openFile(page, fixture('rebus-8.yaml'));
  await cell(page, 3).click();
  await expect(page.locator('.entry-card.main .entry-tile.here')).toHaveCount(1);
  await expect(page.locator('.entry-card.crossing .entry-tile.here')).toHaveCount(1);
});

test('inserting a cell on lap 2 keeps the caret on the same lap and cell', async ({ page }) => {
  await newRing(page, 16);
  await lap(page, 2).click();
  await cell(page, 3).click();
  await page.locator('#btn-insert-cell').click();
  await expect(page.locator('path.rc')).toHaveCount(17);
  await expect(lap(page, 2)).toHaveAttribute('aria-pressed', 'true');
  const caret = await page.locator('.rcaret').getAttribute('d');
  expect(caret).toBe(await cell(page, 3).getAttribute('d'));
  await page.locator('#btn-delete-cell').click();
  await expect(page.locator('path.rc')).toHaveCount(16);
  await expect(lap(page, 2)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.rcaret').getAttribute('d')).toBe(await cell(page, 3).getAttribute('d'));
});

// Space is the shared editing hook's (useBoardEditing.js), so one kind covers it. This
// one, because nothing else here checks that typing moves the caret on (the editor's
// nav.next).
test('Space clears the cell and moves on, as on the puzzle page', async ({ page }) => {
  await newRing(page, 16);
  await cell(page, 0).click();
  await page.locator('#board-input').fill('a');
  await page.keyboard.press('ArrowLeft');
  await expect(letter(page, 0)).toHaveText('A');
  await page.keyboard.press(' ');
  expect((await letter(page, 0).allTextContents()).join('')).toBe('');
  await page.locator('#board-input').fill('b');
  await expect(letter(page, 1)).toHaveText('B');
});
