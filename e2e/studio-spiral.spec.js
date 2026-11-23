'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { serveStudio } = require('./studio-server');
const { cellMenuItem, expectTabLeavesClues, openStudio, openStudioFile, downloadText: download, typeBoard: type, showPhase } = require('./helpers');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { HOOKS } = require('../spiral/src/builder');
const { validate } = require('../spiral/src/validator');

let studio;
test.beforeAll(async () => { studio = await serveStudio(); });
test.afterAll(async () => { await studio.close(); });

const REPO = path.resolve(__dirname, '..');
const REBUS_40 = path.join(REPO, 'spiral/test/fixtures/rebus-40.yaml');
const EXAMPLE = path.join(REPO, 'examples/spiral.yaml');

// ---- helpers ----------------------------------------------------------------

const start = (page) => openStudio(page, studio.url);

async function newSpiral(page, cells = 40) {
  await start(page);
  await page.locator('#welcome [data-kind="spiral"]').click();
  await page.locator('#new-size-cells').fill(String(cells));
  await page.locator('#new-size-create').click();
  await expect(page.locator('#board')).toBeVisible();
}

// Types the 40-letter test sequence from the first cell.
async function fillSpiral(page) {
  await cell(page, 0).click();
  await type(page, 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN');
}

const openFile = (page, file) => openStudioFile(page, studio.url, file);

// Gap lines are clicked plainly, not forced. Spiral's are diagonal, so Playwright sees
// them as visible and waits for the click point to settle, which matters after a clue
// fill scrolls the pane: a forced click missed about 1 run in 8 in Firefox. Snake
// Charmer's and Marching Bands' are axis-aligned, so their boxes have zero width,
// Playwright calls them hidden, and their specs use clickGapLine (e2e/helpers.js).
const cell = (page, i) => page.locator(`.sp-cell[data-index="${i}"]`);
const letter = (page, i) => page.locator(`.sp-ltr[data-index="${i}"]`);
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
  await expect(page.locator('#export-page')).toBeDisabled();
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
test('typed accented letters fill their base letter and digits fill like letters, as on the puzzle page', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 0).click();
  await type(page, 'ÑÉ2');
  for (const [i, ch] of ['N', 'E', '2'].entries()) await expect(letter(page, i)).toHaveText(ch);
  await expect(cell(page, 3)).toHaveClass(/caret/);
});

test('Enter composes a multi-letter cell', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 3).click();
  await page.locator('#board-input').focus();
  await page.keyboard.press('Enter');
  await type(page, 'HAR');
  await page.keyboard.press('Enter');
  await expect(letter(page, 3)).toHaveText('HAR');
  await expect(cell(page, 3)).toHaveClass(/caret/);
});

test('a boundary click splits an inward entry', async ({ page }) => {
  await newSpiral(page);
  await page.locator('.sp-gap[data-gap="4"]').click();
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

test('Insert cell after and before put a new empty cell on that side of the caret', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 0).click();
  await type(page, 'ABC');
  await cell(page, 1).click();
  await cellMenuItem(page, 'btn-insert-after');
  await expect(page.locator('.sp-cell')).toHaveCount(41);
  await expect(page.locator('#meter-cells')).toContainText('41');
  await expect(letter(page, 1)).toHaveText('B');
  await expect(letter(page, 2)).toHaveCount(0);
  await expect(letter(page, 3)).toHaveText('C');
  await cellMenuItem(page, 'btn-insert-before');   // the caret is still on B
  await expect(letter(page, 1)).toHaveCount(0);
  await expect(letter(page, 2)).toHaveText('B');
});

test('undo restores a removed break', async ({ page }) => {
  await newSpiral(page);
  const gap = page.locator('.sp-gap[data-gap="4"]');
  await gap.click();
  await expect(page.locator('#meter-inward')).toContainText('2 entries');
  await gap.click();
  await expect(page.locator('#meter-inward')).toContainText('1 entry');
  await page.locator('#btn-undo').click();
  await expect(page.locator('#meter-inward')).toContainText('2 entries');
});

test('the selected clue row follows the cursor and the crossing one is tinted', async ({ page }) => {
  await openFile(page, REBUS_40);
  await showPhase(page, 'clues');
  await cell(page, 5).click();
  await expect(page.locator('.clue-row.on')).toHaveAttribute('data-cut', 'inward');
  await expect(page.locator('.clue-row.on .clue-label')).toContainText('6');
  await expect(page.locator('.clue-row.crossing')).toBeVisible();
  await page.locator('.clue-row.on .clue-input').fill('my own clue');
  await expect(page.locator('.clue-row[data-cut="inward"][data-entry="1"] .clue-input')).toHaveValue('my own clue');
});

