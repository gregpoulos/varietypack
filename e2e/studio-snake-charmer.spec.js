'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { serveStudio } = require('./studio-server');
const { cellMenuItem, expectTabLeavesClues, openStudio, openStudioFile, downloadText: download, typeBoard: type, showPhase } = require('./helpers');
const { clickGapLine } = require('./helpers');
const { validate } = require('../snake-charmer/src/validator');

let studio;
test.beforeAll(async () => { studio = await serveStudio(); });
test.afterAll(async () => { await studio.close(); });

const REPO = path.resolve(__dirname, '..');
const fixture = (name) => path.join(REPO, 'snake-charmer/test/fixtures', name);
const EXAMPLE = path.join(REPO, 'examples/snake-charmer.yaml');

// ---- helpers ----------------------------------------------------------------

const start = (page) => openStudio(page, studio.url);

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

const openFile = (page, file) => openStudioFile(page, studio.url, file);

const cell = (page, k) => page.locator(`.rc[data-k="${k}"]`);
const letter = (page, k) => page.locator(`.rl[data-k="${k}"]`);
const gap = (page, k) => page.locator(`.rgap[data-gap="${k}"]`);
const lap = (page, n) => page.locator(`#lap-toggle [data-lap="${n}"]`);

async function fillRing(page, letters) {
  await cell(page, 0).click();
  await type(page, letters);
  await lap(page, 1).click();   // typing all N cells carries the caret onto lap 2
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
  await clickGapLine(gap(page, 5));
  await clickGapLine(gap(page, 11));
  await lap(page, 2).click();
  await clickGapLine(gap(page, 6));      // position 22
  await clickGapLine(gap(page, 12));     // position 28
  await showPhase(page, 'clues');
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
  await clickGapLine(gap(page, 0));
  await expect(page.locator('text.rnum.clash')).toHaveText('1/2');
  await expect(page.locator('#meter-shared')).toBeVisible();
});

test('an odd count draws a plain circle', async ({ page }) => {
  await newRing(page, 16);
  await cell(page, 4).click();
  await cellMenuItem(page, 'btn-delete-cell');
  await expect(page.locator('#board-note')).toBeVisible();
  await expect(page.locator('path.rc')).toHaveCount(15);
});

test('the shape select lists only shapes that fit', async ({ page }) => {
  await openFile(page, fixture('double-turn-42.yaml'));
  await expect(page.locator('#shape-select option[value="turn"]')).toHaveCount(0);
  await page.locator('#shape-select').selectOption('stadium');
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const text = await download(page, '#export-yaml');
  expect(yaml.load(text).shape).toBe('stadium');
});

test('a complete puzzle exports YAML that validates', async ({ page }) => {
  await newRing(page, 16);
  await fillRing(page, 'ABCDEFGHIJKLMNOP');
  await clickGapLine(gap(page, 5));
  await clickGapLine(gap(page, 11));
  await page.locator('#header-title').fill('Ring Made In The Studio');
  await showPhase(page, 'clues');
  const inputs = page.locator('.clue-input');
  await expect(inputs).toHaveCount(3);
  for (let i = 0; i < 3; i++) await inputs.nth(i).fill(`Clue number ${i + 1}`);
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const puzzle = yaml.load(await download(page, '#export-yaml'));
  expect(puzzle.title).toBe('Ring Made In The Studio');
  expect(validate(puzzle).errors).toEqual([]);
});

test('Backspace at the first cell does not wrap round and erase the last one', async ({ page }) => {
  await newRing(page, 16);
  await fillRing(page, 'ABCDEFGHIJKLMNOP');     // leaves the caret on cell 1, lap 1
  await page.locator('#board-input').focus();
  await page.keyboard.press('Backspace');      // clears cell 1
  await page.keyboard.press('Backspace');      // already empty: nothing before it to clear
  await expect(letter(page, 0)).toHaveCount(0);
  await expect(letter(page, 15)).toHaveText('P');
});

