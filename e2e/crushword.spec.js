'use strict';

// Browser-engine behavior specific to Crushword — what node:test can't cover: the
// window-high desktop layout (per-list panes, no clue bar, the stacked fallback and the
// switch between them), entry-based Tab navigation, direction auto-flip, and
// cursor movement and editing inside multi-letter cells (every cell composes on its own
// keystrokes, so there is no rebus button). Behavior it shares with the other engines
// lives in e2e/shared.spec.js; its menu-button test stays here because it starts from a
// different fixture and asserts that confirming Clear also closes the menu.

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { buildPuzzleFile } = require('../test/helpers');
const { startServer } = require('./studio-server');
const { cellLetterPairs, clickHelpRow, fillCrushwordCell, solveCrushwordBoard } = require('./helpers');
const { sha256hex } = require('../shared/sha256hex.mjs');

const FIX = path.join(__dirname, '..', 'crushword', 'test', 'fixtures');

let htmlPath, hashedPath, rebusPath, tmpDir;

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  hashedPath = path.join(tmpDir, 'puzzle-hashed.html');
  buildPuzzleFile(path.join(FIX, 'cw-9.yaml'),          htmlPath);
  buildPuzzleFile(path.join(FIX, 'cw-9.muddled.yaml'),  hashedPath);

  rebusPath       = path.join(tmpDir, 'rebus.html');
  buildPuzzleFile(path.join(FIX, 'cw-rebus-5.yaml'),         rebusPath);
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

