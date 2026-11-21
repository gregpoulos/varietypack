'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { serveStudio } = require('./studio-server');
const { expectGridFits, expectTabLeavesClues, openGrid, openStudio, openStudioFile, downloadText: download, typeBoard: type, showPhase } = require('./helpers');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { HOOKS } = require('../crushword/src/builder');

let studio;
test.beforeAll(async () => { studio = await serveStudio(); });
test.afterAll(async () => { await studio.close(); });

const REPO = path.resolve(__dirname, '..');
const FIXTURES = path.join(REPO, 'crushword/test/fixtures');
const EXAMPLE = path.join(REPO, 'examples/crushword.yaml');

// ---- helpers (cells are (row, column), 1-based) ------------------------------

const start = (page) => openStudio(page, studio.url);

async function newGrid(page, rows = 5, cols = 5) {
  await start(page);
  await page.locator('#welcome [data-kind="crushword"]').click();
  await page.locator('#new-size-rows').fill(String(rows));
  await page.locator('#new-size-cols').fill(String(cols));
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
}

const openFile = (page, file) => openStudioFile(page, studio.url, file);

const cell = (page, r, c) => page.locator(`rect.grid-cell[data-r="${r - 1}"][data-c="${c - 1}"]`);
const block = (page, r, c) => page.locator(`rect.grid-block[data-r="${r - 1}"][data-c="${c - 1}"]`);
const letter = (page, r, c) => page.locator(`text.grid-letter[data-r="${r - 1}"][data-c="${c - 1}"]`);
// The caret's position, read from where the caret outline sits.
async function caretAt(page) {
  const box = await page.locator('rect.grid-caret').evaluate(el => ({ x: +el.getAttribute('x'), y: +el.getAttribute('y') }));
  return { r: Math.round((box.y - 1.5 - 6) / 40) + 1, c: Math.round((box.x - 1.5 - 28) / 40) + 1 };
}

// ---- tests ------------------------------------------------------------------

test('the size prompt previews an empty grid', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="crushword"]').click();
  await expect(page.locator('#new-size-rows')).toHaveValue('15');
  await expect(page.locator('#new-size-cols')).toHaveValue('15');
  await expect(page.locator('#size-preview svg rect')).toHaveCount(225);
  await expect(page.locator('#size-summary')).toContainText('15 × 15: 225 open cells. Make the block pattern next, with #.');
  await page.locator('#new-size-rows').fill('9');
  await page.locator('#new-size-cols').fill('17');
  await expect(page.locator('#size-preview svg rect')).toHaveCount(153);
  await page.locator('#new-size-create').click();
  await expect(page.locator('rect.grid-cell')).toHaveCount(153);
  await expect(page.locator('text.grid-num')).toHaveCount(17 + 8);          // across row 1 and down column 1 share (1,1)
});

test('the size prompt explains an out-of-range size', async ({ page }) => {
  await start(page);
  await page.locator('#welcome [data-kind="crushword"]').click();
  await page.locator('#new-size-rows').fill('30');
  await expect(page.locator('#size-preview svg')).toHaveCount(0);
  await expect(page.locator('#size-summary')).toContainText('Rows and columns must be whole numbers from 3 to 25.');
});

test('typing works as on the puzzle page', async ({ page }) => {
  await newGrid(page, 5, 5);
  await cell(page, 1, 1).click();
  await type(page, 'abc');
  await expect(letter(page, 1, 1)).toHaveText('ABC');
  expect(await caretAt(page)).toEqual({ r: 1, c: 2 });
  await type(page, 'd');
  await page.keyboard.press(' ');
  await expect(letter(page, 1, 2)).toHaveText('D');
  expect(await caretAt(page)).toEqual({ r: 1, c: 3 });
  await type(page, 'ef');
  await page.keyboard.press('Enter');
  expect(await caretAt(page)).toEqual({ r: 1, c: 4 });
  await page.keyboard.press('Backspace');
  await expect(letter(page, 1, 3)).toHaveText('E');
});

test('clicking the caret\'s cell again switches direction', async ({ page }) => {
  await newGrid(page, 5, 5);
  await cell(page, 2, 2).click();
  await expect(page.locator('#direction-toggle [data-dir="A"]')).toHaveAttribute('aria-pressed', 'true');
  await cell(page, 2, 2).click();
  await expect(page.locator('#direction-toggle [data-dir="D"]')).toHaveAttribute('aria-pressed', 'true');
  await cell(page, 2, 2).click();
  await expect(page.locator('#direction-toggle [data-dir="A"]')).toHaveAttribute('aria-pressed', 'true');
});