test('a removed break\'s clue goes to the orphan tray and can be reattached', async ({ page }) => {
  await newSpiral(page);
  await showPhase(page, 'clues');
  await page.locator('.sp-gap[data-gap="4"]').click();
  await cell(page, 10).click();
  await page.locator('.clue-row.on .clue-input').fill('second entry clue');
  await page.locator('.sp-gap[data-gap="4"]').click();
  await expect(page.locator('#orphan-tray .orphan')).toHaveCount(1);
  await page.locator('#orphan-tray .orphan-target').selectOption('inward:0');
  await page.locator('#orphan-tray .orphan-attach').click();
  await expect(page.locator('#orphan-tray')).toHaveCount(0);
  await expect(page.locator('.clue-row.on .clue-input')).toHaveValue('second entry clue');
});

test('a complete puzzle exports YAML that validates', async ({ page }) => {
  await newSpiral(page);
  await fillSpiral(page);
  await page.locator('.sp-gap[data-gap="20"]').click();
  await page.locator('#cut-toggle [data-cut="outward"]').click();
  await page.locator('.sp-gap[data-gap="20"]').click();
  await page.locator('#header-title').fill('Made In The Studio');
  await showPhase(page, 'clues');
  const inputs = page.locator('.clue-input');
  await expect(inputs).toHaveCount(4);
  for (let i = 0; i < 4; i++) await inputs.nth(i).fill(`Clue number ${i + 1}`);
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const text = await download(page, '#export-yaml');
  const puzzle = yaml.load(text);
  expect(puzzle.title).toBe('Made In The Studio');
  expect(validate(puzzle).errors).toEqual([]);
});

test('typing in the instructions grows the field, and undo restores it', async ({ page }) => {
  await newSpiral(page);
  const field = page.locator('#header-instructions');
  await field.fill('First line.');
  const one = (await field.boundingBox()).height;
  await page.locator('#header-title').fill('A title');   // a different key, so undo steps back one edit
  await field.fill('First paragraph.\n\nSecond paragraph.');
  expect((await field.boundingBox()).height).toBeGreaterThan(one);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(field).toHaveValue('First line.');
});

// StructuredShell's key handler, shared by every editor: the browser's text undo would
// commit its result as a new step and so clear redo.
// Only the document's undo can reach another field's edit, or leave redo standing.
test('Ctrl+Z in a clue steps the document back, past the clue\'s own edits', async ({ page }) => {
  await newSpiral(page);
  await showPhase(page, 'clues');
  const inputs = page.locator('.clue-input');
  await inputs.first().fill('First clue');
  await inputs.nth(1).fill('Second clue');   // a different key, so undo steps back one clue
  await inputs.nth(1).press('ControlOrMeta+z');
  await expect(inputs.nth(1)).toHaveValue('');
  await inputs.nth(1).press('ControlOrMeta+z');
  await expect(inputs.first()).toHaveValue('');
  await expect(page.locator('#btn-redo')).toBeEnabled();
  await inputs.nth(1).press('ControlOrMeta+Shift+z');
  await expect(inputs.first()).toHaveValue('First clue');
});

// The board handles its own undo keys, and the handler above must leave them alone.
test('Ctrl+Z on the board undoes one run of typing, once', async ({ page }) => {
  await newSpiral(page);
  await page.locator('#board-input').focus();
  await page.keyboard.type('A');
  await page.keyboard.press('ArrowRight');   // ends the run
  await page.keyboard.type('B');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(letter(page, 2)).toHaveCount(0);
  await expect(letter(page, 0)).toHaveText('A');
});

test('the title wraps but never takes a line break', async ({ page }) => {
  await newSpiral(page);
  const title = page.locator('#header-title');
  await title.fill('One\nTwo');
  await expect(title).toHaveValue('One Two');
  await title.press('End');
  await title.press('Enter');
  await expect(title).toHaveValue('One Two');
});

test('long instructions show as a few clipped lines until the field is focused', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newSpiral(page);
  const line = page.locator('.hs-instructions-line');
  const field = page.locator('#header-instructions');
  await expect(line).toHaveText('Add instructions');
  await field.fill('A long instruction. '.repeat(30));
  await page.locator('#header-title').click();
  await expect(line).toBeVisible();
  // Clamped to a few lines, with the rest clipped.
  expect(await line.evaluate(el => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflow === 'hidden')).toBe(true);
  // The field lies over the display, so a press lands on it, and it then shows in full.
  const clamped = (await line.boundingBox()).height;
  await field.click();
  await expect(field).toBeFocused();
  await expect(line).toBeHidden();
  expect((await field.boundingBox()).height).toBeGreaterThan(clamped);
});

