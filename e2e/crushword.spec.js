'use strict';

// Browser-engine behavior specific to Crushword — what node:test can't cover: sticky
// active-clue bar/grid geometry, entry-based Tab navigation, direction auto-flip, and
// cursor movement and editing inside multi-letter cells (every cell composes on its own
// keystrokes, so there is no rebus button). Behavior it shares with the other engines
// lives in e2e/shared.spec.js; its menu-button test stays here because it starts from a
// different fixture and asserts that confirming Clear also closes the menu.

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzle } = require('../crushword/cli');
const { cellLetterPairs, fillCrushwordCell, solveCrushwordBoard } = require('./helpers');
const { sha256hex } = require('../shared/sha256hex.mjs');

const FIX = path.join(__dirname, '..', 'crushword', 'test', 'fixtures');

let htmlPath, hashedPath, rebusPath, tmpDir;

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  hashedPath = path.join(tmpDir, 'puzzle-hashed.html');
  buildPuzzle(path.join(FIX, 'cw-9.yaml'),          htmlPath);
  buildPuzzle(path.join(FIX, 'cw-9.muddled.yaml'),  hashedPath);

  rebusPath       = path.join(tmpDir, 'rebus.html');
  buildPuzzle(path.join(FIX, 'cw-rebus-5.yaml'),         rebusPath);
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function ready(page) {
  await expect(page.locator('#puzzle-svg .cell').first()).toBeVisible();
  await page.evaluate(() => document.getElementById('hidden-input').focus());
}

async function boardLetters(page) {
  return page.evaluate(() => window.PUZZLE_DATA.letters);
}

test('banners are state-derived and partial correctness stays hidden', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#done-wrong')).toBeHidden();

  const letters = await boardLetters(page);
  const pairs = cellLetterPairs(letters);
  const wrongFirst = pairs[0].letter.toLowerCase() === 'z' ? 'y' : 'z';
  await fillCrushwordCell(page, pairs[0].id, wrongFirst);
  for (const { id, letter } of pairs.slice(1)) await fillCrushwordCell(page, id, letter);

  await expect(page.locator('#done-wrong')).toBeVisible();
  await expect(page.locator('#congrats')).toBeHidden();
  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(0);
});

test('clue and instructions text render markdown formatting, not literal syntax', async ({ page }) => {
  // A dedicated, minimally constructed puzzle (root CLAUDE.md's testing
  // philosophy prefers this over perturbing a shared fixture used by many
  // other tests) — the markdown *parsing* itself is unit-tested exhaustively
  // in shared/test/renderMarkdown.test.js; this only proves the wiring
  // (processEntries -> PUZZLE_DATA -> innerHTML) actually reaches the DOM.
  const yamlPath = path.join(tmpDir, 'markdown-test.yaml');
  const htmlPath = path.join(tmpDir, 'markdown-test.html');
  fs.writeFileSync(yamlPath, [
    'kind: crushword',
    'title: "Markdown Test"',
    'instructions: "Solve it. **Enjoy!**\\n\\nSecond paragraph with a [link](https://example.com)."',
    'grid:',
    '  - "..."',
    '  - "..."',
    '  - "..."',
    'across:',
    '  1:',
    '    clue: "**Bold**, *italic*, `code`, [link](https://x.com), ~~strike~~, H~2~O, 29^th^, :smile:"',
    '    answer: "CAT"',
    '  4:',
    '    clue: "d"',
    '    answer: "DOG"',
    '  5:',
    '    clue: "e"',
    '    answer: "ANT"',
    'down:',
    '  1:',
    '    clue: "f"',
    '    answer: "CDA"',
    '  2:',
    '    clue: "g"',
    '    answer: "AON"',
    '  3:',
    '    clue: "h"',
    '    answer: "TGT"',
  ].join('\n'));
  buildPuzzle(yamlPath, htmlPath);

  await page.goto('file://' + htmlPath);
  await ready(page);

  const clueHtml = await page.locator('#across-clues .clue-item').first().locator('.clue-text').innerHTML();
  assert.match(clueHtml, /<strong>Bold<\/strong>/);
  assert.match(clueHtml, /<em>italic<\/em>/);
  assert.match(clueHtml, /<code>code<\/code>/);
  // target="_blank"/rel — see the click-guard test below for why this matters
  // beyond convention: without it, clicking a clue link would navigate the
  // puzzle page itself away.
  assert.match(clueHtml, /<a href="https:\/\/x\.com" target="_blank" rel="noopener noreferrer">link<\/a>/);
  assert.match(clueHtml, /<s>strike<\/s>/);
  assert.match(clueHtml, /H<sub>2<\/sub>O/);
  assert.match(clueHtml, /29<sup>th<\/sup>/);
  await expect(page.locator('#across-clues .clue-item').first().locator('.clue-text')).toContainText('😄');

  const instructionsHtml = await page.locator('#instructions').innerHTML();
  assert.match(instructionsHtml, /<p>Solve it\. <strong>Enjoy!<\/strong><\/p>/);
  assert.match(instructionsHtml, /<p>Second paragraph with a <a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">link<\/a>\.<\/p>/);
});

test('clicking a link inside a clue opens it in a new tab without also selecting that entry', async ({ page, context }) => {
  const yamlPath = path.join(tmpDir, 'markdown-link-click.yaml');
  const htmlPath = path.join(tmpDir, 'markdown-link-click.html');
  fs.writeFileSync(yamlPath, [
    'kind: crushword',
    'title: "Markdown Link Click Test"',
    'grid:',
    '  - "..."',
    '  - "..."',
    '  - "..."',
    'across:',
    '  1:',
    '    clue: "a"',
    '    answer: "CAT"',
    '  4:',
    '    clue: "See [reference](https://example.com) for background"',
    '    answer: "DOG"',
    '  5:',
    '    clue: "c"',
    '    answer: "ANT"',
    'down:',
    '  1:',
    '    clue: "d"',
    '    answer: "CDA"',
    '  2:',
    '    clue: "e"',
    '    answer: "AON"',
    '  3:',
    '    clue: "f"',
    '    answer: "TGT"',
  ].join('\n'));
  buildPuzzle(yamlPath, htmlPath);

  await page.goto('file://' + htmlPath);
  await ready(page);

  // Entry 1 (cell-1) is active by default; entry 4's clue holds the link.
  const before = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#across-clues .clue-item').nth(1).locator('.clue-text a').click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe('https://example.com/');
  await popup.close();

  // The click landed on the link, not the surrounding <li> — the active
  // cell/entry must be unchanged, proving the e.target.closest('a') guard
  // suppressed the clue-item's own click-to-select handler.
  const after = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
  expect(after).toBe(before);
});

test('the active-clue bar and sticky grid leave no gap for scrolled content to show through', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const reservedSpace = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('--active-clue-bar-space').trim());

  // The bar's content is shorter than its reserved space; its box must still fill it.
  const bar = await page.locator('#active-clue-bar').boundingBox();
  expect(bar.height + 'px').toBe(reservedSpace);

  // The grid sits over the clues, so it needs an opaque background, and its
  // breathing room must be padding inside that background, not a gap outside it.
  const style = await page.locator('.puzzle-center').evaluate(el => {
    const s = getComputedStyle(el);
    return { position: s.position, paddingTop: s.paddingTop, backgroundColor: s.backgroundColor };
  });
  expect(style.position).toBe('sticky');
  expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.paddingTop).toBe('16px');

  // Once stuck, the grid's box starts exactly at the bar's bottom edge.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const top = await page.locator('.puzzle-center').evaluate(el => el.getBoundingClientRect().top);
  expect(top + 'px').toBe(reservedSpace);
});