test('clue and instructions text render markdown formatting, not literal syntax', async ({ page }) => {
  // A dedicated, minimally constructed puzzle (docs/TESTING.md's
  // philosophy prefers this over perturbing a shared fixture used by many
  // other tests) — the markdown *parsing* itself is unit-tested exhaustively
  // in shared/test/renderMarkdown.test.js; this only proves the wiring
  // (processEntries -> PUZZLE_DATA -> innerHTML) actually reaches the DOM.
  const yamlPath = path.join(tmpDir, 'markdown-test.yaml');
  const htmlPath = path.join(tmpDir, 'markdown-test.html');
  fs.writeFileSync(yamlPath, [
    'kind: crushword',
    'themeTokens: { color-link: "#123456" }',
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
  buildPuzzleFile(yamlPath, htmlPath);

  await page.goto('file://' + htmlPath);
  await ready(page);

  // A link takes the theme's link color, in a clue and in the instructions alike. An
  // overridden token, since the default is the color a browser gives a link anyway.
  for (const sel of ['#across-clues .clue-text a', '#instructions a']) {
    await expect(page.locator(sel)).toHaveCSS('color', 'rgb(18, 52, 86)');
  }

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
  buildPuzzleFile(yamlPath, htmlPath);

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

test('Tab walks the across entries, then the down entries, then wraps; Shift+Tab reverses', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const nums = dir => page.evaluate(d =>
    Object.keys(window.PUZZLE_DATA[d]).map(Number).sort((a, b) => a - b), dir);
  const entries = [
    ...(await nums('across')).map(n => ['across', n]),
    ...(await nums('down')).map(n => ['down', n]),
  ];

  async function activeClue() {
    return page.evaluate(() => {
      const li = document.querySelector('.clue-item.active-clue');
      return [li.closest('#across-clues') ? 'across' : 'down',
        Number(li.querySelector('.clue-num').textContent.replace('.', ''))];
    });
  }

  expect(await activeClue(page)).toEqual(entries[0]);
  for (let i = 1; i < entries.length; i++) {
    await page.keyboard.press('Tab');
    expect(await activeClue(page)).toEqual(entries[i]);
  }
  await page.keyboard.press('Tab'); // the last down entry wraps to the first across
  expect(await activeClue(page)).toEqual(entries[0]);

  await page.keyboard.press('Shift+Tab'); // and back from the first across to the last down
  expect(await activeClue(page)).toEqual(entries[entries.length - 1]);
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
  buildPuzzleFile(yamlPath, switchHtmlPath);

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
  await expect(page.locator('#puzzle-svg .cell[data-mark]')).toHaveCount(0);
  await expect(page.locator('#check-btn')).toHaveCount(0);
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

test('the menu button does not overlap the grid on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 }); // a narrow window or embed: the stacked fallback
  await page.goto('file://' + htmlPath); // cw-9.yaml: a 9-column grid, wide enough to reach the viewport edge here
  await ready(page);

  const [btn, svg] = await Promise.all([
    page.locator('#menu-btn').boundingBox(),
    page.locator('#puzzle-svg').boundingBox(),
  ]);
  const overlaps = btn.x < svg.x + svg.width && btn.x + btn.width > svg.x &&
                    btn.y < svg.y + svg.height && btn.y + btn.height > svg.y;
  expect(overlaps).toBe(false);

  // Scrolled so the grid is at the top of the window, where a fixed button would cover
  // its top-right cells: the buttons scroll away with the header instead.
  await page.evaluate(() => document.getElementById('puzzle-svg').scrollIntoView());
  const covered = await page.evaluate(() => {
    const r = document.getElementById('puzzle-svg').getBoundingClientRect();
    const hit = document.elementFromPoint(r.right - 36, r.top + 36); // where the fixed ☰ would sit
    return hit && hit.closest('#menu-btn, #help-btn') !== null;
  });
  expect(covered).toBe(false);
});

// The options menu is shared code (setupOptionsMenu, via setupControls), so this one tool
// covers it; every engine opens it in e2e/shared.spec.js's options menu tests.
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
  await page.click('#menu-panel', { position: { x: 2, y: 2 } }); // inside the panel, on no row
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

// Every Crushword cell composes on its own keystrokes, so Reveal cell meets a composing
// cell on nearly every use. It ends the composition without committing the half-typed
// prefix (shared/engine-state.mjs → revealCells), so the cell is never correct and
// composing at once.
test('Reveal cell on a half-typed cell ends the composition and leaves it correct', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const { id, letter } = cellLetterPairs(await boardLetters(page))[0];

  await page.locator(`#cell-${id}`).click();
  await page.locator('#hidden-input').fill('Z'); // typed, not committed
  await expect(page.locator(`#cell-${id}`)).toHaveClass(/composing/);
  await expect(page.locator('#reveal-btn')).toBeEnabled();

  await clickHelpRow(page, '#reveal-btn');
  await expect(page.locator(`#cell-${id}`)).not.toHaveClass(/composing/);
  await expect(page.locator(`#cell-${id}`)).toHaveAttribute('data-mark');
  await expect(page.locator(`#letter-${id}`)).toHaveText(new RegExp(`^${letter}$`, 'i'));

  // The revealed cell is locked: a letter typed on it is dropped and the cursor moves on.
  await page.locator('#hidden-input').fill('Q');
  await expect(page.locator(`#cell-${id}`)).toHaveAttribute('data-mark', 'revealed');
  await expect(page.locator(`#cell-${id}`)).not.toHaveClass(/composing|active-cell/);
  await expect(page.locator(`#letter-${id}`)).toHaveText(new RegExp(`^${letter}$`, 'i'));
});

test('revealing the last cell while it is half-typed completes the puzzle once', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const events = [];
  await page.exposeFunction('__vpComplete', d => events.push(d));
  await page.evaluate(() => {
    document.querySelector('.puzzle-main')
      .addEventListener('varietypack:complete', e => window.__vpComplete(e.detail));
  });
  const pairs = cellLetterPairs(await boardLetters(page));
  const last = pairs.pop();
  for (const { id, letter } of pairs) await fillCrushwordCell(page, id, letter);

  await page.locator(`#cell-${last.id}`).click();
  await page.locator('#hidden-input').fill('Z'); // half-typed, so the board is not filled
  await expect(page.locator('#congrats-dialog')).toBeHidden();
  await clickHelpRow(page, '#reveal-btn');

  await expect.poll(() => events.length).toBe(1);
  expect(events[0].reveals).toBe(1);
  expect(events[0].checks).toBe(0);
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);
  await expect(page.locator('#congrats-dialog')).toBeVisible();
});

// Every Crushword cell composes on its own keystrokes, so Check clue and Reveal clue
// meet a composing cell often. Check commits it first, as Check cell does; Reveal ends
// the composition without committing, as Reveal cell does.
test('Check clue is available with only a half-typed cell, and commits it first', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const { id, letter } = cellLetterPairs(await boardLetters(page))[0];

  await page.locator(`#cell-${id}`).click();
  await expect(page.locator('#check-clue-btn')).toBeDisabled();
  await page.locator('#hidden-input').fill(letter.toUpperCase()); // typed, not committed
  await expect(page.locator(`#cell-${id}`)).toHaveClass(/composing/);
  await expect(page.locator('#check-clue-btn')).toBeEnabled();

  await clickHelpRow(page, '#check-clue-btn');
  await expect(page.locator(`#cell-${id}`)).not.toHaveClass(/composing/);
  await expect(page.locator(`#cell-${id}`)).toHaveAttribute('data-mark');
});