// Each kind's fromYaml and toYaml are checked byte for byte by model-roundtrip.test.js;
// opening a file and exporting it are shared code, so one kind covers them.
test('a Spiral fixture round-trips through the editor', async ({ page }) => {
  await openFile(page, REBUS_40);
  await expect(page.locator('#problems-chip')).toContainText('Ready to export');
  await page.locator('#btn-export').click();
  const exported = yaml.load(await download(page, '#export-yaml'));
  const original = yaml.load(fs.readFileSync(REBUS_40, 'utf8'));
  expect(buildFromObject(exported, {}, HOOKS).html).toBe(buildFromObject(original, {}, HOOKS).html);
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

test('clicking the selected cell again switches direction, but focus given by opening does not count', async ({ page }) => {
  await newSpiral(page, 40);
  await expect(page.locator('#board-input')).toBeFocused();
  await page.locator('.sp-cell.caret').click();
  await expect(page.locator('#cut-toggle [data-cut="inward"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.sp-cell.caret').click();
  await expect(page.locator('#cut-toggle [data-cut="outward"]')).toHaveAttribute('aria-pressed', 'true');
});

test('after a click on a gap (no blur), the first click on the caret cell switches direction', async ({ page }) => {
  await newSpiral(page, 40);
  await expect(page.locator('#board-input')).toBeFocused();
  await page.locator('.sp-gap[data-gap="20"]').click();
  await page.locator('.sp-cell.caret').click();
  await expect(page.locator('#cut-toggle [data-cut="outward"]')).toHaveAttribute('aria-pressed', 'true');
});


test('a space typed alone, as a soft keyboard sends it, also clears the cell and moves on', async ({ page }) => {
  await newSpiral(page, 40);
  await cell(page, 0).click();
  await type(page, 'a');
  await page.keyboard.press('ArrowLeft');
  await expect(letter(page, 0)).toHaveText('A');
  await page.locator('#board-input').fill(' ');   // an input event with no keydown
  await expect(letter(page, 0)).toHaveCount(0);
  await type(page, 'b');
  await expect(letter(page, 1)).toHaveText('B');
});

test('pasting a spaced answer fills its letters and skips its spaces', async ({ page }) => {
  await newSpiral(page, 40);
  await cell(page, 0).click();
  await page.locator('#board-input').fill('lie to');   // one input event, as a paste is
  for (const [i, ch] of [...'LIETO'].entries()) await expect(letter(page, i)).toHaveText(ch);
  await expect(letter(page, 5)).toHaveCount(0);
});

test('the Board phase shows the word list, checks and key strip', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await expect(page.locator('#word-list .word-row[data-cut="inward"]')).toHaveCount(13);
  await expect(page.locator('#word-list .word-row[data-cut="outward"]')).toHaveCount(14);
  await cell(page, 5).click();
  await expect(page.locator('.word-row.on')).toHaveCount(1);
  await expect(page.locator('.word-row.crossing')).toHaveCount(1);
  await expect(page.locator('#checks #meter-cells')).toContainText('78');
  await expect(page.locator('#key-strip')).toBeVisible();
  await expect(page.locator('#keys')).toHaveCount(0);
  await page.locator('#btn-keys').click();
  await expect(page.locator('#keys')).toContainText('Clicking the selected cell again');
});

test('a word-list row moves the caret to its entry', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await page.locator('.word-row[data-cut="outward"][data-entry="2"]').click();
  await expect(page.locator('.word-row.on')).toHaveAttribute('data-cut', 'outward');
  await expect(page.locator('.word-row.on')).toHaveAttribute('data-entry', '2');
  await expect(page.locator('#cut-toggle [data-cut="outward"]')).toHaveAttribute('aria-pressed', 'true');
});

test('the Board phase fits one screen at laptop size, and its side column scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, EXAMPLE);
  const fits = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight <= window.innerHeight,
    pane: (el => el.scrollHeight <= el.clientHeight)(document.getElementById('edit-view')),
    side: (el => el.scrollHeight > el.clientHeight)(document.querySelector('.phase-side-col')),
  }));
  expect(fits).toEqual({ page: true, pane: true, side: true });
  const box = await page.locator('#board').boundingBox();
  expect(box.height).toBeGreaterThan(300);
});

