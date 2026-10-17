'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { serveStudio } = require('./studio-server');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { HOOKS } = require('../spiral/src/builder');
const { validate } = require('../spiral/src/validator');

let studio;
test.beforeAll(async () => { studio = await serveStudio(); });
test.afterAll(async () => { await studio.close(); });

const REPO = path.resolve(__dirname, '..');
const REBUS_40 = path.join(REPO, 'spiral/test/fixtures/rebus-40.yaml');

// ---- helpers ----------------------------------------------------------------

async function start(page) {
  await page.goto(studio.url);
  await expect(page.locator('#welcome')).toBeVisible();
}

async function newSpiral(page, cells = 40) {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await page.locator('#new-size-cells').fill(String(cells));
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
}

async function openFile(page, file) {
  await start(page);
  await page.setInputFiles('#open-input', file);
  await expect(page.locator('#board')).toBeVisible();
}

const cell = (page, i) => page.locator(`.sp-cell[data-index="${i}"]`);
const letter = (page, i) => page.locator(`.sp-ltr[data-index="${i}"]`);
async function type(page, letters) {
  for (const ch of letters) await page.locator('#board-input').fill(ch);
}

async function download(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  return fs.readFileSync(await dl.path(), 'utf8');
}

// ---- tests ------------------------------------------------------------------

test('a new Spiral asks for its size, then opens the structured editor', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await expect(page.locator('#new-size-cells')).toHaveValue('78');
  await expect(page.locator('#size-preview')).toHaveCount(0);
  await page.locator('#new-size-cells').fill('40');
  await page.locator('#new-size-create').click();
  await expect(page.locator('.sp-cell')).toHaveCount(40);
  await expect(page.locator('#problems-chip')).toContainText('problem');
  await page.locator('#problems-chip').click();
  const errors = page.locator('#diagnostics .diag-error');
  await expect(errors.filter({ hasText: 'Give the puzzle a title.' })).toHaveCount(1);
  await expect(errors.filter({ hasText: 'Cells 1–40 are empty.' })).toHaveCount(1);
  await expect(errors.filter({ hasText: /Inward 1 .* has no clue/ })).toHaveCount(1);
  await expect(errors.filter({ hasText: /Outward 1 .* has no clue/ })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('#btn-export').click();
  await expect(page.locator('#export-hashed')).toBeDisabled();
});

test('the size prompt rejects too few cells', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await page.locator('#new-size-cells').fill('39');
  await page.locator('#new-size-create').click();
  await expect(page.locator('#new-size-error')).toBeVisible();
  await expect(page.locator('#board')).toHaveCount(0);
});

test('typing fills cells and advances', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 0).click();
  await type(page, 'ROTI');
  for (const [i, ch] of ['R', 'O', 'T', 'I'].entries()) await expect(letter(page, i)).toHaveText(ch);
  await expect(cell(page, 4)).toHaveClass(/caret/);
});

// useBoardInput is every structured editor's typing path, so one kind covers it.
test('typed accented letters fill their base letter, as on the puzzle page', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 0).click();
  await type(page, 'ÑÉ');
  for (const [i, ch] of ['N', 'E'].entries()) await expect(letter(page, i)).toHaveText(ch);
  await expect(cell(page, 2)).toHaveClass(/caret/);
});

test('typed digits fill cells like letters', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 0).click();
  await type(page, 'R2');
  for (const [i, ch] of ['R', '2'].entries()) await expect(letter(page, i)).toHaveText(ch);
  await expect(cell(page, 2)).toHaveClass(/caret/);
});

test('Enter composes a multi-letter cell', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 3).click();
  await page.locator('#board-input').focus();
  await page.keyboard.press('Enter');
  await type(page, 'HAR');
  await page.keyboard.press('Enter');
  await expect(letter(page, 3)).toHaveText('HAR');
  await expect(page.locator('#sequence-field')).toHaveValue(/\[HAR\]/);
  await expect(cell(page, 3)).toHaveClass(/caret/);
});

test('the sequence field replaces the cells', async ({ page }) => {
  await newSpiral(page);
  const seq = 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN'.slice(0, 40);
  await page.locator('#sequence-field').fill(seq);
  await page.locator('#sequence-field').press('Enter');
  await expect(page.locator('.sp-ltr')).toHaveCount(40);
  await expect(letter(page, 0)).toHaveText('A');
  await expect(letter(page, 27)).toHaveText('B');
  await expect(letter(page, 39)).toHaveText('N');
});

test('a boundary click splits an inward entry', async ({ page }) => {
  await newSpiral(page);
  await page.locator('.sp-gap[data-gap="4"]').click({ force: true });
  await expect(page.locator('#meter-inward')).toContainText('2 entries');
  const mark = page.locator('.sp-break.in[data-gap="4"]');
  await expect(mark).toHaveCount(1);
  await expect(mark).not.toHaveClass(/weak/);
});

test('"." switches cuts and "|" breaks the outward cut', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 5).click();
  await page.locator('#board-input').focus();
  await page.keyboard.press('.');
  await cell(page, 10).click();
  await page.locator('#board-input').focus();
  await page.keyboard.press('|');
  await expect(page.locator('#meter-outward')).toContainText('2 entries');
  await expect(page.locator('.sp-break.out[data-gap="11"]')).toHaveCount(1);
});