test('"#" blocks only the cell it is on', async ({ page }) => {
  await newGrid(page, 5, 5);
  await cell(page, 1, 1).click();
  await page.keyboard.press('#');
  await expect(block(page, 1, 1)).toHaveCount(1);
  await expect(page.locator('rect.grid-block')).toHaveCount(1);
  expect(await caretAt(page)).toEqual({ r: 1, c: 2 });
  await expect(page.locator('#meter-blocks')).toContainText('1 block');
  await expect(page.locator('text.grid-num').first()).toHaveText('1');        // numbering follows the new pattern
});

test('a block can be selected and opened again', async ({ page }) => {
  await newGrid(page, 5, 5);
  await cell(page, 1, 1).click();
  await page.keyboard.press('#');
  await block(page, 1, 1).click();
  expect(await caretAt(page)).toEqual({ r: 1, c: 1 });
  await page.locator('#board-input').focus();
  await page.keyboard.press('#');
  await expect(page.locator('rect.grid-block')).toHaveCount(0);
  await expect(cell(page, 1, 1)).toHaveCount(1);
  await expect(cell(page, 5, 5)).toHaveCount(1);
});

test('typing on a selected block says what to do', async ({ page }) => {
  await newGrid(page, 5, 5);
  await cell(page, 1, 1).click();
  await page.keyboard.press('#');
  await block(page, 1, 1).click();
  await page.locator('#board-input').focus();
  await type(page, 'a');
  await expect(page.locator('#message')).toContainText('This cell is a block. Press # to open it.');
});

test('grid checks follow the grid', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await expect(page.locator('#checks [id^="grid-check-"].ok')).toHaveCount(2);
  await expect(page.locator('#checks [id^="grid-check-"].bad, #checks [id^="grid-check-"].warn')).toHaveCount(0);
  await cell(page, 5, 9).click();
  await page.keyboard.press('#');
  await expect(page.locator('#checks [id^="grid-check-"].warn')).toContainText('2 cells are crossed only once');
  await expect(page.locator('path.check-uncrossed')).toHaveCount(2);
  await showPhase(page, 'clues');
  await expect(page.locator('#orphan-tray .orphan')).toHaveCount(1);
  await showPhase(page, 'board');
  await page.locator('#show-checks').uncheck();
  await expect(page.locator('path.check-uncrossed')).toHaveCount(0);
  await expect(page.locator('#checks [id^="grid-check-"].warn')).toContainText('2 cells are crossed only once');
});

test('the Puzzle box heads the side column, and the checks sit under the board', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await expect(page.locator('.phase-side-col > #puzzle-box:first-child #header-title')).toBeVisible();
  const board = await page.locator('#board').boundingBox();
  const checks = await page.locator('#checks').boundingBox();
  expect(checks.y).toBeGreaterThan(board.y + board.height);
  await expect(page.locator('#btn-details')).toHaveCount(0);
  await expect(page.locator('#header-theme')).toHaveCount(0);
});

test('the Grid popover stays inside the window at 1280×800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, EXAMPLE);
  await openGrid(page);
  await page.locator('#puzzle-settings #btn-resize').click();
  await expect(page.locator('#resize-form')).toBeVisible();
  await expectGridFits(page);
});

test('Escape closes the Grid popover, and undo inside it reaches the model', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await openGrid(page);
  await page.locator('#puzzle-settings #max-cell-letters').fill('2');
  await expect(page.locator('#checks [id^="grid-check-"].bad')).toContainText('more than 2 letters');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#checks [id^="grid-check-"].bad')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#grid-settings')).toBeHidden();
});

// Sliding onto the default (3) stores nothing, so the YAML matches an untouched puzzle's.
for (const [value, stored] of [['5', /maxCellLetters: 5/], ['3', /^(?![\s\S]*maxCellLetters)/]]) {
  test(`the letters-per-cell fader at ${value} writes ${value === '3' ? 'no maxCellLetters' : 'maxCellLetters'}`, async ({ page }) => {
    await openFile(page, EXAMPLE);
    await openGrid(page);
    const fader = page.locator('#puzzle-settings #max-cell-letters');
    await expect(fader).toHaveValue('3');
    await fader.fill('4');                       // away from the default and back
    await fader.fill(value);
    await expect(page.locator('#puzzle-settings .fader-ladder .led.lit')).toHaveCount(Number(value));
    await page.keyboard.press('Escape');
    await page.locator('#btn-edit-yaml').click();
    await expect(page.locator('#yaml-editor')).toHaveValue(stored);
  });
}

test('letters per cell lives in the settings', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await expect(page.locator('#toolbar #max-cell-letters')).toHaveCount(0);
  await openGrid(page);
  await page.locator('#puzzle-settings #max-cell-letters').fill('2');
  await expect(page.locator('#checks [id^="grid-check-"].bad')).toContainText('more than 2 letters');
  await cell(page, 1, 1).click();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');   // empty the [SNO] cell
  await type(page, 'ab');
  expect(await caretAt(page)).toEqual({ r: 1, c: 2 });
});