test('switching phase keeps the caret and board focus', async ({ page }) => {
  await newSpiral(page);
  await cell(page, 7).click();
  await showPhase(page, 'clues');
  await showPhase(page, 'board');
  await type(page, 'Q');
  await expect(letter(page, 7)).toHaveText('Q');
});

test('the word-list row at the caret scrolls into view in the side column', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, EXAMPLE);
  await cell(page, 0).click();
  await page.locator('#cut-toggle [data-cut="outward"]').click();   // the last outward row sits below the fold
  // The scroll runs in an effect after paint, so poll for it. The active row wins over
  // the crossing one, which can sit too far away to share the column's view.
  await expect.poll(() => page.evaluate(() => {
    const side = document.querySelector('.phase-side-col').getBoundingClientRect();
    const row = document.querySelector('.word-row.on').getBoundingClientRect();
    return row.top >= side.top && row.bottom <= side.bottom;
  })).toBe(true);
});

// ---- the Clues phase --------------------------------------------------------

test('Tab walks clue to clue and the board follows; Shift+Tab reaches the spacing field', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  const inward = page.locator('.clue-row[data-cut="inward"] .clue-input');
  await inward.nth(0).focus();
  await page.keyboard.press('Tab');
  await expect(inward.nth(1)).toBeFocused();
  await expect(page.locator('.clue-row.on[data-entry="1"]')).toHaveCount(1);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.clue-row.on[data-entry="1"] #entry-display')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(inward.nth(0)).toBeFocused();
  // The last clue's Tab leaves the list: no wrap, no trap.
  await expectTabLeavesClues(page, page.locator('.clue-row[data-cut="outward"] .clue-input').last());
});

test('keys typed in a clue stay in the clue', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  const board = () => page.evaluate(() => ({
    letters: [...document.querySelectorAll('.sp-ltr')].map(e => e.textContent).join(''),
    breaks: document.querySelectorAll('.sp-break').length,
  }));
  const before = await board();
  const direction = () => page.locator('#cut-toggle [aria-pressed="true"]').getAttribute('data-cut');
  const dirBefore = await direction();
  const input = page.locator('.clue-row[data-cut="inward"][data-entry="2"] .clue-input');
  await input.focus();
  await page.keyboard.press('End');
  await page.keyboard.type('a.b|c #');
  await page.keyboard.press('Space');
  await page.keyboard.press('Delete');
  await expect(input).toHaveValue(/a\.b\|c #/);
  await expect(input).toBeFocused();
  expect(await board()).toEqual(before);
  expect(await direction()).toBe(dirBefore);   // the typed `.` did not switch direction
});

test('clicking a cell selects its row and tints the crossing one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  await cell(page, 60).click();
  await expect(page.locator('.clue-row.on')).toHaveCount(1);
  await expect(page.locator('.clue-row.crossing')).toHaveCount(1);
  // The scroll runs in an effect after paint, so poll. Both rows share the column here.
  // scrollTop rounds to whole pixels, so allow a pixel of slack.
  await expect.poll(() => page.evaluate(() => {
    const side = document.querySelector('.phase-side-col').getBoundingClientRect();
    return ['.clue-row.on', '.clue-row.crossing'].map(sel => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return r.top >= side.top - 1 && r.bottom <= side.bottom + 1;
    });
  })).toEqual([true, true]);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test('the spaced answer is edited on the selected row and reports its match', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  await page.locator('.clue-row[data-cut="inward"][data-entry="2"] .clue-input').focus();
  await expect(page.locator('#entry-display')).toHaveCount(1);
  await expect(page.locator('#entry-display')).toHaveValue('WAH-WAH');
  await expect(page.locator('#entry-display-status')).toContainText('Matches the cells');
  await page.locator('#entry-display').fill('WAH WAHS');
  await expect(page.locator('#entry-display-status')).toContainText('Doesn’t match');
  await page.locator('.clue-row[data-cut="inward"][data-entry="3"] .clue-input').focus();
  await expect(page.locator('#entry-display')).toHaveCount(1);
  await expect(page.locator('.clue-row[data-entry="3"] #entry-display')).toBeVisible();
});