test('clicking a clue scrolled off the top of the view lands it below the sticky grid, not behind it', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto('file://' + htmlPath);
  await ready(page);

  // { force: true } bypasses Playwright's own pre-click auto-scroll-into-view, which
  // would otherwise land the clue in view on its own and mask the engine's scrollIntoView
  // call entirely — the same reason a naive click-based test never caught this bug.
  const downItems = page.locator('#down-clues .clue-item');
  await downItems.nth(await downItems.count() - 1).click({ force: true });
  await page.locator('#across-clues .clue-item').first().click({ force: true });

  const rects = await page.evaluate(() => ({
    clue:   document.querySelectorAll('#across-clues .clue-item')[0].getBoundingClientRect(),
    sticky: document.querySelector('.puzzle-center').getBoundingClientRect(),
  }));
  // The sticky grid+controls box paints over [0, sticky.bottom); native scrollIntoView
  // has no notion of that occlusion, so the fix must reserve that band itself
  // (scroll-padding-top) rather than rely on scrollIntoView alone.
  expect(rects.clue.top).toBeGreaterThanOrEqual(rects.sticky.bottom - 1);
});

test('a fully correct board opens the congrats dialog', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  await solveCrushwordBoard(page);
  await expect(page.locator('#congrats')).toBeVisible();
  await expect(page.locator('#done-wrong')).toBeHidden();
});

test('Tab advances to the next entry in the current direction, wrapping; Shift+Tab reverses', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const acrossNums = await page.evaluate(() =>
    Object.keys(window.PUZZLE_DATA.across).map(Number).sort((a, b) => a - b));

  async function activeClueNum() {
    return page.evaluate(() => {
      const li = document.querySelector('#across-clues .clue-item.active-clue, #down-clues .clue-item.active-clue');
      return Number(li.querySelector('.clue-num').textContent.replace('.', ''));
    });
  }

  expect(await activeClueNum(page)).toBe(acrossNums[0]);
  for (let i = 1; i < acrossNums.length; i++) {
    await page.keyboard.press('Tab');
    expect(await activeClueNum(page)).toBe(acrossNums[i]);
  }
  await page.keyboard.press('Tab'); // wraps
  expect(await activeClueNum(page)).toBe(acrossNums[0]);

  await page.keyboard.press('Shift+Tab');
  expect(await activeClueNum(page)).toBe(acrossNums[acrossNums.length - 1]);
});

test('period key toggles direction without moving the cursor; clicking the active cell does the same', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  // No dedicated direction-toggle control (removed to save vertical space) —
  // which clue column shows the active-clue highlight is the observable
  // signal of the current direction instead.
  const before = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
  await expect(page.locator('#across-clues .clue-item.active-clue')).toHaveCount(1);
  await expect(page.locator('#down-clues .clue-item.active-clue')).toHaveCount(0);

  await page.keyboard.press('.');
  const after = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
  expect(after).toBe(before);
  await expect(page.locator('#across-clues .clue-item.active-clue')).toHaveCount(0);
  await expect(page.locator('#down-clues .clue-item.active-clue')).toHaveCount(1);

  await page.locator(`#${after}`).click();
  await expect(page.locator('#across-clues .clue-item.active-clue')).toHaveCount(1);
  await expect(page.locator('#down-clues .clue-item.active-clue')).toHaveCount(0);
});

