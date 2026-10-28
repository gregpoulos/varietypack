'use strict';

// Browser-engine behavior specific to Marching Bands — what node:test can't cover: Tab
// by row and band, arrow keys across the grid, the clue-group list, the options menu's
// Clear and Check Cell toggle, the solved-board restore, and a rebus solve that marks no
// clue item (its clue groups hide entry boundaries). Behavior it shares with the other
// engines lives in e2e/shared.spec.js.

const { test, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const yaml = require('js-yaml');
const { buildPuzzle } = require('../marching-bands/cli');
const { typeCell } = require('./helpers');

const FIX = path.join(__dirname, '..', 'marching-bands', 'test', 'fixtures');

let htmlPath;       // non-hashed mb-5 → PUZZLE_DATA.letters present
let hashedPath;     // hashed mb-5     → no letters; correctness via boardHash
let rebusPath;        // non-hashed rebus fixture
let tmpDir;         // unique temp directory per worker

test.beforeAll(() => {
  tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-e2e-'));
  htmlPath   = path.join(tmpDir, 'puzzle.html');
  hashedPath = path.join(tmpDir, 'puzzle-hashed.html');
  buildPuzzle(path.join(FIX, 'mb-5.yaml'),         htmlPath);
  buildPuzzle(path.join(FIX, 'mb-5.muddled.yaml'), hashedPath);

  rebusPath       = path.join(tmpDir, 'rebus.html');
  buildPuzzle(path.join(FIX, 'rebus-5.yaml'),         rebusPath);
});

test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Geometry helpers mirroring the engine's derivation from N. Expressing expected
// navigation targets as formulas (not hardcoded cell numbers) keeps these tests
// fixture-size-agnostic and tied to the contract rather than a snapshot.
const rowOf  = (n, N) => Math.ceil(n / N);
const colOf  = (n, N) => ((n - 1) % N) + 1;
const bandOf = (n, N) => Math.min(rowOf(n, N) - 1, colOf(n, N) - 1, N - rowOf(n, N), N - colOf(n, N));
const cellId = (r, c, N) => (r - 1) * N + c;

async function activeCellNum(page) {
  const id = await page.locator('#puzzle-svg .cell.active-cell').getAttribute('id');
  return Number(id.slice('cell-'.length));
}

async function ready(page) {
  await expect(page.locator('#puzzle-svg .cell').first()).toBeVisible();
  await page.evaluate(() => document.getElementById('hidden-input').focus());
}

test('a clue with markdown formatting renders as HTML, not literal syntax', async ({ page }) => {
  // Smoke check that the shared clue-rendering wiring (processEntries ->
  // PUZZLE_DATA -> engine's innerHTML assignment) also reaches Marching
  // Bands' own clue-list code, not just Crushword's — the markdown parsing
  // itself is exhaustively unit-tested in shared/test/renderMarkdown.test.js;
  // e2e/crushword.spec.js has the full formatting-coverage version of this.
  // Reuses mb-5.yaml's exact cell-consistent row/band content (row/band cell
  // agreement is a build-time validation error, not just a warning, so this
  // is far more reliable than hand-authoring a new small grid) with only the
  // first clue's text changed.
  const source = yaml.load(fs.readFileSync(path.join(FIX, 'mb-5.yaml'), 'utf8'));
  source.rows[0].entries[0].clue = '**Bold** clue';
  const yamlPath = path.join(tmpDir, 'markdown-smoke.yaml');
  const htmlPath = path.join(tmpDir, 'markdown-smoke.html');
  fs.writeFileSync(yamlPath, yaml.dump(source));
  buildPuzzle(yamlPath, htmlPath);

  await page.goto('file://' + htmlPath);
  await expect(page.locator('#puzzle-svg .cell').first()).toBeVisible();

  const clueHtml = await page.locator('#rows-clues .clue-item .clue-text').first().innerHTML();
  assert.match(clueHtml, /<strong>Bold<\/strong> clue/);
});

// Wide, the grid stands beside the clue columns rather than over them, so the scroll
// padding that keeps a clue clear of a pinned grid (scrollIntoViewBelow in
// shared/engine-chrome.mjs) must not apply; the next test covers the narrow side.
test('in the wide layout, a clue scrolled into view is not pushed below the grid beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 300 });
  await page.goto('file://' + htmlPath);
  await ready(page);
  const rect = sel => page.evaluate(s => document.querySelector(s).getBoundingClientRect().toJSON(), sel);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.keyboard.press('Tab'); // row 2
  expect((await rect('.clue-section-rows .clue-group')).bottom).toBeLessThanOrEqual(0.5); // row 1 is above the view
  await page.keyboard.press('Shift+Tab'); // back to row 1, scrolled into view

  const clue = await rect('.clue-group.active-clue');
  expect(clue.top).toBeGreaterThanOrEqual(-1); // sub-pixel rounding
  expect(clue.top).toBeLessThan((await rect('.puzzle-center')).bottom);
});