test('Reveal clue on a clue holding a half-typed cell leaves none composing', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const { id } = cellLetterPairs(await boardLetters(page))[0];

  await page.locator(`#cell-${id}`).click();
  await page.locator('#hidden-input').fill('Z');
  await expect(page.locator(`#cell-${id}`)).toHaveClass(/composing/);

  await clickHelpRow(page, '#reveal-clue-btn');
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);
  await expect(page.locator(`#cell-${id}`)).toHaveAttribute('data-mark');
});

// Typing over a plain committed cell edits it: Crushword's typing inserts at the cursor,
// which sits after the cell's content, so it reads old + new and is composing again. A
// cell Check cell marked or Reveal cell filled is locked instead: the letter is dropped.
test('typing edits a committed cell and leaves a checked or revealed one alone', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const pairs = cellLetterPairs(await boardLetters(page));
  const [plain, checked, revealed] = pairs;
  const typeOver = async (id, before) => {
    await page.locator(`#cell-${id}`).click(); // the cursor lands after the content
    await page.locator('#hidden-input').fill('Q');
    await expect(page.locator(`#letter-${id}`)).toHaveText(new RegExp(`^${before}Q$`, 'i'));
    await expect(page.locator(`#cell-${id}`)).toHaveClass(/composing/);
    await expect(page.locator(`#cell-${id}`)).not.toHaveAttribute('data-mark');
  };
  const typeOverLocked = async (id, before, mark) => {
    await page.locator(`#cell-${id}`).click();
    await page.locator('#hidden-input').fill('Q');
    await expect(page.locator(`#letter-${id}`)).toHaveText(new RegExp(`^${before}$`, 'i'));
    await expect(page.locator(`#cell-${id}`)).not.toHaveClass(/composing/);
    await expect(page.locator(`#cell-${id}`)).toHaveAttribute('data-mark', mark);
  };

  // A plain committed cell, wrong.
  await fillCrushwordCell(page, plain.id, 'Z');
  await typeOver(plain.id, 'Z');

  // A cell Check cell has marked correct.
  await fillCrushwordCell(page, checked.id, checked.letter);
  await page.locator(`#cell-${checked.id}`).click();
  await clickHelpRow(page, '#check-btn');
  await expect(page.locator(`#cell-${checked.id}`)).toHaveAttribute('data-mark');
  await typeOverLocked(checked.id, checked.letter, 'checked');

  // A cell Reveal cell has filled.
  await page.locator(`#cell-${revealed.id}`).click();
  await clickHelpRow(page, '#reveal-btn');
  await expect(page.locator(`#cell-${revealed.id}`)).toHaveAttribute('data-mark');
  await typeOverLocked(revealed.id, revealed.letter, 'revealed');
});

// ---- Locked cells (docs/CROSS_TOOL_SPEC.md → "Cell marks") ----------------------------
// Crushword composes every cell as it is typed and advances only at maxCellLetters, so
// a locked cell needs rules of its own to keep the cursor moving (makeCellStore's
// isLocked).

const activeId = page => page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
const letterOfCell = (page, id) => page.locator('#' + id.replace('cell-', 'letter-'));

test('a letter typed on a locked cell is dropped and the cursor moves to the next cell', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const id = await activeId(page);
  await clickHelpRow(page, '#reveal-btn');
  const answer = await letterOfCell(page, id).textContent();
  await page.keyboard.press(answer === 'Q' ? 'KeyZ' : 'KeyQ');
  await expect(letterOfCell(page, id)).toHaveText(answer);
  const next = await activeId(page);
  expect(next).not.toBe(id);
  await expect(letterOfCell(page, next)).toHaveText('');
});

test('Backspace from the next cell\'s front steps onto a locked cell without deleting', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const id = await activeId(page);
  await clickHelpRow(page, '#reveal-btn');
  const answer = await letterOfCell(page, id).textContent();
  await page.keyboard.press('Enter'); // confirm and move to the next cell
  expect(await activeId(page)).not.toBe(id);
  await page.keyboard.press('Backspace');
  expect(await activeId(page)).toBe(id);
  await expect(letterOfCell(page, id)).toHaveText(answer);
  await page.keyboard.press('Backspace'); // from inside the locked cell: steps on
  expect(await activeId(page)).not.toBe(id);
  await expect(letterOfCell(page, id)).toHaveText(answer);
});