test('clicking a Down clue sets direction to down and focuses its first cell', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const firstDownNum = await page.evaluate(() =>
    Object.keys(window.PUZZLE_DATA.down).map(Number).sort((a, b) => a - b)[0]);
  await page.locator('#down-clues .clue-item').first().click();

  await expect(page.locator('#down-clues .clue-item.active-clue')).toHaveCount(1);
  const activeClueNum = await page.evaluate(() => {
    const li = document.querySelector('#down-clues .clue-item.active-clue .clue-num');
    return Number(li.textContent.replace('.', ''));
  });
  expect(activeClueNum).toBe(firstDownNum);
});

test('the active-clue banner shows the primary (and, when present, crossing) clue for the active cell', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  // The default active cell's across entry crosses a down entry — both
  // rows should show, matching whichever clue items the clue list itself
  // marks active/secondary.
  const [acrossNum, acrossClue] = await page.evaluate(() => {
    const li = document.querySelector('#across-clues .clue-item.active-clue');
    return [li.querySelector('.clue-num').textContent, li.querySelector('.clue-text').textContent];
  });
  await expect(page.locator('#active-clue-primary .active-clue-dir')).toHaveText('Across');
  await expect(page.locator('#active-clue-primary .active-clue-num')).toHaveText(acrossNum);
  await expect(page.locator('#active-clue-primary .active-clue-text')).toHaveText(acrossClue);
  await expect(page.locator('#active-clue-secondary')).toBeVisible();
  const [downNum, downClue] = await page.evaluate(() => {
    const li = document.querySelector('#down-clues .clue-item.secondary-entry');
    return [li.querySelector('.clue-num').textContent, li.querySelector('.clue-text').textContent];
  });
  await expect(page.locator('#active-clue-secondary .active-clue-dir')).toHaveText('Down');
  await expect(page.locator('#active-clue-secondary .active-clue-num')).toHaveText(downNum);
  await expect(page.locator('#active-clue-secondary .active-clue-text')).toHaveText(downClue);

  // Down[1]'s own first cell (idOf(0,1) = 2 in cw-9.yaml) has a down entry
  // but a horizontal run of length 1 there — no crossing across entry, per
  // the build warning "down[1]: cell (1, 2) has no crossing across entry".
  // The banner's secondary row must not show a stale or wrong clue for it.
  const firstDownNum = await page.evaluate(() =>
    document.querySelector('#down-clues .clue-item .clue-num').textContent);
  const firstDownClue = await page.evaluate(() =>
    document.querySelector('#down-clues .clue-item .clue-text').textContent);
  await page.locator('#down-clues .clue-item').first().click();
  await expect(page.locator('#active-clue-primary .active-clue-dir')).toHaveText('Down');
  await expect(page.locator('#active-clue-primary .active-clue-num')).toHaveText(firstDownNum);
  await expect(page.locator('#active-clue-primary .active-clue-text')).toHaveText(firstDownClue);
  await expect(page.locator('#active-clue-secondary')).toBeHidden();

  // The menu button sits within the bar's own band, vertically centered
  // against it (theme-components.css) — the bar's own min-height keeps its
  // rendered height pinned to --active-clue-bar-space even with only the
  // primary row shown here, so this holds regardless of row count.
  const [btn, bar] = await Promise.all([
    page.locator('#menu-btn').boundingBox(),
    page.locator('#active-clue-bar').boundingBox(),
  ]);
  expect(btn.y).toBeGreaterThanOrEqual(bar.y);
  expect(btn.y + btn.height).toBeLessThanOrEqual(bar.y + bar.height);
  expect(btn.y - bar.y).toBeCloseTo((bar.y + bar.height) - (btn.y + btn.height), 1); // centered
});

test('Up/Down crossing into a new cell switches to Down; Left/Right crossing switches back to Across', async ({ page }) => {
  // A fully-open 3x3 grid, so every cell belongs to both an across and a
  // down entry — the switch always has somewhere valid to land, with no
  // auto-flip fallback muddying which behavior the test is pinning.
  const yamlPath = path.join(tmpDir, 'direction-switch.yaml');
  const switchHtmlPath = path.join(tmpDir, 'direction-switch.html');
  fs.writeFileSync(yamlPath, [
    'kind: crushword',
    'title: "Direction Switch Test"',
    'grid:',
    '  - "..."',
    '  - "..."',
    '  - "..."',
    'across:',
    '  1:',
    '    clue: "a"',
    '    answer: "CAT"',
    '  4:',
    '    clue: "b"',
    '    answer: "DOG"',
    '  5:',
    '    clue: "c"',
    '    answer: "ANT"',
    'down:',
    '  1:',
    '    clue: "d"',
    '    answer: "CDA"',
    '  2:',
    '    clue: "e"',
    '    answer: "AON"',
    '  3:',
    '    clue: "f"',
    '    answer: "TGT"',
  ].join('\n'));
  buildPuzzle(yamlPath, switchHtmlPath);

  await page.goto('file://' + switchHtmlPath);
  await ready(page);

  // Starts on cell 1 (top-left), Across.
  await expect(page.locator('#across-clues .clue-item.active-clue')).toHaveCount(1);

  // ArrowDown crosses into cell 4 (directly below) and switches to Down.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#cell-4')).toHaveClass(/active-cell/);
  await expect(page.locator('#down-clues .clue-item.active-clue')).toHaveCount(1);
  await expect(page.locator('#across-clues .clue-item.active-clue')).toHaveCount(0);

  // From there, crossing right into cell 5 switches back to Across.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#cell-5')).toHaveClass(/active-cell/);
  await expect(page.locator('#across-clues .clue-item.active-clue')).toHaveCount(1);
  await expect(page.locator('#down-clues .clue-item.active-clue')).toHaveCount(0);
});