test('a Clues-phase board edit that orphans a clue scrolls the tray into view, and focus stays on the board', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  await expect(page.locator('#orphan-tray')).toHaveCount(0);
  // JAM is the last inward entry, so selecting it scrolls the column down.
  await page.locator('.clue-row[data-cut="inward"][data-entry="12"] .clue-answer').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('.phase-side-col').scrollTop)).toBeGreaterThan(0);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Delete');
  await expect(page.locator('#orphan-tray .orphan')).toContainText('Phish hook?');
  await expect.poll(() => page.evaluate(() => {
    const side = document.querySelector('.phase-side-col').getBoundingClientRect();
    const tray = document.getElementById('orphan-tray').getBoundingClientRect();
    return tray.top >= side.top - 1 && tray.bottom <= side.bottom + 1;
  })).toBe(true);
  await expect(page.locator('#board-input')).toBeFocused();
});

// True when `sel`'s box lies inside the side column's visible box.
const inSideColumn = (page, sel) => page.evaluate((s) => {
  const side = document.querySelector('.phase-side-col').getBoundingClientRect();
  const r = document.querySelector(s).getBoundingClientRect();
  return r.top >= side.top - 1 && r.bottom <= side.bottom + 1;
}, sel);

test('a Board-phase edit that orphans a clue shows the loose-clue notice in view, and Show in Clues brings the tray into view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openFile(page, EXAMPLE);
  await expect(page.locator('#loose-clues-notice')).toBeHidden();
  // JAM is the last inward entry; deleting its cells leaves its clue loose.
  await page.locator('.word-row[data-cut="inward"][data-entry="12"] button').click();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Delete');
  await expect(page.locator('#loose-clues-notice')).toContainText('1 clue');
  await expect.poll(() => inSideColumn(page, '#loose-clues-notice')).toBe(true);
  await page.locator('#loose-clues-notice button').click();
  await expect(page.locator('#phase-steps [data-view="clues"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#orphan-tray')).toBeVisible();
  await expect.poll(() => inSideColumn(page, '#orphan-tray')).toBe(true);
});

test('focusing the clue of the entry the caret is already in leaves the caret where it is', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  await cell(page, 6).click();   // inside DEREK (cells 5–9)
  const caret = () => page.locator('.sp-caret').getAttribute('d');
  const before = await caret();
  await page.locator('.clue-row[data-cut="inward"][data-entry="1"] .clue-input').focus();
  expect(await caret()).toBe(before);
  // A clue of another entry does move it, to that entry's first cell.
  await page.locator('.clue-row[data-cut="inward"][data-entry="2"] .clue-input').focus();
  await expect(page.locator('.clue-row.on')).toHaveAttribute('data-entry', '2');
  expect(await caret()).not.toBe(before);
});

// ---- problem jumps ----------------------------------------------------------

const jumpTo = async (page, text) => {
  await page.locator('#problems-chip').click();
  await page.locator('#diagnostics .diag-jump', { hasText: text }).click();
};

test('a missing-clue problem opens Clues with that clue focused', async ({ page }) => {
  await newSpiral(page);
  await jumpTo(page, /Inward 1 .* has no clue/);
  await expect(page.locator('#phase-steps [data-view="clues"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.clue-row.on[data-cut="inward"][data-entry="0"] .clue-input')).toBeFocused();
  // A clue away from the caret: the caret moves to that entry and its clue is focused.
  await jumpTo(page, /Outward 1 .* has no clue/);
  await expect(page.locator('.clue-row.on[data-cut="outward"][data-entry="0"] .clue-input')).toBeFocused();
});

test('a clue jump reveals the focused clue in the scrolling column', async ({ page }) => {
  await openFile(page, EXAMPLE);
  await showPhase(page, 'clues');
  // Blank the last Inward clue and scroll the column up; the jump must scroll it back.
  const last = page.locator('.clue-row[data-cut="inward"] .clue-input').last();
  await last.fill('');
  await page.locator('.phase-side-col').evaluate(el => { el.scrollTop = 0; });
  await jumpTo(page, /Inward \d+ .* has no clue/);
  const input = page.locator('.clue-row.on .clue-input');
  await expect(input).toBeFocused();
  expect(await input.evaluate(el => {
    const c = el.closest('.phase-side-col').getBoundingClientRect(), r = el.getBoundingClientRect();
    return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
  })).toBe(true);
});

test('an empty-cells problem opens Board', async ({ page }) => {
  await newSpiral(page);
  await showPhase(page, 'clues');
  await jumpTo(page, 'Cells 1–40 are empty.');
  await expect(page.locator('#phase-steps [data-view="board"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#board-input')).toBeFocused();
});

test('the title problem focuses the title from Test-solve', async ({ page }) => {
  await newSpiral(page);
  await showPhase(page, 'test');
  await jumpTo(page, 'Give the puzzle a title.');
  await expect(page.locator('#phase-steps [data-view="board"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#header-title')).toBeFocused();
});