test('Space mid-cell on a locked rebus cell keeps all of it', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);
  const i = await page.evaluate(() => window.PUZZLE_DATA.letters.findIndex(l => l && l.length > 1));
  const id = `cell-${i + 1}`;
  await page.locator('#' + id).click();
  if (await activeId(page) !== id) await page.locator('#' + id).click();
  await clickHelpRow(page, '#reveal-btn');
  const answer = await letterOfCell(page, id).textContent();
  expect(answer.length).toBeGreaterThan(1);
  await page.keyboard.press('ArrowLeft'); // the cursor now sits inside the cell
  expect(await activeId(page)).toBe(id);
  await page.keyboard.press('Space');
  await expect(letterOfCell(page, id)).toHaveText(answer);
  await expect(page.locator('#' + id)).toHaveAttribute('data-mark', 'revealed');
});

// Space drops what's after the cursor, so it can turn a wrong cell right and finish the
// board; the solve must then be painted (`.solved`, clue items), not only announced.
test('Space that trims a cell into finishing the board paints the solve', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const letters = await boardLetters(page);
  const [first] = cellLetterPairs(letters);
  const board = [...letters];
  board[first.id - 1] = first.letter + 'z';
  await solveCrushwordBoard(page, { letters: board });
  await expect(page.locator('#done-wrong')).toBeVisible();

  await page.locator(`#cell-${first.id}`).click(); // the cursor lands after the content
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await expect(page.locator('#puzzle-svg')).toHaveClass(/\bsolved\b/);
  await expect(page.locator('.clue-item.correct').first()).toBeAttached();
});

// ---- The desktop layout: one window high, a pane per clue list, no clue bar -----------
// docs/CROSS_TOOL_SPEC.md → "syncUI() contract". The fill layout is width-only
// (crushword/src/template/base.css), so these set the viewport explicitly.

const fillsView = page => page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--fills-view').trim());
const scrollY = page => page.evaluate(() => window.scrollY);
// Within a pixel of the window's top: WebKit leaves a sub-pixel scroll remainder.
const bodyAtTop = page => page.locator('.puzzle-body').evaluate(el => Math.abs(el.getBoundingClientRect().top) <= 1);

async function load(page, viewport, file = htmlPath) {
  await page.setViewportSize(viewport);
  await page.goto('file://' + file);
  await ready(page);
}

// Whether `inner` lies within `outer`, both read from the live page.
const within = (page, innerSel, outerSel) => page.evaluate(([i, o]) => {
  const a = document.querySelector(i).getBoundingClientRect(), z = document.querySelector(o).getBoundingClientRect();
  return a.top >= z.top - 1 && a.bottom <= z.bottom + 1;
}, [innerSel, outerSel]);

// Whether the active clue lies within its list's scrolling box.
const activeInPane = page => page.evaluate(() => {
  const li = document.querySelector('.clue-item.active-clue');
  const a = li.getBoundingClientRect(), z = li.closest('ul').getBoundingClientRect();
  return a.top >= z.top - 1 && a.bottom <= z.bottom + 1;
});

test('desktop has no clue bar, and the menu buttons never cover the grid', async ({ page }) => {
  await load(page, { width: 900, height: 720 });
  await page.locator('#cell-11').click();
  await expect(page.locator('#active-clue-bar')).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains('has-clue-bar'))).toBe(false);
  const svg = await page.locator('#puzzle-svg').boundingBox();
  for (const id of ['#menu-btn', '#help-btn']) {
    const b = await page.locator(id).boundingBox();
    const overlaps = b.x < svg.x + svg.width && b.x + b.width > svg.x &&
                      b.y < svg.y + svg.height && b.y + b.height > svg.y;
    expect(overlaps, id).toBe(false);
  }
});

test('the first click into the grid selects the clicked cell', async ({ page }) => {
  await load(page, { width: 1280, height: 720 });
  await page.locator('#cell-11').click();
  await expect(page.locator('#cell-11')).toHaveClass(/active-cell/);
  await expect.poll(() => bodyAtTop(page)).toBe(true);
});

test('a bare modifier key or Escape does not scroll the page; a letter does', async ({ page }) => {
  await load(page, { width: 1280, height: 720 });
  await page.keyboard.press('Shift');
  await page.keyboard.press('Escape');
  expect(await scrollY(page)).toBe(0);
  await page.keyboard.press('Escape');   // back from the menus to the puzzle
  await page.keyboard.press('a');
  await expect.poll(() => bodyAtTop(page)).toBe(true);
});

test('the page holds still while solving in the fill layout', async ({ page }) => {
  await load(page, { width: 1280, height: 720 });
  await page.locator('#cell-11').click();   // (1,1): open cell below it
  await expect.poll(() => bodyAtTop(page)).toBe(true);
  const y = await scrollY(page);
  await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B');
  await page.keyboard.press('.');
  expect(await scrollY(page)).toBe(y);
  expect(await bodyAtTop(page)).toBe(true);
});