test('Up/Down carry the cursor position into the target cell instead of landing at its end', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Column 1 of cw-rebus-5.yaml has open cells stacked at ids 2, 7, 12, 17.
  await page.locator('#cell-12').click();
  await page.locator('#hidden-input').fill('X');
  await page.locator('#hidden-input').fill('Y'); // "XY", cursor after the Y

  await page.locator('#cell-7').click(); // commits cell 12; cursor defaults to the end here
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B'); // "AB", cursor after the B
  await page.keyboard.press('ArrowLeft'); // cursor between "A" and "B" (index 1)

  // Carries index 1 down into cell 12's "XY" — landing mid-content, not at
  // its end, which a click/Tab/Space-style default would have done instead.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#cell-12')).toHaveClass(/active-cell/);
  await page.locator('#hidden-input').fill('Z'); // inserts at index 1 (still under the cap)
  await expect(page.locator('#letter-12')).toHaveText('XZY');
});

test('Up/Down remember a "sticky column" through an intervening cell too short to hold it', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Column 1: cell 7 (top) gets two characters, cell 12 (middle) is left
  // empty, cell 17 (bottom) gets three (full, at maxCellLetters=3).
  await page.locator('#cell-7').click();
  await page.locator('#hidden-input').fill('X');
  await page.locator('#hidden-input').fill('Y'); // "XY"

  await page.locator('#cell-17').click();
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B');
  await page.locator('#hidden-input').fill('C'); // "ABC" reaches the cap, auto-advances away
  await page.locator('#cell-17').click(); // revisit; a click lands at the true end (index 3)

  // Index 3 survives the empty cell 12 in between (which can only clamp
  // cursorPos itself to 0, not the remembered column) and reasserts itself
  // against cell 7's two characters, landing at index 2 — not index 0,
  // which cursorPos's own post-clamp value would have produced without a
  // separately remembered column.
  await page.keyboard.press('ArrowUp'); // cell 17 -> cell 12 (empty; clamps to 0)
  await expect(page.locator('#cell-12')).toHaveClass(/active-cell/);
  await page.keyboard.press('ArrowUp'); // cell 12 -> cell 7 (clamps remembered index 3 to 2)
  await expect(page.locator('#cell-7')).toHaveClass(/active-cell/);
  await page.locator('#hidden-input').fill('Z'); // at index 2 (the end of "XY"): appends
  await expect(page.locator('#letter-7')).toHaveText('XYZ');
});

test('typing multiple letters into a cell holds the cursor and fills it, with no rebus mode to open', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await expect(page.locator('#cell-2')).not.toHaveClass(/composing/);
  await page.locator('#hidden-input').fill('T');
  await expect(page.locator('#cell-2')).toHaveClass(/composing/); // the first keystroke opens it
  await page.locator('#hidden-input').fill('H');
  await expect(page.locator('#letter-2')).toHaveText('TH');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  // Two letters fit at full size. Checked via the COMPUTED transform: an empty
  // inline value would fall through to .len-2's scale (see fitLetterToCell).
  const computed = await page.locator('#letter-2').evaluate(el => getComputedStyle(el).transform);
  expect(computed).toBe('none');
});

test('the composing cell has no dashed outline in Crushword, unlike the other tools', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await page.locator('#hidden-input').fill('T');
  await expect(page.locator('#cell-2')).toHaveClass(/composing/);

  // Composing is the common case here (active on nearly every cell while
  // typing), not an exceptional rebus state, so the shared dashed treatment
  // is suppressed for Crushword — see the .tool-crushword override in
  // shared/themes/theme-components.css.
  const dash = await page.locator('#cell-2').evaluate(el => getComputedStyle(el).strokeDasharray);
  expect(dash).toBe('none');
});

test('Left/Right move letter by letter within a cell before crossing into the next/previous one', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2, the two-letter group
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH", cursor after the H

  // Two ArrowLeft presses walk back across "TH" one letter at a time...
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/); // still cell 2
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/); // still cell 2 (cursor now before "T")
  // ...and only the third crosses into the previous cell.
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/);

  // Symmetrically for the right: cell 2 still holds "TH", so two ArrowRight
  // presses cross back into it and out the other side, three cross into cell 3.
  await page.keyboard.press('ArrowRight'); // -> cell 2, cursor before "T"
  await page.keyboard.press('ArrowRight'); // cursor between "T" and "H"
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  await page.keyboard.press('ArrowRight'); // cursor after "H"
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#cell-3')).toHaveClass(/active-cell/);
});