test('resize lives in the settings and says what it sets aside', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await expect(page.locator('#toolbar #btn-resize')).toHaveCount(0);
  await openGrid(page);
  await page.locator('#puzzle-settings #btn-resize').click();
  await page.locator('#resize-rows').fill('7');
  await expect(page.locator('#resize-summary')).toContainText('Removes the bottom 2 rows.');
  await expect(page.locator('#resize-summary')).toContainText('11 clues lose their entry and move to Unattached clues.');
  await page.locator('#puzzle-settings #btn-resize').click();    // a second press closes the form
  await expect(page.locator('#resize-form')).toHaveCount(0);
  await expect(page.locator('rect.grid-cell, rect.grid-block')).toHaveCount(9 * 17);
  await openGrid(page);
  await page.locator('#puzzle-settings #btn-resize').click();
  await page.locator('#resize-rows').fill('7');
  await page.locator('#resize-apply').click();
  await expect(page.locator('rect.grid-cell, rect.grid-block')).toHaveCount(7 * 17);
  await showPhase(page, 'clues');
  await expect(page.locator('#orphan-tray .orphan')).toHaveCount(11);
});

test('a Crushword fixture round-trips through the editor', async ({ page }) => {
  const file = path.join(FIXTURES, 'cw-rebus-5.yaml');
  await openFile(page, file);
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const exported = yaml.load(await download(page, '#export-yaml'));
  const original = yaml.load(fs.readFileSync(file, 'utf8'));
  expect(buildFromObject(exported, {}, HOOKS).html).toBe(buildFromObject(original, {}, HOOKS).html);
});

test('the Board phase shows Crushword\'s word list and checks', async ({ page }) => {
  await openFile(page, EXAMPLE);
  const src = yaml.load(fs.readFileSync(EXAMPLE, 'utf8'));
  await expect(page.locator('#word-list .word-row')).toHaveCount(Object.keys(src.across).length + Object.keys(src.down).length);
  await cell(page, 1, 1).click();
  await expect(page.locator('.word-row.on')).toHaveCount(1);
  await expect(page.locator('.word-row.crossing')).toHaveCount(1);
  await expect(page.locator('#checks')).toContainText('Symmetric');
});

test('the Board phase fits one screen at laptop size', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, EXAMPLE);
  const fits = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight <= window.innerHeight,
    pane: (el => el.scrollHeight <= el.clientHeight)(document.getElementById('edit-view')),
  }));
  expect(fits).toEqual({ page: true, pane: true });
  const box = await page.locator('#board').boundingBox();
  expect(box.height).toBeGreaterThan(300);
});

test('Tab walks clue to clue, one stop per entry, and the board follows', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  const inputs = page.locator('.clue-row .clue-input');
  await inputs.nth(0).focus();
  await expect(page.locator('.clue-row.on')).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(inputs.nth(1)).toBeFocused();
  await expect(page.locator('.clue-row.on .clue-input')).toBeFocused();
  // No spacing field in Crushword: Shift+Tab goes straight to the previous clue.
  await page.keyboard.press('Shift+Tab');
  await expect(inputs.nth(0)).toBeFocused();
  await expect(page.locator('#entry-display')).toHaveCount(0);
  // The last clue's Tab leaves the list: no wrap, no trap.
  await expectTabLeavesClues(page, inputs.last());
});

test('focusing the clue of the entry the caret is in leaves the caret, and a different entry clue moves it', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await cell(page, 1, 3).click();
  await showPhase(page, 'clues');
  const caret = async () => JSON.stringify(await caretAt(page));
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

test('a clue field is named by its direction and number', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  await expect(page.locator('.clue-row[data-dir="A"] .clue-input').first()).toHaveAccessibleName('Clue for Across 1');
  await expect(page.locator('.clue-row[data-dir="D"] .clue-input').first()).toHaveAccessibleName(/^Clue for Down \d+$/);
});

test('a missing-clue problem focuses that slot\'s clue', async ({ page }) => {
  await newGrid(page);
  await page.locator('#problems-chip').click();
  const item = page.locator('#diagnostics .diag-jump', { hasText: /^Down 3 has no clue\.$/ });
  await item.click();
  await expect(page.locator('#phase-steps [data-view="clues"]')).toHaveAttribute('aria-current', 'step');
  const input = page.locator('.clue-row.on .clue-input');
  await expect(input).toBeFocused();
  await expect(page.locator('.clue-row.on')).toHaveAttribute('data-dir', 'D');
  await expect(input).toHaveAccessibleName('Clue for Down 3');
});