test('page-scroll keys do nothing in the fill layout', async ({ page }) => {
  await load(page, { width: 1280, height: 720 });
  await page.locator('#cell-2').click();    // a top-row cell
  await expect.poll(() => bodyAtTop(page)).toBe(true);
  const y = await scrollY(page);
  for (const key of ['PageDown', 'PageUp', 'ArrowUp']) {
    await page.keyboard.press(key);
    expect(await scrollY(page), key).toBe(y);
  }
});

test('each clue pane keeps its own clue in view', async ({ page }) => {
  await load(page, { width: 1280, height: 560 }); // short enough that both lists overflow
  for (const sel of ['.clue-section-across ul', '.clue-section-down ul']) {
    const [h, c] = await page.locator(sel).evaluate(el => [el.scrollHeight, el.clientHeight]);
    expect(h, sel + ' must overflow or this checks nothing').toBeGreaterThan(c);
  }
  // By keyboard, not by clicking the clue: Playwright scrolls a clicked element into view
  // itself, which would pass the Across half without the engine.
  await page.locator('#down-clues .clue-item').first().click();
  await page.keyboard.press('Shift+Tab');   // the last Across entry
  await expect.poll(() => activeInPane(page)).toBe(true);
  expect(await page.locator('#across-clues .active-clue').count()).toBe(1);
});

test('the Down pane follows the crossing clue of an Across cell far down the board', async ({ page }) => {
  await load(page, { width: 1280, height: 560 });
  // The cell with both entries whose Down entry starts last in the grid, so its Down clue
  // is deep in the list.
  const id = await page.evaluate(() => {
    const g = window.PUZZLE_DATA.grid, cols = g[0].length;
    const open = (r, c) => g[r] !== undefined && g[r][c] === '.';
    let best = null;
    for (let r = 0; r < g.length; r++) for (let c = 0; c < cols; c++) {
      if (!open(r, c) || !(open(r, c - 1) || open(r, c + 1)) || !(open(r - 1, c) || open(r + 1, c))) continue;
      let top = r;
      while (open(top - 1, c)) top--;
      if (!best || top * cols + c > best.at) best = { at: top * cols + c, id: 'cell-' + (r * cols + c + 1) };
    }
    return best.id;
  });
  expect(await page.locator('#down-clues').evaluate(el => el.scrollTop)).toBe(0);
  await page.locator('#' + id).click();
  await expect(page.locator('#down-clues .secondary-entry, #down-clues .active-clue')).toHaveCount(1);
  await expect.poll(() => page.locator('#down-clues').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => within(page, '#down-clues .clue-item.secondary-entry, #down-clues .clue-item.active-clue', '#down-clues')).toBe(true);
});

test('typing within a cell never scrolls a pane', async ({ page }) => {
  await load(page, { width: 1280, height: 720 });
  await page.locator('#down-clues .clue-item').first().click();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => activeInPane(page)).toBe(true);
  await page.waitForTimeout(600);           // the smooth scroll settles
  await page.evaluate(() => document.querySelectorAll('.clue-section ul').forEach(el => { el.scrollTop = 0; }));
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => [...document.querySelectorAll('.clue-section ul')].map(el => el.scrollTop)))
    .toEqual([0, 0]);
});

test('a narrow window stacks the layout and never scrolls the page to follow a clue', async ({ page }) => {
  await load(page, { width: 700, height: 700 });
  expect(await fillsView(page)).toBe('');
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await scrollY(page)).toBe(0);
});

test('a narrow window brings the grid back into view when a far clue is clicked', async ({ page }) => {
  await load(page, { width: 700, height: 700 });
  expect(await fillsView(page)).toBe('');
  await page.locator('#down-clues .clue-item').last().scrollIntoViewIfNeeded();
  const gridVisible = () => page.locator('#puzzle-svg').evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= innerHeight + 1;
  });
  expect(await gridVisible()).toBe(false);
  await page.locator('#down-clues .clue-item').last().click();
  await expect.poll(gridVisible).toBe(true);
});