test('Option/Alt+Left and Option/Alt+Right jump the cursor to the start/end of the cell without crossing into the next one', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2, the two-letter group
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH" (maxCellLetters=3), cursor after the H

  // Jumps straight to the front, staying in cell 2 (not crossing to cell 1
  // the way a plain ArrowLeft eventually would).
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  await page.locator('#hidden-input').fill('X'); // inserts at the front (still under maxCellLetters)
  await expect(page.locator('#letter-2')).toHaveText('XTH');

  // Jumps straight to the end, still staying in cell 2.
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  // A plain ArrowRight from the true end then crosses out, same as always.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#cell-3')).toHaveClass(/active-cell/);
});

test('Option/Alt+Left and Option/Alt+Right, from an edge already, cross into the adjacent cell landing at its corresponding far edge', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Cell 1 holds a single letter ('A') in cw-rebus-5.yaml; extend it to two
  // characters so its start and end are distinguishable.
  await page.locator('#cell-1').click();
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B'); // "AB", cursor after the B

  await page.locator('#cell-2').click(); // commits cell 1, revisit cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH", cursor after the H

  // Alt+Left to cell 2's own front, then Alt+Left again crosses into cell 1
  // landing at cell 1's START (not its end) — a plain ArrowLeft crossing
  // would land at the end instead, which is exactly the distinction here.
  await page.keyboard.press('Alt+ArrowLeft');
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/);
  await page.locator('#hidden-input').fill('Z'); // inserts at the front
  await expect(page.locator('#letter-1')).toHaveText('ZAB');

  // Alt+Right to cell 1's own end, then Alt+Right again crosses into cell 2
  // landing at cell 2's END (not its start).
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  await page.locator('#hidden-input').fill('Y'); // inserts/appends at the end
  await expect(page.locator('#letter-2')).toHaveText('THY');
});

test('typing with the cursor positioned mid-cell inserts there while under maxCellLetters, leaving the rest intact', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH" (maxCellLetters=3), cursor after the H
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // cursor now before the "T"

  // Still under the cap (2 < 3): typing inserts rather than overwriting.
  await page.locator('#hidden-input').fill('X');
  await expect(page.locator('#letter-2')).toHaveText('XTH');

  // Backspace right after an insert deletes the character just placed, not
  // the one after it — cursorPos advanced past it, same as typing does.
  await page.keyboard.press('Backspace');
  await expect(page.locator('#letter-2')).toHaveText('TH');
});

test('typing at cursorPos overwrites once the cell is already at maxCellLetters, since there is no room left to insert', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H');
  await page.locator('#hidden-input').fill('E'); // "THE" reaches maxCellLetters=3, auto-advances to cell 3
  await expect(page.locator('#cell-3')).toHaveClass(/active-cell/);

  await page.locator('#cell-2').click(); // revisit; cursor defaults to the end (content length 3)
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // cursor between "T" and "H"

  await page.locator('#hidden-input').fill('X');
  await expect(page.locator('#letter-2')).toHaveText('TXE'); // replaced "H" in place, length unchanged
});

test('typing at a full cell\'s very end overwrites its last letter, then advances', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  for (const ch of 'THE') await page.locator('#hidden-input').fill(ch); // reaches maxCellLetters=3
  await page.locator('#cell-2').click(); // revisit; cursor defaults to the end

  await page.locator('#hidden-input').fill('X');
  await expect(page.locator('#letter-2')).toHaveText('THX');
  await expect(page.locator('#cell-3')).toHaveClass(/active-cell/);
  await expect(page.locator('#letter-3')).toHaveText(''); // nothing carried into the next cell
});

test('the input caret tracks the cursor within a cell and follows it into the next one', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);
  const caret = page.locator('.cell-caret');
  const caretX = async () => Number(await caret.getAttribute('x'));
  const cellBounds = id => page.locator(`#cell-${id}`).evaluate(el => ({
    left: Number(el.getAttribute('x')), right: Number(el.getAttribute('x')) + Number(el.getAttribute('width')),
  }));

  await page.keyboard.press('ArrowRight'); // cell 2
  await expect(caret).toBeVisible();
  const empty = await caretX();
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H');
  const end = await caretX();
  expect(end).toBeGreaterThan(empty);

  // ← steps the caret back through the letters: between them, then before both.
  await page.keyboard.press('ArrowLeft');
  const middle = await caretX();
  await page.keyboard.press('ArrowLeft');
  const front = await caretX();
  expect(middle).toBeLessThan(end);
  expect(front).toBeLessThan(middle);
  const cell2 = await cellBounds(2);
  expect(front).toBeGreaterThan(cell2.left);

  // Crossing into cell 1 moves the caret there.
  await page.keyboard.press('ArrowLeft');
  const cell1 = await cellBounds(1);
  const crossed = await caretX();
  expect(crossed).toBeGreaterThan(cell1.left);
  expect(crossed).toBeLessThan(cell1.right);
});

test('Space clears the current cell\'s content past the cursor before advancing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH" (maxCellLetters=3), cursor after the H
  await page.keyboard.press('ArrowLeft'); // cursor between "T" and "H" (the stray guess)

  await page.keyboard.press(' ');
  await expect(page.locator('#letter-2')).toHaveText('T'); // trailing "H" dropped
  await expect(page.locator('#cell-3')).toHaveClass(/active-cell/); // still advances
});