// Narrow (a half-screen window, or an embed in a narrow column), the grid stacks over the
// clues and stays pinned as they scroll beneath it: it must hide them, and a clue
// scrolled into view must land below it, not behind it. A desktop browser, so not the
// phone layout, which a touch-first device gets instead.
test('in the stacked layout, the pinned grid hides the clues under it and a clue scrolls clear of it', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 400 });
  await page.goto('file://' + htmlPath);
  await ready(page);
  const rect = sel => page.evaluate(s => document.querySelector(s).getBoundingClientRect().toJSON(), sel);

  const style = await page.locator('.puzzle-center').evaluate(el => {
    const s = getComputedStyle(el);
    return { position: s.position, backgroundColor: s.backgroundColor };
  });
  expect(style.position).toBe('sticky');
  expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.keyboard.press('Tab'); // row 2
  const center = await rect('.puzzle-center');
  // Row 1's group has scrolled up behind the pinned grid.
  expect((await rect('.clue-section-rows .clue-group')).top).toBeLessThan(center.bottom);
  await page.keyboard.press('Shift+Tab'); // back to row 1, scrolled into view

  const clue = await rect('.clue-group.active-clue');
  expect(clue.top).toBeGreaterThanOrEqual((await rect('.puzzle-center')).bottom - 1);
});

test('Tab in row mode advances to the first cell of the next row, wrapping; Shift+Tab reverses', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const N = await page.evaluate(() => window.PUZZLE_DATA.size);

  // Default mode is row; the cursor starts at the first cell of row 1.
  expect(rowOf(await activeCellNum(page), N)).toBe(1);

  // Tab visits each subsequent row's first cell (always column 1), then wraps to row 1.
  const seq = [];
  for (let r = 2; r <= N; r++) seq.push(r);
  seq.push(1);
  for (const expectedRow of seq) {
    await page.keyboard.press('Tab');
    const n = await activeCellNum(page);
    expect(rowOf(n, N)).toBe(expectedRow);
    expect(colOf(n, N)).toBe(1);
  }

  // Shift+Tab steps back from row 1 to the last row.
  await page.keyboard.press('Shift+Tab');
  expect(rowOf(await activeCellNum(page), N)).toBe(N);
});

test('Tab in band mode advances to the first (top-left) cell of the next band, wrapping', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);
  const N = await page.evaluate(() => window.PUZZLE_DATA.size);
  const numBands = Math.floor(N / 2);

  // Period key switches to band mode; the cursor stays on the row-1 start cell (band 0).
  await page.keyboard.press('.');
  expect(bandOf(await activeCellNum(page), N)).toBe(0);

  // Each Tab lands on the next band's first cell — its top-left corner, cellId(k+1, k+1).
  for (let step = 1; step <= numBands; step++) {
    await page.keyboard.press('Tab');
    const n = await activeCellNum(page);
    const expectedBand = step % numBands; // wraps to 0 on the final step
    expect(bandOf(n, N)).toBe(expectedBand);
    expect(n).toBe(cellId(expectedBand + 1, expectedBand + 1, N));
  }
});

for (const mode of ['row', 'band']) {
  test(`arrow keys move across the grid in ${mode} mode, jumping the center block`, async ({ page }) => {
    await page.goto('file://' + htmlPath);
    await ready(page);
    const N = await page.evaluate(() => window.PUZZLE_DATA.size);
    assert.equal(N % 2, 1, 'the fixture needs a center block');
    const mid = (N + 1) / 2;
    if (mode === 'band') await page.keyboard.press('.');
    const press = async (key, times = 1) => { for (let i = 0; i < times; i++) await page.keyboard.press(key); };

    // From the top-left cell to the cell just above the center.
    await press('ArrowRight', mid - 1);
    await press('ArrowDown', mid - 2);
    expect(await activeCellNum(page)).toBe(cellId(mid - 1, mid, N));

    await press('ArrowDown');
    expect(await activeCellNum(page)).toBe(cellId(mid + 1, mid, N));
    await press('ArrowUp');
    expect(await activeCellNum(page)).toBe(cellId(mid - 1, mid, N));

    await press('ArrowLeft');
    await press('ArrowDown');
    expect(await activeCellNum(page)).toBe(cellId(mid, mid - 1, N));
    await press('ArrowRight');
    expect(await activeCellNum(page)).toBe(cellId(mid, mid + 1, N));
    await press('ArrowLeft');
    expect(await activeCellNum(page)).toBe(cellId(mid, mid - 1, N));

    // Off the left edge the cursor stays put.
    await press('ArrowLeft', N);
    expect(await activeCellNum(page)).toBe(cellId(mid, 1, N));
  });
}

test('the options menu panel does not resize when Clear arms to "Are you sure?"', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#clear-btn')).toHaveText('Clear Puzzle');
  const before = await page.locator('#menu-panel').boundingBox();

  // #clear-btn::after (base.css) reserves the wider of "Clear Puzzle"/"Are you
  // sure?" so #menu-panel's shrink-to-fit width doesn't change across the
  // arm/confirm cycle — without it, the panel visibly narrows and shifts while armed.
  await page.click('#clear-btn');
  await expect(page.locator('#clear-btn')).toHaveText('Are you sure?');
  const after = await page.locator('#menu-panel').boundingBox();

  expect(after).toEqual(before);
});