test('the selected and crossing clue rows are the two entries through the ring cell', async ({ page }) => {
  await openFile(page, fixture('rebus-8.yaml'));
  await cell(page, 3).click();
  await showPhase(page, 'clues');
  // Ring cell 3 is the three-letter rebus cell: lap 1 reads it in entry 1, lap 2 in 3.
  await expect(page.locator('.clue-row.on')).toHaveAttribute('data-entry', '1');
  await expect(page.locator('.clue-row.crossing')).toHaveAttribute('data-entry', '3');
  await expect(page.locator('.clue-row.on .clue-answer')).toContainText('DDD');
  await expect(page.locator('.clue-row.crossing .clue-answer')).toContainText('DDD');
  await lap(page, 2).click();
  await expect(page.locator('.clue-row.on')).toHaveAttribute('data-entry', '3');
  await expect(page.locator('.clue-row.crossing')).toHaveAttribute('data-entry', '1');
});

test('Tab walks clue to clue and the board follows; Shift+Tab reaches the spacing field', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  const inputs = page.locator('.clue-row .clue-input');
  await inputs.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(inputs.nth(1)).toBeFocused();
  await expect(page.locator('.clue-row.on[data-entry="1"]')).toHaveCount(1);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.clue-row.on[data-entry="1"] #entry-display')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(inputs.nth(0)).toBeFocused();
  // The last clue's Tab leaves the list: no wrap, no trap.
  await expectTabLeavesClues(page, inputs.last());
});

// The caret is a position over both laps, so a ring that grows or shrinks moves lap 2's
// base. Undo and Redo change the ring's size as well as the Cell… menu does.
test('inserting a cell on lap 2, and undoing it, keeps the caret on the same lap and cell', async ({ page }) => {
  await newRing(page, 16);
  await lap(page, 2).click();
  await cell(page, 3).click();
  const onCell3 = async (count) => {
    await expect(page.locator('path.rc')).toHaveCount(count);
    await expect(lap(page, 2)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.rcaret').getAttribute('d')).toBe(await cell(page, 3).getAttribute('d'));
  };
  await cellMenuItem(page, 'btn-insert-before');
  await onCell3(17);
  await page.locator('#btn-undo').click();
  await onCell3(16);
  await page.locator('#btn-redo').click();
  await onCell3(17);
  await cellMenuItem(page, 'btn-delete-cell');
  await onCell3(16);
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

test('clicking the selected cell again switches lap, as on the puzzle page', async ({ page }) => {
  await newRing(page, 16);
  await cell(page, 3).click();
  await expect(lap(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await cell(page, 3).click();
  await expect(lap(page, 2)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.rcaret').getAttribute('d')).toBe(await cell(page, 3).getAttribute('d'));
});

test('the Board phase shows Snake Charmer\'s word list and checks', async ({ page }) => {
  await openFile(page, fixture('rebus-8.yaml'));
  const n = yaml.load(fs.readFileSync(fixture('rebus-8.yaml'), 'utf8')).entries.length;
  await expect(page.locator('#word-list .word-row')).toHaveCount(n);
  await cell(page, 3).click();
  await expect(page.locator('.word-row.on')).toHaveCount(1);
  await expect(page.locator('.word-row.crossing')).toHaveCount(1);
  await expect(page.locator('#checks #meter-entries')).toContainText(`${n} entries`);
});

test('focusing the clue of the entry the caret is in leaves the caret, and a different entry clue moves it', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await cell(page, 1).click();
  await showPhase(page, 'clues');
  const caret = () => page.locator('.rcaret').getAttribute('d');
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
  await newRing(page);
  await page.locator('#problems-chip').click();
  await page.locator('#diagnostics .diag-jump', { hasText: /Entry 1 .* has no clue/ }).click();
  await expect(page.locator('#phase-steps [data-view="clues"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.clue-row.on[data-entry="0"] .clue-input')).toBeFocused();
});