test('Space lands the cursor at the front of the next cell; Enter lands at its end', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Establish cell 2 ("TH") so its front and end are distinguishable.
  await page.keyboard.press('ArrowRight'); // cell 1 -> cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H');
  await page.locator('#cell-1').click(); // back to cell 1

  // Enter from cell 1 lands at cell 2's end — typing there appends.
  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  await page.locator('#hidden-input').fill('X');
  await expect(page.locator('#letter-2')).toHaveText('THX'); // "THX" now at maxCellLetters=3

  await page.locator('#cell-1').click();
  // Space from cell 1 lands at cell 2's front. "THX" is already at the
  // cap, so typing there overwrites the front character rather than
  // inserting — still proof of a front landing, since it's "T" (not "X")
  // that gets replaced.
  await page.keyboard.press(' ');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);
  await page.locator('#hidden-input').fill('Y');
  await expect(page.locator('#letter-2')).toHaveText('YHX');
});

test('retyping into a committed cell appends at its end rather than overwriting, while under maxCellLetters', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.locator('#hidden-input').fill('A'); // cell 1 is active at load
  await page.keyboard.press('ArrowRight'); // commit
  await page.locator('#cell-1').click(); // a click lands at the end of the content
  await page.locator('#hidden-input').fill('Z');
  await expect(page.locator('#letter-1')).toHaveText('AZ');
});

test('Backspace trims one character from an established multi-letter cell in place', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H');
  await page.keyboard.press('ArrowRight'); // commit, move to cell 3
  await page.locator('#cell-2').click();   // revisit the committed cell

  await page.keyboard.press('Backspace');
  await expect(page.locator('#letter-2')).toHaveText('T');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/); // cursor holds
});

test('Option/Alt+Backspace clears everything before the cursor in the cell, staying put while there is content to its left', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H');
  await page.locator('#hidden-input').fill('E'); // "THE" reaches maxCellLetters=3, auto-advances to cell 3
  await expect(page.locator('#cell-3')).toHaveClass(/active-cell/);

  await page.locator('#cell-2').click(); // revisit; cursor defaults to the end
  await page.keyboard.press('ArrowLeft'); // cursor between "H" and "E"
  await page.keyboard.press('Alt+Backspace');
  await expect(page.locator('#letter-2')).toHaveText('E'); // "TH" before the cursor cleared
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/); // stays put, doesn't retreat
});

test('Option/Alt+Backspace at the front of a cell retreats and clears the previous cell entirely', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Establish cell 1's content first, so clearing it is observable. (Cell 1
  // is already the active cell at page load — clicking it here would toggle
  // direction instead of focusing it, per onCellClick's same-cell rule.)
  await page.locator('#hidden-input').fill('A');

  await page.locator('#cell-2').click(); // commits cell 1
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH", cursor after the H
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // cursor at the front (index 0)

  await page.keyboard.press('Alt+Backspace');
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/); // retreats
  await expect(page.locator('#letter-1')).toHaveText(''); // the WHOLE cell cleared, not one character
  await expect(page.locator('#letter-2')).toHaveText('TH'); // cell 2 itself untouched

  // A harmless no-op on an already-empty previous cell.
  await page.locator('#cell-2').click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // front of cell 2 again
  await page.keyboard.press('Alt+Backspace');
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/);
  await expect(page.locator('#letter-1')).toHaveText('');
});

test('Backspace on an empty cell retreats and trims one character from the previous cell, not the whole thing', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H');
  await page.locator('#cell-3').click(); // commits cell 2, moves to the empty cell 3

  await page.keyboard.press('Backspace'); // cell 3 already empty: retreats to cell 2
  await expect(page.locator('#letter-2')).toHaveText('T');
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);

  // Repeated Backspace keeps trimming one character at a time, then
  // continues retreating once the cell it lands on is fully empty.
  await page.keyboard.press('Backspace');
  await expect(page.locator('#letter-2')).toHaveText('');
  await page.keyboard.press('Backspace'); // cell 2 now empty: retreats to cell 1
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/);
});

test('Backspace stepping back into the previous cell commits the cell it leaves', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.locator('#hidden-input').fill('A'); // cell 1
  await page.locator('#cell-2').click();
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); // front of cell 2

  await page.keyboard.press('Backspace');
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/);
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(1);
  await expect(page.locator('#cell-1')).toHaveClass(/composing/);
});

test('Clear resets the cursor along with the content it measured', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B'); // cell 1 "AB", cursor at 2
  await page.click('#menu-btn');
  await page.locator('#clear-btn').click();
  await page.locator('#clear-btn').click();

  // A cursor left at 2 would put this letter at position 3 and auto-advance.
  await page.locator('#hidden-input').fill('X');
  await expect(page.locator('#letter-1')).toHaveText('X');
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/);
});

test('a three-letter rebus cell renders with the len-3 class', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Cell (2,3) 0-indexed: idOf(2,3) = 2*5+3+1 = 14.
  await page.locator('#cell-14').click();
  for (const ch of ['I', 'N', 'G']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-14')).toHaveText('ING');
  await expect(page.locator('#letter-14')).toHaveClass(/len-3/);
  // The len-3 class still applies (semantic marker, kept for this exact
  // assertion), but its shared fixed transform:scale(0.45) must be
  // overridden — checked via computed style, since an empty inline value
  // would silently leave the class's scale in effect (see fitLetterToCell).
  const computed = await page.locator('#letter-14').evaluate(el => getComputedStyle(el).transform);
  expect(computed).toBe('none');
});