test('the "Show Check Cell button" toggle hides #check-btn and persists across reload', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#check-btn-toggle-label')).toBeVisible();
  await expect(page.locator('#check-btn-toggle')).toBeChecked();
  await expect(page.locator('#check-btn')).toBeVisible();

  await page.click('#check-btn-toggle');
  await expect(page.locator('#check-btn')).toBeHidden();

  await page.reload();
  await ready(page);
  await page.click('#menu-btn');
  await expect(page.locator('#check-btn-toggle')).not.toBeChecked();
  await expect(page.locator('#check-btn')).toBeHidden();
});

test('the "Show Check Cell button" toggle is absent in a hashed puzzle', async ({ page }) => {
  await page.goto(`file://${hashedPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await expect(page.locator('#check-btn-toggle-label')).toBeHidden();
  await expect(page.locator('#check-btn')).toBeHidden();
});

test('Clear Puzzle does not reset the Check Cell button visibility preference', async ({ page }) => {
  await page.goto(`file://${htmlPath}`);
  await ready(page);

  await page.click('#menu-btn');
  await page.click('#check-btn-toggle');
  await expect(page.locator('#check-btn')).toBeHidden();

  await page.click('#clear-btn');
  await page.click('#clear-btn'); // second click confirms
  await expect(page.locator('#check-btn')).toBeHidden();
  await expect(page.locator('#check-btn-toggle')).not.toBeChecked();
});

// Not the clue-restore test its Snake Charmer / Spiral siblings are: MB marks no clue
// items, so checker.repaintIfSolved() is a genuine no-op here. It covers the other half —
// the latch.solved keydown guard, which MB carries identically and which the structural
// safety argument in docs/CROSS_TOOL_SPEC.md → Answer checking relies on in all three
// engines. Without this, MB was the one engine where that guard had no post-reload
// coverage.
test('a solved board restores sealed — Enter cannot open composition', async ({ page }) => {
  await page.goto('file://' + htmlPath);
  await ready(page);

  const correct = await page.evaluate(() => window.PUZZLE_DATA.letters.filter(l => l !== null));
  for (const ch of correct) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#congrats-dialog')).toBeVisible();

  await page.reload();
  await ready(page);

  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(correct.length);
  await expect(page.locator('#congrats-dialog')).toBeHidden();

  // Post-reload the latch is sealed by sealIfSolved() on a page that never opened a
  // dialog, so key injection is unimpaired here — unlike the post-Escape point in
  // 'board is locked after solve', where root CLAUDE.md warns it is unreliable.
  await page.keyboard.press('Enter');
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);

  // #rebus-btn reaches composition without going through setupKeydown at all, so the
  // latch.solved argument above does not cover it — composer.toggle's own solved check
  // does. Removing that check must turn this red.
  await page.locator('#rebus-btn').click();
  await expect(page.locator('#puzzle-svg .cell.composing')).toHaveCount(0);
});

// Row-major cell contents for marching-bands/test/fixtures/rebus-5.yaml, center
// (cell 13) omitted — the same order the engine's getSolution() walks.
const REBUS_CELLS = [
  'A', 'BB', 'C', 'D', 'E',
  'F', 'G', 'H', 'III', 'J',
  'K', 'L',        'M', 'N',
  'O', 'PPPP', 'Q', 'R', 'S',
  'T', 'U', 'V', 'W', 'X',
];

test('a four-letter cell renders with the len-long class', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  // Cell 17 = row 4, col 2 — the four-letter group.
  await page.locator('#cell-17').click();
  await page.keyboard.press('Enter');
  for (const ch of ['P', 'P', 'P', 'P']) await page.locator('#hidden-input').fill(ch);
  await expect(page.locator('#letter-17')).toHaveText('PPPP');
  await expect(page.locator('#letter-17')).toHaveClass(/len-long/);
});

test('a non-hashed rebus puzzle marks every cell correct on solve, but no clue item', async ({ page }) => {
  await page.goto('file://' + rebusPath);
  await ready(page);

  for (const cell of REBUS_CELLS) await typeCell(page, cell);

  await expect(page.locator('#congrats')).toBeVisible();
  // 24 filled cells (rebus-5.yaml, 5x5 minus the null center) — non-hashed mode must mark
  // them .correct just like hashed mode does, per the levelled-up completion behavior.
  await expect(page.locator('#puzzle-svg .cell.correct')).toHaveCount(24);
  // 15 clue items total (10 row entries + 5 band entries, rebus-5.yaml) render in the
  // DOM regardless of active mode — anchors the negative assertion below so it can't
  // pass vacuously against an empty clue list.
  await expect(page.locator('.clue-item')).toHaveCount(15);
  // Marching Bands never marks clue items correct, in either mode: its clue groups
  // intentionally hide entry boundaries, and marking them would spoil the puzzle.
  await expect(page.locator('.clue-item.correct')).toHaveCount(0);
});