test('a short wide window keeps the fill layout', async ({ page }) => {
  await load(page, { width: 1280, height: 480 });
  expect(await fillsView(page)).toBe('1');
  expect(await page.locator('.puzzle-body').evaluate(el => el.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(560);
});

test('the layout follows a resize across the threshold, both ways', async ({ page }) => {
  await load(page, { width: 1280, height: 720 });
  await page.keyboard.press('Tab');
  await page.setViewportSize({ width: 700, height: 720 });
  expect(await fillsView(page)).toBe('');
  await page.evaluate(() => window.scrollTo(0, 0));
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await scrollY(page)).toBe(0);

  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await fillsView(page)).toBe('1');
  await page.evaluate(() => document.querySelectorAll('.clue-section ul').forEach(el => { el.scrollTop = 0; }));
  await page.keyboard.press('a');   // a solving keystroke that changes no clue
  await expect.poll(() => activeInPane(page)).toBe(true);
  await expect.poll(() => bodyAtTop(page)).toBe(true);
});

test('returning to the fill layout with no input between re-aligns at the next solving key', async ({ page }) => {
  await load(page, { width: 1280, height: 720 });
  await page.locator('#cell-11').click();
  await expect.poll(() => bodyAtTop(page)).toBe(true);
  await page.setViewportSize({ width: 700, height: 720 });
  expect(await fillsView(page)).toBe('');
  // The resize event fires on the next frame: let it run while the window is narrow.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.setViewportSize({ width: 1280, height: 720 });
  expect(await fillsView(page)).toBe('1');
  await page.evaluate(() => window.scrollTo(0, 0));   // the header showing again, as a solver left it
  expect(await bodyAtTop(page)).toBe(false);
  await page.keyboard.press('a');
  await expect.poll(() => bodyAtTop(page)).toBe(true);
});