test('a cell auto-advances once it reaches the puzzle\'s maxCellLetters, keeping everything typed', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // cw-rebus-5.yaml doesn't set maxCellLetters, so it defaults to 3.
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('S');
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/); // still here after 2 letters
  await page.locator('#hidden-input').fill('D');
  await expect(page.locator('#letter-1')).toHaveText('ASD');
  await expect(page.locator('#cell-1')).not.toHaveClass(/active-cell/); // the 3rd letter advanced
  await expect(page.locator('#cell-2')).toHaveClass(/active-cell/);

  // A multi-character input event (paste, autocomplete) that overruns the
  // cap is truncated to it, then advances the same way.
  await page.locator('#hidden-input').fill('W');
  await page.locator('#hidden-input').fill('XYZ');
  await expect(page.locator('#letter-2')).toHaveText('WXY');
  await expect(page.locator('#cell-2')).not.toHaveClass(/active-cell/);
});

test('Enter commits the cell and advances to the next one, keeping all typed content', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  await page.keyboard.press('ArrowRight'); // cell 2, the two-letter group
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH", cursor after the H
  await page.keyboard.press('ArrowLeft'); // cursor between "T" and "H" — mid-cell
  await expect(page.locator('#cell-2')).toHaveClass(/composing/);
  // Check commits a composing cell itself, so it is available mid-composition.
  await expect(page.locator('#check-btn')).toBeEnabled();

  await page.keyboard.press('Enter');
  await expect(page.locator('#cell-2')).not.toHaveClass(/composing/);
  await expect(page.locator('#cell-2')).not.toHaveClass(/active-cell/);
  await expect(page.locator('#cell-3')).toHaveClass(/active-cell/);
  // Nothing past the cursor was trimmed — unlike Space (see its own test).
  await expect(page.locator('#letter-2')).toHaveText('TH');

});

test('Shift+Enter commits the cell and moves to the end of the previous one, keeping all typed content', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Establish cell 1's content so its end is distinguishable from its
  // front. (Cell 1 is already active at page load — no click needed.)
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B'); // "AB"

  await page.locator('#cell-2').click(); // commits cell 1
  await page.locator('#hidden-input').fill('T');
  await page.locator('#hidden-input').fill('H'); // "TH", cursor after the H
  await page.keyboard.press('ArrowLeft'); // cursor between "T" and "H" — mid-cell

  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('#cell-2')).not.toHaveClass(/composing/);
  await expect(page.locator('#cell-1')).toHaveClass(/active-cell/);
  await expect(page.locator('#letter-2')).toHaveText('TH'); // nothing trimmed

  // Lands at cell 1's end ("AB"), not its front: typing appends.
  await page.locator('#hidden-input').fill('C');
  await expect(page.locator('#letter-1')).toHaveText('ABC');
});

test('hashed mode does not auto-advance on a keystroke either, and the board-complete check runs independent of it', async ({ page }) => {
  await page.goto('file://' + hashedPath);
  await ready(page);

  const before = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
  await page.locator('#hidden-input').fill('Z');
  const after = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
  expect(after).toBe(before);
  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(0);
  await expect(page.locator('#check-btn')).toBeHidden();
});

test('a hashed puzzle solves end to end and its preimage matches boardHash', async ({ page }) => {
  await page.goto('file://' + hashedPath);
  await ready(page);

  const events = [];
  await page.exposeFunction('__vpComplete', d => events.push(d));
  await page.evaluate(() => {
    document.querySelector('.puzzle-main')
      .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
  });

  // The hashed build carries no `letters`; solve using the non-hashed build's
  // solution, which is built from the identical source YAML (cw-9.yaml).
  const plainHtml = fs.readFileSync(htmlPath, 'utf8');
  const plainMatch = plainHtml.match(/window\.PUZZLE_DATA = ([\s\S]*?);\s*<\/script>/);
  const plainData = JSON.parse(plainMatch[1]);

  await solveCrushwordBoard(page, { letters: plainData.letters });

  await expect.poll(() => events.length).toBe(1);
  const detail = events[0];
  const recomputed = sha256hex(detail.solution);
  expect(recomputed).toBe(detail.boardHash);
});

test('a solved board restores sealed — no input path can open composition', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const letters = await boardLetters(page);
  const pairs = cellLetterPairs(letters);
  await solveCrushwordBoard(page, { letters });
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  await page.reload();
  await ready(page);

  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(pairs.length);
  await expect(page.locator('#congrats-dialog')).toBeHidden();

  await page.keyboard.press('Enter');
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);
  // Typing is the primary way composing now opens (there's no button/Enter
  // gate left to guard) — confirm it's still inert on a sealed board.
  await page.locator('#hidden-input').fill('Z');
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);
});