test('inserting a cell redraws the spiral', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 5).click();
  await page.locator('#btn-insert-cell').click();
  await expect(page.locator('.sp-cell')).toHaveCount(41);
  await expect(page.locator('#meter-cells')).toContainText('41');
});

test('undo restores a removed break', async ({ page }) => {
  await newSpiral(page);
  const gap = page.locator('.sp-gap[data-gap="4"]');
  await gap.click({ force: true });
  await expect(page.locator('#meter-inward')).toContainText('2 entries');
  await gap.click({ force: true });
  await expect(page.locator('#meter-inward')).toContainText('1 entry');
  await page.locator('#btn-undo').click();
  await expect(page.locator('#meter-inward')).toContainText('2 entries');
});

test('the selected-entry panel follows the cursor', async ({ page }) => {
  await openFile(page, REBUS_40);
  await cell(page, 5).click();
  await expect(page.locator('.entry-card.main .entry-range')).toContainText('6');
  await expect(page.locator('.entry-card.crossing')).toBeVisible();
  await page.locator('#entry-clue').fill('my own clue');
  await page.locator('#clue-view [data-view="all"]').click();
  const row = page.locator('.clue-row[data-cut="inward"]').filter({ has: page.locator('.clue-input') }).nth(1);
  await expect(row.locator('.clue-input')).toHaveValue('my own clue');
});

test('a removed break\'s clue goes to the orphan tray and can be reattached', async ({ page }) => {
  await newSpiral(page);
  await page.locator('.sp-gap[data-gap="4"]').click({ force: true });
  await cell(page, 10).click();
  await page.locator('#entry-clue').fill('second entry clue');
  await page.locator('.sp-gap[data-gap="4"]').click({ force: true });
  await expect(page.locator('#orphan-tray .orphan')).toHaveCount(1);
  await page.locator('#orphan-tray .orphan-target').selectOption('inward:0');
  await page.locator('#orphan-tray .orphan-attach').click();
  await expect(page.locator('#orphan-tray')).toHaveCount(0);
  await expect(page.locator('#entry-clue')).toHaveValue('second entry clue');
});

test('a complete puzzle exports YAML that validates', async ({ page }) => {
  await newSpiral(page);
  await page.locator('#sequence-field').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN');
  await page.locator('#sequence-field').press('Enter');
  await page.locator('.sp-gap[data-gap="20"]').click({ force: true });
  await page.locator('#cut-toggle [data-cut="outward"]').click();
  await page.locator('.sp-gap[data-gap="20"]').click({ force: true });
  await page.locator('#header-title').fill('Made In The Studio');
  await page.locator('#clue-view [data-view="all"]').click();
  const inputs = page.locator('.clue-input');
  await expect(inputs).toHaveCount(4);
  for (let i = 0; i < 4; i++) await inputs.nth(i).fill(`Clue number ${i + 1}`);
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const text = await download(page, '#export-source');
  const puzzle = yaml.load(text);
  expect(puzzle.title).toBe('Made In The Studio');
  expect(validate(puzzle).errors).toEqual([]);
});

test('a Spiral fixture round-trips through the editor', async ({ page }) => {
  await openFile(page, REBUS_40);
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const exported = yaml.load(await download(page, '#export-source'));
  const original = yaml.load(fs.readFileSync(REBUS_40, 'utf8'));
  expect(buildFromObject(exported, {}, HOOKS).html).toBe(buildFromObject(original, {}, HOOKS).html);
});

test('Edit as YAML and back', async ({ page }) => {
  await openFile(page, REBUS_40);
  await page.locator('#btn-edit-yaml').click();
  await expect(page.locator('#yaml-editor')).toBeVisible();
  await page.locator('#btn-back-to-editor').click();
  await expect(page.locator('#board')).toBeVisible();
});

test('undo steps back through typing runs separated by moving the cursor', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 3).click();
  await type(page, 'AB');
  await cell(page, 10).click();
  await type(page, 'C');
  await expect(letter(page, 10)).toHaveText('C');
  await page.locator('#btn-undo').click();
  await expect(letter(page, 10)).toHaveCount(0);
  await expect(letter(page, 3)).toHaveText('A');
  await page.locator('#btn-undo').click();
  await expect(letter(page, 3)).toHaveCount(0);
});

test('keys the editor does not use are left to the browser', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 3).click();
  await page.locator('#board-input').focus();
  const prevented = await page.evaluate(() => {
    const input = document.getElementById('board-input');
    return ['ArrowUp', 'ArrowDown', '#'].map(key => {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      input.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
  });
  expect(prevented).toEqual([false, false, false]);
});

test('the sequence field shows the current cells again after an undo, not a stale draft', async ({ page }) => {
  await newSpiral(page);
  await page.locator('#sequence-field').fill('ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN');
  await page.locator('#sequence-field').press('Enter');
  await page.locator('#sequence-field').fill('[AB');          // invalid, left unapplied
  await page.locator('#btn-undo').click();
  await expect(page.locator('#sequence-field')).toHaveValue('_'.repeat(40));
  await expect(page.locator('#sequence-error')).toHaveCount(0);
});

test('clicking the selected cell again switches direction', async ({ page }) => {
  await newSpiral(page, 40);
  await page.locator('.sp-cell').nth(3).click();
  await expect(page.locator('#cut-toggle [data-cut="inward"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.sp-cell').nth(3).click();
  await expect(page.locator('#cut-toggle [data-cut="outward"]')).toHaveAttribute('aria-pressed', 'true');
});