test.describe('framed', () => {
  let host;
  test.beforeAll(async () => {
    fs.writeFileSync(path.join(tmpDir, 'host.html'), `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<iframe id="puzzle" style="width:100%;height:600px;border:0;display:block"></iframe>
<script>
  var frame = document.getElementById('puzzle');
  frame.src = new URLSearchParams(location.search).get('p');
  window.__msgs = [];
  addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'varietypack:resize') return;
    window.__msgs.push(e.data);
    frame.style.height = e.data.fill ? '100svh' : e.data.height + 'px';
  });
</script>`);
    host = await startServer(tmpDir);
  });
  test.afterAll(async () => { await host.close(); });

  test('a framed desktop page asks to fill the screen only in the fill layout', async ({ page }) => {
    const last = () => page.evaluate(() => window.__msgs[window.__msgs.length - 1]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${host.url}host.html?p=puzzle.html`);
    await expect.poll(async () => (await last())?.fill).toBe(true);

    await page.setViewportSize({ width: 700, height: 720 });
    await expect.poll(async () => (await last())?.fill).toBeUndefined();

    // Only the frame's height changes: the layout is chosen by width, so it stays.
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect.poll(async () => (await last())?.fill).toBe(true);
    await page.evaluate(() => { document.getElementById('puzzle').style.height = '300px'; });
    const frame = page.frameLocator('#puzzle');
    await expect(frame.locator('#puzzle-svg')).toBeVisible();
    expect(await frame.locator('html').evaluate(el =>
      getComputedStyle(el).getPropertyValue('--fills-view').trim())).toBe('1');
  });
});

// ---- The crossings panel --------------------------------------------------------------
// A model of the active entry and the clue crossing each of its cells (crossings.mjs),
// drawn from the engine's entry maps. Fill-layout viewport unless a test says otherwise.

const FILL = { width: 1280, height: 720 };
const cxRows = page => page.locator('#crossings .cx-row');

// A cell with an entry one way only, from the grid: [cell id, the direction it has].
const oneWayCell = page => page.evaluate(() => {
  const g = window.PUZZLE_DATA.grid;
  const open = (r, c) => g[r] !== undefined && g[r][c] === '.';
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[r].length; c++) {
      if (!open(r, c)) continue;
      const across = open(r, c - 1) || open(r, c + 1), down = open(r - 1, c) || open(r + 1, c);
      if (across !== down) return ['cell-' + (r * g[r].length + c + 1), across ? 'across' : 'down'];
    }
  }
  return null;
});

test('the panel lists the active entry\'s crossings in cell order', async ({ page }) => {
  await load(page, FILL);
  const entry = await page.evaluate(() => [...document.querySelectorAll('.cell.active-entry, .cell.active-cell')]
    .map(el => Number(el.id.slice(5))).sort((a, b) => a - b));
  await expect(cxRows(page)).toHaveCount(entry.length);
  // The Down number at each cell, read from the drawn grid: walk up to the run's start
  // and take the label drawn in its corner.
  const downNums = await page.evaluate(ids => {
    const cols = window.PUZZLE_DATA.grid[0].length;
    const labelAt = id => {
      const r = document.getElementById('cell-' + id);
      const x = +r.getAttribute('x') + 6, y = +r.getAttribute('y') + 8;
      const t = [...document.querySelectorAll('.cell-num')].find(e => +e.getAttribute('x') === x && +e.getAttribute('y') === y);
      return t ? t.textContent : null;
    };
    return ids.map(id => {
      let up = id;
      if (!document.getElementById('cell-' + (id - cols)) && !document.getElementById('cell-' + (id + cols))) return null;
      while (document.getElementById('cell-' + (up - cols))) up -= cols;
      return labelAt(up);
    });
  }, entry);
  const rows = await cxRows(page).evaluateAll(els => els.map(e => [e.dataset.num ?? null, e.classList.contains('cx-none')]));
  rows.forEach(([num, none], i) => {
    if (downNums[i] === null) expect(none, 'row ' + i).toBe(true);
    else expect(num, 'row ' + i).toBe(downNums[i]);
  });
});

test('typing updates the panel\'s letters without reordering it', async ({ page }) => {
  await load(page, FILL);
  const nums = () => cxRows(page).evaluateAll(els => els.map(e => e.dataset.num ?? ''));
  const before = await nums();
  await page.locator('#hidden-input').fill('A');
  await page.locator('#hidden-input').fill('B');
  expect(await nums()).toEqual(before);
  await expect(page.locator('#crossings .cx-head .cx-here')).toHaveText('AB');
  await expect(page.locator('#crossings .cx-row .cx-here').first()).toHaveText('AB');
});

test('the row under the cursor carries the crossing highlight', async ({ page }) => {
  await load(page, FILL);
  const cells = await page.locator('#crossings .cx-row').count();
  expect(cells, 'the panel has rows').toBeGreaterThan(0);
  for (let i = 0; i < cells; i++) {
    await expect(page.locator('#crossings .cx-row.cx-cursor')).toHaveCount(1);
    const crossing = await page.locator('#down-clues .clue-item.secondary-entry').count();
    if (crossing) {
      await expect(page.locator('#crossings .cx-row.secondary-entry')).toHaveCount(1);
      await expect(page.locator('#crossings .cx-row.secondary-entry')).toHaveClass(/cx-cursor/);
      expect(await page.locator('#crossings .cx-row.secondary-entry').getAttribute('data-num'))
        .toBe(await page.locator('#down-clues .clue-item.secondary-entry .clue-num').textContent().then(t => t.replace('.', '')));
    } else {
      await expect(page.locator('#crossings .cx-row.secondary-entry')).toHaveCount(0);
      await expect(page.locator('#crossings .cx-row.cx-cursor')).toHaveClass(/cx-none/);
    }
    await page.keyboard.press('ArrowRight');
  }
});

test('a cell with no crossing entry shows a muted row', async ({ page }) => {
  await load(page, FILL);
  const [id, dir] = await oneWayCell(page);
  await page.locator('#' + id).click();
  const row = page.locator('#crossings .cx-row.cx-cursor');
  await expect(row).toHaveClass(/cx-none/);
  await expect(row).toHaveText(dir === 'across' ? 'no Down entry' : 'no Across entry');
});

test('clicking a panel row lands like clicking its clue', async ({ page }) => {
  await load(page, FILL);
  const state = () => page.evaluate(() => [
    document.querySelector('.cell.active-cell').id,
    document.querySelector('.clue-item.active-clue').closest('ul').id,
  ]);
  const row = page.locator('#crossings .cx-row[data-num]').nth(1);
  const num = await row.getAttribute('data-num');
  await row.click();
  const viaRow = await state();
  await page.locator('#across-clues .clue-item').first().click();   // elsewhere first
  await page.locator('#down-clues .clue-item', { has: page.locator(`.clue-num:text-is("${num}.")`) }).click();
  expect(await state()).toEqual(viaRow);
});

test('a filled crossing looks filled', async ({ page }) => {
  await load(page, FILL);
  const letters = await boardLetters(page);
  // The first crossing's whole Down entry, from the grid: the column's run through the
  // cell the first crossing row stands for.
  const { num, ids } = await page.evaluate(() => {
    const cols = window.PUZZLE_DATA.grid[0].length;
    const entry = [...document.querySelectorAll('.cell.active-entry, .cell.active-cell')]
      .map(el => Number(el.id.slice(5))).sort((a, b) => a - b);
    const rows = [...document.querySelectorAll('#crossings .cx-row')];
    const at = rows.findIndex(r => r.dataset.num !== undefined);
    let id = entry[at];
    while (document.getElementById('cell-' + (id - cols))) id -= cols;
    const out = [];
    for (; document.getElementById('cell-' + id); id += cols) out.push(id);
    return { num: rows[at].dataset.num, ids: out };
  });
  for (const id of ids) await fillCrushwordCell(page, id, letters[id - 1]);
  await page.locator('#across-clues .clue-item').first().click();
  await expect(page.locator(`#crossings .cx-row.filled[data-num="${num}"]`)).toHaveCount(1);
});

test('the panel works the same in a muddled build', async ({ browser }) => {
  // A context each: the plain and muddled builds of one board share a save.
  const shapeOf = async file => {
    const context = await browser.newContext({ viewport: FILL });
    const page = await context.newPage();
    await page.goto('file://' + file);
    await ready(page);
    await page.locator('#hidden-input').fill('Q');
    const shape = await page.evaluate(() => ({
      head: document.querySelector('#crossings .cx-title').textContent,
      nums: [...document.querySelectorAll('#crossings .cx-row')].map(r => r.dataset.num ?? ''),
      here: document.querySelector('#crossings .cx-head .cx-here').textContent,
    }));
    await context.close();
    return shape;
  };
  const plain = await shapeOf(htmlPath);
  expect(plain.nums.length, 'the plain build has rows').toBeGreaterThan(0);
  expect(plain.here).toBe('Q');
  expect(await shapeOf(hashedPath)).toEqual(plain);
});

test('a reload shows restored letters in the panel', async ({ page }) => {
  await load(page, FILL);
  await page.locator('#hidden-input').fill('Q');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Enter');
  await page.reload();
  await ready(page);
  await expect(page.locator('#crossings .cx-head .cx-box.cx-here')).toHaveText('Q');
});

test('a link in a panel clue opens it without jumping', async ({ page, context }) => {
  const yamlPath = path.join(tmpDir, 'panel-link.yaml');
  const linkPath = path.join(tmpDir, 'panel-link.html');
  fs.writeFileSync(yamlPath, [
    'kind: crushword', 'title: "Panel Link Test"', 'grid:', '  - "..."', '  - "..."', '  - "..."',
    'across:', '  1:', '    clue: "a"', '    answer: "CAT"',
    '  4:', '    clue: "See [reference](https://example.com) for background"', '    answer: "DOG"',
    '  5:', '    clue: "c"', '    answer: "ANT"',
    'down:', '  1:', '    clue: "d"', '    answer: "CDA"', '  2:', '    clue: "e"', '    answer: "AON"',
    '  3:', '    clue: "f"', '    answer: "TGT"',
  ].join('\n'));
  buildPuzzleFile(yamlPath, linkPath);
  await load(page, FILL, linkPath);
  await page.locator('#down-clues .clue-item').first().click();   // the panel then lists Across 1, 4, 5
  const before = await page.evaluate(() => document.querySelector('.cell.active-cell').id);
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#crossings .cx-row[data-num="4"] .clue-text a').click(),
  ]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe('https://example.com/');
  await popup.close();
  expect(await page.evaluate(() => document.querySelector('.cell.active-cell').id)).toBe(before);
  await expect(page.locator('#crossings .cx-head .cx-dir')).toHaveText('Down');
});

test('the cursor\'s row stays visible in a long entry', async ({ page }) => {
  await load(page, { width: 1280, height: 560 });
  // The longest Across entry, from the grid.
  const start = await page.evaluate(() => {
    const g = window.PUZZLE_DATA.grid, cols = g[0].length;
    let best = null;
    g.forEach((row, r) => { for (const m of row.matchAll(/\.+/g)) {
      if (!best || m[0].length > best.len) best = { len: m[0].length, id: r * cols + m.index + 1 };
    } });
    return best;
  });
  await page.locator('#cell-' + start.id).click();
  const overflow = await page.locator('#crossings .cx-rows').evaluate(el => [el.scrollHeight, el.clientHeight]);
  expect(overflow[0], 'the rows must overflow or this checks nothing').toBeGreaterThan(overflow[1]);
  const visible = () => page.evaluate(() => {
    const rows = document.querySelector('#crossings .cx-rows').getBoundingClientRect();
    const cur = document.querySelector('#crossings .cx-row.cx-cursor').getBoundingClientRect();
    const head = document.querySelector('#crossings .cx-head').getBoundingClientRect();
    const box = document.getElementById('crossings').getBoundingClientRect();
    return cur.top >= rows.top - 1 && cur.bottom <= rows.bottom + 1 && head.top >= box.top - 1;
  });
  for (let i = 0; i < start.len; i++) {
    await expect.poll(visible, { message: 'cell ' + i }).toBe(true);
    await page.keyboard.press('ArrowRight');
  }
});