test('.correct cells and .cell-block render correctly under print media', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  await solveCrushwordBoard(page);
  await expect(page.locator('#congrats')).toBeVisible();

  await page.emulateMedia({ media: 'print' });
  const firstCorrectId = await page.locator('#puzzle-svg .cell.correct').first().getAttribute('id');
  const printFill = await page.evaluate(id => getComputedStyle(document.getElementById(id)).fill, firstCorrectId);
  expect(printFill).toBe('rgb(255, 255, 255)');
  // Correct letters print blank too, not just their cells.
  expect(await page.locator('.cell-letter.correct').count()).toBeGreaterThan(0);
  await expect(page.locator('.cell-letter.correct:visible')).toHaveCount(0);
});

test('the menu button does not overlap the grid on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // a narrow window or embed
  await page.goto('file://' + htmlPath); // cw-9.yaml: a 9-column grid, wide enough to reach the viewport edge here
  await ready(page);

  // The overlap only happens once .puzzle-center is actually stuck at the
  // top of the viewport — at its natural (unscrolled) position further down
  // the page, it doesn't reach anywhere near the fixed #menu-btn.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

  const [btn, svg] = await Promise.all([
    page.locator('#menu-btn').boundingBox(),
    page.locator('#puzzle-svg').boundingBox(),
  ]);
  // #menu-btn now lives within #active-clue-bar's own band (theme-components.css),
  // confined to that band's vertical range; the grid starts right below it
  // (--active-clue-bar-space), so the two can never share any vertical range
  // regardless of viewport width. Checking for no rectangle intersection at
  // all, rather than a specific gap size, keeps this robust to exact pixel
  // tuning while still catching a regression of the originally reported overlap.
  const overlaps = btn.x < svg.x + svg.width && btn.x + btn.width > svg.x &&
                    btn.y < svg.y + svg.height && btn.y + btn.height > svg.y;
  expect(overlaps).toBe(false);
});

// The options menu is shared code (setupOptionsMenu, via setupControls), so this one tool
// covers it; every engine opens it in e2e/shared.spec.js's "hiding Check Cell" test.
test('menu button opens the options menu holding Clear; outside click and Escape both close it and restore focus', async ({ page }) => {
  // rebusPath (not htmlPath): cw-9.yaml's top-left cell is blocked, so #letter-1
  // doesn't exist there; cw-rebus-5.yaml's is open.
  await page.goto(`file://${rebusPath}`);
  await ready(page);

  const panel = page.locator('#menu-panel');
  const clearBtn = page.locator('#clear-btn');
  await expect(panel).toBeHidden();
  await expect(clearBtn).toBeHidden();

  await page.click('#menu-btn');
  await expect(panel).toBeVisible();
  await expect(clearBtn).toBeVisible();

  // Outside click closes it and restores puzzle focus — a viewport corner is
  // guaranteed to miss both #menu-btn (top-right) and #menu-panel below it.
  const firstCell = page.locator('#letter-1');
  await expect(firstCell).toHaveText('');
  await page.mouse.click(5, 5);
  await expect(panel).toBeHidden();
  await page.keyboard.type('A');
  await expect(firstCell).toHaveText('A');

  // Escape closes it too.
  await page.evaluate(() => document.getElementById('hidden-input').focus());
  await page.click('#menu-btn');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  // Confirming Clear (the two-click arm/confirm sequence) also closes the menu
  // on its own, rather than leaving the solver to dismiss it by hand.
  await page.click('#menu-btn');
  await expect(panel).toBeVisible();
  await clearBtn.click();   // arms
  await clearBtn.click();   // confirms
  await expect(panel).toBeHidden();
});

// The menu is no modal: typing while it's open types into the puzzle and closes it, the
// same whether or not a click in the menu came first. A bare modifier is not typing.
test('typing with the options menu open types into the puzzle and closes the menu', async ({ page }) => {
  await page.goto(`file://${rebusPath}`);
  await ready(page);
  const panel = page.locator('#menu-panel');
  const firstCell = page.locator('#letter-1');

  await page.click('#menu-btn');
  await page.keyboard.press('Shift');
  await expect(panel).toBeVisible();
  await page.keyboard.type('A');
  await expect(firstCell).toHaveText('A');
  await expect(panel).toBeHidden();

  await page.click('#menu-btn');
  await page.click('#check-btn-toggle-label');
  await page.keyboard.type('B');
  await expect(firstCell).toHaveText('AB');
  await expect(panel).toBeHidden();
});

// Every Crushword cell composes on its own keystrokes, and a composing cell is not
// filled (composer.isCellFilled), so a clue gains .filled only when its last cell commits
// — not as the letter is typed. A decision, not an accident: docs/CROSS_TOOL_SPEC.md →
// "Filled clues".
test('a clue gains .filled when its last cell commits, not while that cell is still being typed', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const letters = await boardLetters(page);
  const pairs = cellLetterPairs(letters);
  const last = pairs.pop();
  for (const { id, letter } of pairs) await fillCrushwordCell(page, id, letter);

  const total = await page.locator('.clue-item').count();
  const before = await page.locator('.clue-item.filled').count();

  await page.locator(`#cell-${last.id}`).click();
  await page.locator('#hidden-input').fill(last.letter.toUpperCase());
  await expect(page.locator(`#letter-${last.id}`)).toHaveText(last.letter.toUpperCase());
  await expect(page.locator('.clue-item.filled')).toHaveCount(before);

  await page.keyboard.press('Enter');
  await expect(page.locator('.clue-item.filled')).toHaveCount(total);
});
