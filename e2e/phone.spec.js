'use strict';

// The phone solving view and its drawn keyboard (shared/engine-phone.mjs), run only
// under the mobile projects in playwright.config.js: a touch-first device is the only
// one that gets the layout. Each tool wires its own bottom row and elements, so the
// typing and switch tests loop over the tools; the rest is shared code and runs on
// Crushword. Layout properties of the view live in e2e/mobile.spec.js.
//
// Device emulation still drives a desktop browser's input stack, so nothing here shows
// whether the phone's own keyboard opens. `inputmode="none"` is checked as an attribute;
// its effect needs a real device.

const { test, expect } = require('@playwright/test');
const path = require('path');
const os   = require('os');
const fs   = require('fs');
const yaml = require('js-yaml');
const { FIXTURES, dismissIntro, scrollFlush } = require('./mobile');
const { solveCrushwordBoard, solveRingBoard } = require('./helpers');
const { startServer } = require('./studio-server');

// One fixture per tool. Spiral's is test-78: its outward entries break at other cells
// than its inward ones, as a real Spiral's do, where test-122's line up.
const TOOL_FIXTURES = ['snake-charmer/circle-84', 'spiral/test-78', 'marching-bands/mb-17', 'crushword/cw-9']
  .map(key => FIXTURES.find(f => f.key === key));
const MUDDLED_CW = path.join(__dirname, '..', 'crushword', 'test', 'fixtures', 'cw-9.muddled.yaml');

// Where each tool shows the active direction, mode or loop: the toggle's active segment
// (inside the hidden desktop controls, so read as text, not checked for visibility), or
// for Crushword, which has no toggle, the bar's direction label.
const SWITCH_STATE = {
  'snake-charmer':  '#loop-toggle .toggle-opt.active',
  'spiral':         '#direction-toggle .toggle-opt.active',
  'marching-bands': '#mode-toggle .toggle-opt.active',
  'crushword':      '#active-clue-primary .active-clue-dir',
};

// The bar's clue text: Marching Bands' navigator shows its own.
const BAR_TEXT = tool => (tool === 'marching-bands' ? '.nav-text' : '#active-clue-primary .active-clue-text');
const LONG_CLUE = 'Restored watermill that once ground grain for virtually the whole surrounding ' +
  'village, now a museum of rural life with a working wheel and a tea room by the race';

const INSTRUCTIONS = 'Every answer reads in both directions.';

let tmpDir;
const htmlPaths = {};
test.beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-'));
  for (const f of TOOL_FIXTURES) {
    htmlPaths[f.tool] = path.join(tmpDir, f.tool + '.html');
    require(`../${f.tool}/cli`).buildPuzzle(f.yamlPath, htmlPaths[f.tool]);
  }
  // Each tool again with every clue replaced: far too long for the bar's two lines, or
  // short enough for one. Numbered, so moving to another clue changes the text.
  for (const f of TOOL_FIXTURES) {
    for (const [variant, text] of [['long', LONG_CLUE], ['short', 'Short']]) {
      let n = 0;
      const withClues = v => {
        if (Array.isArray(v)) return v.map(withClues);
        if (v === null || typeof v !== 'object') return v;
        return Object.fromEntries(Object.entries(v).map(([k, x]) =>
          [k, k === 'clue' ? `${text} (${++n})` : withClues(x)]));
      };
      const name = `${f.tool}-${variant}`;
      const yamlPath = path.join(tmpDir, name + '.yaml');
      fs.writeFileSync(yamlPath, yaml.dump(withClues(yaml.load(fs.readFileSync(f.yamlPath, 'utf8')))));
      htmlPaths[name] = path.join(tmpDir, name + '.html');
      require(`../${f.tool}/cli`).buildPuzzle(yamlPath, htmlPaths[name]);
    }
  }
  // Crushword with every clue the same long text, so only the entry tells two apart.
  const cw = TOOL_FIXTURES.find(f => f.tool === 'crushword');
  const sameClues = v => {
    if (Array.isArray(v)) return v.map(sameClues);
    if (v === null || typeof v !== 'object') return v;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'clue' ? LONG_CLUE : sameClues(x)]));
  };
  fs.writeFileSync(path.join(tmpDir, 'crushword-same.yaml'),
    yaml.dump(sameClues(yaml.load(fs.readFileSync(cw.yamlPath, 'utf8')))));
  htmlPaths['crushword-same'] = path.join(tmpDir, 'crushword-same.html');
  require('../crushword/cli').buildPuzzle(path.join(tmpDir, 'crushword-same.yaml'), htmlPaths['crushword-same']);
  // Snake Charmer with an entry longer than the ring (8 cells): its last two cells are
  // its first two ring positions again, in the second loop.
  fs.writeFileSync(path.join(tmpDir, 'snake-charmer-long-entry.yaml'), [
    'kind: snake-charmer',
    'title: Long entry',
    'entries:',
    '  - { clue: "Ten cells", answer: ABCDEFGHAB }',
    '  - { clue: "Three cells", answer: CDE }',
    '  - { clue: "Three more", answer: FGH }',
  ].join('\n'));
  htmlPaths['snake-charmer-long-entry'] = path.join(tmpDir, 'snake-charmer-long-entry.html');
  require('../snake-charmer/cli').buildPuzzle(path.join(tmpDir, 'snake-charmer-long-entry.yaml'),
    htmlPaths['snake-charmer-long-entry']);
  // Marching Bands with a link in row 1's first clue.
  const mb = yaml.load(fs.readFileSync(TOOL_FIXTURES.find(f => f.tool === 'marching-bands').yamlPath, 'utf8'));
  mb.rows[0].entries[0].clue = 'See [this page](https://example.com/) first';
  fs.writeFileSync(path.join(tmpDir, 'marching-bands-link.yaml'), yaml.dump(mb));
  htmlPaths['marching-bands-link'] = path.join(tmpDir, 'marching-bands-link.html');
  require('../marching-bands/cli').buildPuzzle(path.join(tmpDir, 'marching-bands-link.yaml'), htmlPaths['marching-bands-link']);
  // Crushword with instructions; its fixture has none.
  const instructed = yaml.load(fs.readFileSync(TOOL_FIXTURES.find(f => f.tool === 'crushword').yamlPath, 'utf8'));
  fs.writeFileSync(path.join(tmpDir, 'crushword-instructions.yaml'), yaml.dump({ ...instructed, instructions: INSTRUCTIONS }));
  htmlPaths['crushword-instructions'] = path.join(tmpDir, 'crushword-instructions.html');
  require('../crushword/cli').buildPuzzle(path.join(tmpDir, 'crushword-instructions.yaml'), htmlPaths['crushword-instructions']);
  htmlPaths.muddled = path.join(tmpDir, 'crushword-muddled.html');
  require('../crushword/cli').buildPuzzle(MUDDLED_CW, htmlPaths.muddled);
});
test.afterAll(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function load(page, key, { keepIntro = false } = {}) {
  await page.goto('file://' + htmlPaths[key]);
  await expect(page.locator('#drawn-kb')).toBeVisible();
  if (!keepIntro) await dismissIntro(page);
}

const key = (page, ch) => page.locator(`#drawn-kb [data-char="${ch}"]`);
// Check Cell lives in the help menu, not on the keyboard: open it, then tap the item.
async function tapCheck(page) {
  await page.locator('#help-btn').tap();
  await page.locator('#help-panel #check-btn').tap();
}
const letterOf = (page, cellId) => page.locator('#letter-' + cellId.slice('cell-'.length));
const activeCellId = page => page.locator('.active-cell').getAttribute('id');
const focusedId = page => page.evaluate(() => document.activeElement.id);
// An element's box relative to #solve-view, so that a tap Playwright scrolls into view
// first doesn't read as the element moving.
const box = (page, sel) => page.locator(sel).evaluate(el => {
  const r = el.getBoundingClientRect(), v = document.getElementById('solve-view').getBoundingClientRect();
  return { x: r.left - v.left, y: r.top - v.top, width: r.width, height: r.height };
});

// A cell in the middle of the board, tapped; returns its id. Read by id first: syncUI
// moves the active cell last in its layer, so an nth() locator changes target on tap.
async function tapMiddleCell(page) {
  const cells = page.locator('.cell');
  const id = await cells.nth(Math.floor((await cells.count()) / 2)).getAttribute('id');
  await page.locator('#' + id).tap();
  return id;
}

// A Crushword cell with both an across and a down entry, from the grid itself.
function crossedCrushwordCell(page) {
  return page.evaluate(() => {
    const grid = window.PUZZLE_DATA.grid;
    const open = (r, c) => grid[r] !== undefined && grid[r][c] === '.';
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (open(r, c) && (open(r, c - 1) || open(r, c + 1)) && (open(r - 1, c) || open(r + 1, c))) {
          return 'cell-' + (r * grid[r].length + c + 1);
        }
      }
    }
    return null;
  });
}

// Solves the board, then closes the congrats dialog. Marching Bands' solve types from
// the first cell, active at load (a tap on it would switch to band mode).
async function solveAndClose(page, tool) {
  if (tool === 'crushword') await solveCrushwordBoard(page);
  else await solveRingBoard(page);
  await expect(page.locator('#congrats-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#congrats-dialog')).toBeHidden();
}

// Shared code (setupCongratsDialog), so run once: on a phone, where the card covers
// most of the board.
test('[crushword] the congrats card\'s buttons fit and are tappable; View puzzle closes it on the solved board', async ({ page }) => {
  await load(page, 'crushword');
  await solveCrushwordBoard(page);
  const dialog = page.locator('#congrats-dialog');
  await expect(dialog).toBeVisible();
  // Measured once the card's pop-in, which scales it up from 85%, has finished.
  await page.locator('#congrats').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  const offscreen = await page.locator('#congrats-actions button').evaluateAll(btns => btns
    .filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth; })
    .map(b => b.id));
  expect(offscreen).toEqual([]);
  const short = await page.locator('#congrats-actions button').evaluateAll(btns => btns
    .filter(b => b.getBoundingClientRect().height < 44).map(b => b.id));
  expect(short).toEqual([]);
  await page.locator('#congrats-view-btn').tap();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.cell:not(.correct)')).toHaveCount(0);
  expect(await focusedId(page)).toBe('hidden-input');
});

const allLetters = page => page.locator('.cell-letter').evaluateAll(els => els.map(el => el.textContent));

for (const fx of TOOL_FIXTURES) {
  test.describe(fx.tool, () => {
    test('drawn letters fill the tapped cell and focus stays on the hidden input', async ({ page }) => {
      await load(page, fx.tool);
      await expect(page.locator('#hidden-input')).toHaveAttribute('inputmode', 'none');
      const tapped = await tapMiddleCell(page);
      expect(await focusedId(page)).toBe('hidden-input');

      if (fx.tool === 'crushword') {
        // The cursor holds until the cell reaches the puzzle's cap, then moves on.
        const max = await page.evaluate(() => window.PUZZLE_DATA.maxCellLetters);
        const word = 'CATSDOGS'.slice(0, max);
        for (const ch of word) {
          await expect(page.locator('.active-cell')).toHaveId(tapped);
          await key(page, ch).tap();
          expect(await focusedId(page)).toBe('hidden-input');
        }
        await expect(letterOf(page, tapped)).toHaveText(word);
        expect(await activeCellId(page)).not.toBe(tapped);
      } else {
        for (const ch of 'CAT') {
          await key(page, ch).tap();
          expect(await focusedId(page)).toBe('hidden-input');
        }
        await expect(letterOf(page, tapped)).toHaveText('C');
        const filled = await page.locator('.cell-letter').evaluateAll(els =>
          els.map(el => el.textContent).filter(Boolean).sort());
        expect(filled).toEqual(['A', 'C', 'T']);
      }
    });

    // From an entry's (row's, band's) first cell, which Tab reaches, ▸ is a step within
    // it. Crushword's ◂ ▸ are its arrows, which cross into the neighbor cell as Across.
    test('◂ ▸ step the active cell one cell along its entry and back', async ({ page }) => {
      await load(page, fx.tool);
      await tapMiddleCell(page);
      await page.keyboard.press('Tab');
      const start = await activeCellId(page);
      const entry = await page.locator('.active-entry, .active-cell').evaluateAll(els => els.map(el => el.id));
      await page.locator('#drawn-kb button', { hasText: '▸' }).tap();
      const stepped = await activeCellId(page);
      expect(stepped).not.toBe(start);
      if (fx.tool !== 'crushword') expect(entry).toContain(stepped);
      await page.locator('#drawn-kb button', { hasText: '◂' }).tap();
      expect(await activeCellId(page)).toBe(start);
      expect(await focusedId(page)).toBe('hidden-input');
    });

    test('the switch key changes the active direction, mode or loop', async ({ page }) => {
      await load(page, fx.tool);
      if (fx.tool === 'crushword') await page.locator('#' + await crossedCrushwordCell(page)).tap();
      else await tapMiddleCell(page);
      const state = page.locator(SWITCH_STATE[fx.tool]);
      const before = await state.textContent();
      await page.locator('#drawn-kb [data-key="."]').tap();
      await expect(state).not.toHaveText(before);
      if (fx.tool === 'crushword') {
        expect(new Set([before, await state.textContent()])).toEqual(new Set(['Across', 'Down']));
      }
      expect(await focusedId(page)).toBe('hidden-input');
    });

    test('a cut-off clue in the bar shows in full on a tap, over the grid, until the next tap', async ({ page }) => {
      await load(page, fx.tool + '-long');
      const state = page.locator(SWITCH_STATE[fx.tool]);
      const before = await state.textContent();
      const grid = await box(page, '#grid-pane');
      const text = page.locator(BAR_TEXT(fx.tool));
      const clue = await text.textContent();
      await text.tap();
      const full = page.locator('#clue-full');
      await expect(full).toBeVisible();
      await expect(full).toHaveText(clue);
      expect(await state.textContent()).toBe(before);
      expect(await box(page, '#grid-pane')).toEqual(grid);
      expect(await focusedId(page)).toBe('hidden-input');
      await full.tap();
      await expect(full).toBeHidden();
    });

    // A clue long enough to wrap, made so here rather than found in the fixture. Its
    // number (Snake Charmer's clues have none) and any cell row are the item's own.
    test('a long clue in the list wraps beside its number, its cell row below it', async ({ page }) => {
      await load(page, fx.tool);
      await page.locator('#clues-btn').tap();
      const li = page.locator('#list-pane .clue-item').first();
      await li.locator('.clue-text').evaluate(el => { el.textContent = 'A long clue that wraps. '.repeat(6); });
      const { num, text, cells } = await li.evaluate(el => {
        const rect = e => e && e.getBoundingClientRect().toJSON();
        const first = el.firstElementChild;
        return {
          num: first.classList.contains('clue-text') ? null : rect(first),
          text: rect(el.querySelector('.clue-text')),
          cells: rect(el.querySelector('.list-cells')),
        };
      });
      expect(text.height, 'the clue wraps').toBeGreaterThan(40);
      if (num) {
        expect(text.left).toBeGreaterThanOrEqual(num.right - 1);
        expect(text.top).toBeLessThan(num.bottom);
      }
      if (cells) expect(cells.top).toBeGreaterThanOrEqual(text.bottom - 1);
    });
  });
}

// The fill-in list view (setupFillList): every tool but Marching Bands, whose list is
// plain. Each tool builds its own items and maps a cell tap to its own direction or loop.
const FILL_LIST_FIXTURES = TOOL_FIXTURES.filter(f => f.tool !== 'marching-bands');

// Each clue's entry length, in list order, from the page's own data.
function entryLengths(page, tool) {
  return page.evaluate(t => {
    const d = window.PUZZLE_DATA;
    const entries = t === 'snake-charmer' ? d.entries
      : t === 'spiral' ? [...d.inward, ...d.outward]
      : [...Object.values(d.across), ...Object.values(d.down)];
    return entries.map(e => e.length);
  }, tool);
}

async function openList(page) {
  await page.locator('#clues-btn').tap();
  await expect(page.locator('#list-pane')).toBeVisible();
}

const listItems = page => page.locator('#list-pane .clue-item');
const listCells = (page, i) => listItems(page).nth(i).locator('.list-cell');

for (const fx of FILL_LIST_FIXTURES) {
  test.describe(`${fx.tool} fill-in list`, () => {
    test('each clue has a cell row of its length; the keyboard shows, the bar does not', async ({ page }) => {
      await load(page, fx.tool);
      await openList(page);
      const lengths = await entryLengths(page, fx.tool);
      const rows = await listItems(page).evaluateAll(lis =>
        lis.map(li => li.querySelectorAll('.list-cells > .list-cell').length));
      expect(rows).toEqual(lengths);
      await expect(page.locator('#drawn-kb')).toBeVisible();
      await expect(page.locator('#solve-bar')).toBeHidden();
    });

    // A cell past the first, so a tap that fell through to the clue's own handler (which
    // goes to the entry's first cell) would show.
    test('a tapped cell takes the next drawn letter, in the list and on the grid', async ({ page }) => {
      await load(page, fx.tool);
      await openList(page);
      const cell = listCells(page, 2).nth(1);
      await cell.tap();
      await expect(cell).toHaveClass(/\blist-cursor\b/);
      await expect(listItems(page).nth(2)).toHaveClass(/\bactive-clue\b/);
      const gridCell = await activeCellId(page);
      await key(page, 'X').tap();
      await expect(cell).toHaveText('X');
      await expect(letterOf(page, gridCell)).toHaveText('X');
      expect(await focusedId(page)).toBe('hidden-input');
    });

    // The grid dashes the cursor's outline while a rebus composes, and so does the list.
    // Crushword has no rebus mode: its cells always compose, and its grid never dashes.
    if (fx.tool !== 'crushword') test('a rebus in progress dashes the cursor cell\'s outline', async ({ page }) => {
      await load(page, fx.tool);
      await openList(page);
      const cell = listCells(page, 2).nth(1);
      await cell.tap();
      await expect(cell).not.toHaveClass(/\bcomposing\b/);
      await page.locator('#rebus-btn').tap();
      await expect(cell).toHaveClass(/\bcomposing\b/);
      await expect(cell).toHaveCSS('border-top-style', 'dashed');
      await page.locator('#rebus-btn').tap();
      await expect(cell).not.toHaveClass(/\bcomposing\b/);
      await expect(cell).toHaveCSS('border-top-style', 'solid');
    });

    // Each engine hands setupFillList its own isCorrect (Snake Charmer's takes a ring
    // position).
    test('Check Cell marks the checked cell in the list too', async ({ page }) => {
      await load(page, fx.tool);
      await openList(page);
      const cell = listCells(page, 2).nth(1);
      await cell.tap();
      const n = Number((await activeCellId(page)).slice('cell-'.length));
      const letter = await page.evaluate(
        ([n, tool]) => window.PUZZLE_DATA.letters[tool === 'snake-charmer' ? n : n - 1], [n, fx.tool]);
      await key(page, letter.toUpperCase()).tap();
      // Moving off commits Crushword's cell; then back, so Check is enabled on it.
      await listCells(page, 2).nth(0).tap();
      await cell.tap();
      await expect(cell).not.toHaveClass(/\bcorrect\b/);
      await tapCheck(page);
      await expect(cell).toHaveClass(/\bcorrect\b/);
    });

    // The row spans the item's width, so a short entry leaves empty row to its right.
    test('a tap on the row past its last cell selects the clue', async ({ page }) => {
      await load(page, fx.tool);
      await openList(page);
      const lengths = await entryLengths(page, fx.tool);
      const i = lengths.indexOf(Math.min(...lengths.slice(1)), 1);
      await listItems(page).nth(i).scrollIntoViewIfNeeded();
      const { x, y, lastRight } = await listItems(page).nth(i).evaluate(li => {
        const row = li.querySelector('.list-cells').getBoundingClientRect();
        const last = [...li.querySelectorAll('.list-cell')].at(-1).getBoundingClientRect();
        return { x: row.right - 4, y: last.top + last.height / 2, lastRight: last.right };
      });
      expect(x).toBeGreaterThan(lastRight);
      await page.touchscreen.tap(x, y);
      await expect(listItems(page).nth(i)).toHaveClass(/\bactive-clue\b/);
    });

    test('Tab brings a clue from below the fold into the list pane', async ({ page }) => {
      await load(page, fx.tool);
      await openList(page);
      // Every item that starts below the pane's visible area, by index.
      const below = await listItems(page).evaluateAll(lis => {
        const pane = document.getElementById('list-pane').getBoundingClientRect();
        return lis.map((li, i) => [i, li.getBoundingClientRect().top]).filter(([, top]) => top >= pane.bottom)
          .map(([i]) => i);
      });
      expect(below.length).toBeGreaterThan(0);
      const activeIndex = () => listItems(page).evaluateAll(lis =>
        lis.findIndex(li => li.classList.contains('active-clue')));
      let i = await activeIndex();
      for (let n = 0; n < 40 && !below.includes(i); n++) {
        await page.keyboard.press('Tab');
        i = await activeIndex();
      }
      expect(below).toContain(i);
      const { pane, item } = await page.evaluate(idx => ({
        pane: document.getElementById('list-pane').getBoundingClientRect().toJSON(),
        item: document.querySelectorAll('#list-pane .clue-item')[idx].getBoundingClientRect().toJSON(),
      }), i);
      expect(item.top).toBeGreaterThanOrEqual(pane.top - 1);
      expect(item.bottom).toBeLessThanOrEqual(pane.bottom + 1);
    });
  });
}

// Snake Charmer's loops are its directions: a clue, or a cell, belongs to one of them.
test.describe('snake-charmer fill-in list loops', () => {
  const activeLoop = page => page.locator('#loop-toggle .toggle-opt').evaluateAll(btns =>
    btns.findIndex(b => b.classList.contains('active')));
  // The entry that straddles the end of the first loop: its index and how many of its
  // cells lie in the first loop.
  const straddler = page => page.evaluate(() => {
    const { entries, loops } = window.PUZZLE_DATA;
    const ring = entries.reduce((n, e) => n + e.length, 0) / loops;
    let start = 0;
    for (let i = 0; i < entries.length; i++) {
      if (start < ring && start + entries[i].length > ring) return { index: i, inFirst: ring - start };
      start += entries[i].length;
    }
    return null;
  });

  test('tapping a second-loop clue makes the second loop active', async ({ page }) => {
    await load(page, 'snake-charmer');
    await openList(page);
    const { index } = await straddler(page);
    await listItems(page).nth(index + 1).locator('.clue-text').tap();
    expect(await activeLoop(page)).toBe(1);
    await expect(page.locator('#list-pane')).toBeVisible();
    await listItems(page).nth(0).locator('.clue-text').tap();
    expect(await activeLoop(page)).toBe(0);
  });

  test('a straddling entry\'s cells activate the loop each one lies in', async ({ page }) => {
    await load(page, 'snake-charmer');
    await openList(page);
    const { index, inFirst } = await straddler(page);
    await listCells(page, index).nth(inFirst).tap();
    expect(await activeLoop(page)).toBe(1);
    await expect(listCells(page, index).nth(inFirst)).toHaveClass(/\blist-cursor\b/);
    await listCells(page, index).nth(inFirst - 1).tap();
    expect(await activeLoop(page)).toBe(0);
    await expect(listCells(page, index).nth(inFirst - 1)).toHaveClass(/\blist-cursor\b/);
  });
});

// The list keys a cell by its loop too, so the two copies of a ring position in an entry
// longer than the ring each take the cursor in their own loop, and only one shows it.
test('[snake-charmer] each copy of a ring position in a long entry takes its own loop', async ({ page }) => {
  await load(page, 'snake-charmer-long-entry');
  await openList(page);
  const activeLoop = () => page.locator('#loop-toggle .toggle-opt').evaluateAll(btns =>
    btns.findIndex(b => b.classList.contains('active')));
  const cursors = page.locator('#list-pane .list-cursor');
  for (const [j, loop] of [[8, 1], [0, 0], [9, 1]]) {
    await listCells(page, 0).nth(j).tap();
    expect(await activeLoop(), `cell ${j}`).toBe(loop);
    await expect(cursors, `cell ${j}`).toHaveCount(1);
    await expect(listCells(page, 0).nth(j)).toHaveClass(/\blist-cursor\b/);
  }
});

// The longest entry wraps at the default cell size on both phones; unchecking the option
// keeps it to one line, and the option is offered only on the Clues screen. Shared code,
// so run once, on a fixture whose longest entry (14 cells) is too long for one line:
// Spiral 78's longest is 10.
test('[snake-charmer] unchecking "Wrap long rows of cells" keeps a long cell row to one line', async ({ page }) => {
  await load(page, 'snake-charmer');
  // Not offered on the grid screen, where it would change nothing.
  await page.locator('#menu-btn').tap();
  await expect(page.locator('#list-wrap-toggle-label')).toBeHidden();
  await page.locator('#menu-btn').tap();
  await openList(page);
  const longest = await listItems(page).evaluateAll(lis => {
    const counts = lis.map(li => li.querySelectorAll('.list-cell').length);
    return counts.indexOf(Math.max(...counts));
  });
  const row = listItems(page).nth(longest).locator('.list-cells');
  // The row's height, and how many distinct lines its cells sit on.
  const measure = () => row.evaluate(el => ({
    height: el.getBoundingClientRect().height,
    lines: new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().top))).size,
  }));
  const wrapped = await measure();
  expect(wrapped.lines).toBeGreaterThan(1);
  await page.locator('#menu-btn').tap();
  await expect(page.locator('#list-wrap-toggle')).toBeChecked();
  await page.locator('#list-wrap-toggle-label').tap();
  await expect(page.locator('#list-wrap-toggle')).not.toBeChecked();
  const fitted = await measure();
  expect(fitted.lines).toBe(1);
  expect(fitted.height).toBeLessThan(wrapped.height);
  expect(await focusedId(page)).toBe('hidden-input');
});

// Shared code (setupFillList), so run once.
test('[crushword] typing with the active clue scrolled out of the list brings its cursor back', async ({ page }) => {
  await load(page, 'crushword');
  await openList(page);
  const pane = page.locator('#list-pane');
  const cursorInPane = () => page.evaluate(() => {
    const p = document.getElementById('list-pane').getBoundingClientRect();
    const c = document.querySelector('#list-pane .list-cursor').getBoundingClientRect();
    return c.top >= p.top - 1 && c.bottom <= p.bottom + 1;
  });
  // A committed letter, so Check is enabled on the cursor's cell.
  await key(page, 'X').tap();
  await page.locator('#drawn-kb [data-key="Enter"]:not([data-shift])').tap();
  await page.locator('#drawn-kb [data-key="ArrowLeft"]').tap();
  await pane.evaluate(p => { p.scrollTop = p.scrollHeight; });
  expect(await cursorInPane()).toBe(false);
  // Check re-syncs the view and changes no letter: the list stays where the solver
  // left it.
  await tapCheck(page);
  expect(await cursorInPane()).toBe(false);
  await key(page, 'Y').tap();
  expect(await cursorInPane()).toBe(true);
});

// The list view hides the grid, whose letters can't be measured for the caret then;
// back on the grid, the caret sits in the cell typed into from the list.
test('[crushword] after typing in the list view, the grid\'s caret is in the active cell', async ({ page }) => {
  await load(page, 'crushword');
  await openList(page);
  await listCells(page, 2).nth(1).tap();
  await key(page, 'X').tap();
  const cellId = await activeCellId(page);
  await page.locator('#clues-btn').tap();
  await expect(page.locator('#grid-pane')).toBeVisible();
  const cell = await page.locator('#' + cellId).boundingBox();
  const caret = await page.locator('.cell-caret').boundingBox();
  const mid = caret.x + caret.width / 2;
  expect(mid).toBeGreaterThan(cell.x + cell.width / 2);
  expect(mid).toBeLessThan(cell.x + cell.width);
});

// A multi-letter cell typed in the list view is fit to its cell (fitLetterToCell) while
// the grid is hidden and can't be measured; it's fit again when the grid shows. The
// default font fits the cap unshrunk, so a larger one stands in for a wide theme font.
test('[crushword] a cell filled to the cap from the list view fits its grid cell', async ({ page }) => {
  await load(page, 'crushword');
  await page.addStyleTag({ content: '.cell-letter { font-size: 24px !important; }' });
  const max = await page.evaluate(() => window.PUZZLE_DATA.maxCellLetters);
  await openList(page);
  await listCells(page, 2).nth(1).tap();
  const cellId = await activeCellId(page);
  for (const ch of 'W'.repeat(max)) await key(page, ch).tap();
  await page.locator('#clues-btn').tap();
  await expect(page.locator('#grid-pane')).toBeVisible();
  await expect(letterOf(page, cellId)).toHaveText('W'.repeat(max));
  const cell = await page.locator('#' + cellId).boundingBox();
  const letter = await letterOf(page, cellId).boundingBox();
  expect(letter.width).toBeLessThanOrEqual(cell.width);
});

// Marching Bands' arrows are spatial, so its ◂ ▸ call the engine's band step instead.
// On a band's left side, the band runs up and down the column: spatial right would go
// to the next column, the band step goes to the cell above or below.
test('[marching-bands] in band mode, ▸ steps along the band, not spatially', async ({ page }) => {
  await load(page, 'marching-bands');
  const n = await page.evaluate(() => window.PUZZLE_DATA.size);
  const midRow = Math.ceil(n / 2);
  const start = (midRow - 1) * n + 1; // the middle row's first column
  await page.locator('#cell-' + start).tap();
  await page.locator('#drawn-kb [data-key="."]').tap();
  await expect(page.locator('#mode-toggle .toggle-opt.active')).toHaveText('Band');
  await page.locator('#drawn-kb button', { hasText: '▸' }).tap();
  expect(['cell-' + (start - n), 'cell-' + (start + n)]).toContain(await activeCellId(page));
  await page.locator('#drawn-kb button', { hasText: '◂' }).tap();
  expect(await activeCellId(page)).toBe('cell-' + start);
});

// Its ◂ ▸ call the engine directly, past setupKeydown's solved-board guard, so they
// carry their own.
test('[marching-bands] ▸ leaves the active cell where it is once the board is solved', async ({ page }) => {
  await load(page, 'marching-bands');
  await solveAndClose(page, 'marching-bands');
  const n = await page.evaluate(() => window.PUZZLE_DATA.size);
  await page.locator('#cell-' + (n + 2)).tap();
  await expect(page.locator('#cell-' + (n + 2))).toHaveClass(/\bactive-cell\b/);
  await page.locator('#drawn-kb button', { hasText: '▸' }).tap();
  expect(await activeCellId(page)).toBe('cell-' + (n + 2));
});

test('[spiral] the Rebus key opens the active cell for composing', async ({ page }) => {
  await load(page, 'spiral');
  const tapped = await tapMiddleCell(page);
  await expect(page.locator(`#${tapped}.composing`)).toHaveCount(0);
  await page.locator('#rebus-btn').tap();
  await expect(page.locator(`#${tapped}.composing`)).toHaveCount(1);
  expect(await focusedId(page)).toBe('hidden-input');
});

// The banner shows when the board is full but wrong, which is when the solver has to
// find the wrong letter: it takes the title's place in the top bar, never a cell's or
// the clue's. Crushword's bar row has the shared ‹ ›; Marching Bands' navigator brings
// its own.
for (const tool of ['crushword', 'marching-bands']) {
  test(`[${tool}] the done-wrong banner takes the title's place and covers no cell or clue`, async ({ page }) => {
    await load(page, tool);
    const grid = await box(page, '#puzzle-svg');
    const bar = await box(page, '#solve-bar');
    const top = await box(page, '.solve-top');
    if (tool === 'crushword') await solveCrushwordBoard(page, { toTyped: ch => (ch.toLowerCase() === 'a' ? 'B' : 'A') });
    else await solveRingBoard(page, { wrong: 'z' });
    const banner = page.locator('#done-wrong');
    await expect(banner).toBeVisible();
    expect(await box(page, '#puzzle-svg')).toEqual(grid);
    expect(await box(page, '#solve-bar')).toEqual(bar);
    expect(await box(page, '.solve-top')).toEqual(top);
    const onTop = sel => page.locator(sel).evaluate(el => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    });
    const b = await box(page, '#done-wrong');
    expect(b.y).toBeGreaterThanOrEqual(top.y);
    expect(b.y + b.height).toBeLessThanOrEqual(top.y + top.height + 1);
    expect(await onTop('#done-wrong'), 'the banner is on top in the top bar').toBe(true);
    expect(await onTop('.solve-top')).toBe(true);
    expect(await onTop(tool === 'crushword' ? '#active-clue-bar' : '#clue-navigator'), 'the clue shows').toBe(true);
    // Every cell is on screen with the view flush, and a tap at its center reaches it.
    await scrollFlush(page);
    const missed = await page.locator('.cell').evaluateAll(cells => cells.filter(c => {
      const r = c.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !hit || !(hit === c || c.contains(hit));
    }).map(c => c.id));
    expect(missed).toEqual([]);
    // The Clues screen keeps it, where it covers nothing either.
    await openList(page);
    await expect(banner).toBeVisible();
  });
}

// Marching Bands' navigator never moves on its own (a row's entry boundaries are the
// solve), so it shows a row's or band's first clue until the solver steps or taps a clue.
test.describe('marching-bands clue navigator', () => {
  const nav = page => ({
    label: page.locator('#clue-navigator .nav-label'),
    count: page.locator('#clue-navigator .nav-count'),
    text:  page.locator('#clue-navigator .nav-text'),
  });
  // The clues of row `r` (1-indexed), as the page's data has them.
  const rowClues = (page, r) =>
    page.evaluate(i => window.PUZZLE_DATA.rows[i].entries.map(e => e.clue), r - 1);
  const textOf = html => html.replace(/<[^>]*>/g, '');

  test('shows the first clue of the active row, and › and ‹ cycle through them', async ({ page }) => {
    await load(page, 'marching-bands');
    const clues = await rowClues(page, 1);
    const { label, count, text } = nav(page);
    await expect(label).toHaveText('Row 1');
    await expect(count).toHaveText(`clue 1 of ${clues.length}`);
    await expect(text).toHaveText(textOf(clues[0]));
    for (let i = 1; i < clues.length; i++) {
      await page.locator('#clue-next').tap();
      await expect(count).toHaveText(`clue ${i + 1} of ${clues.length}`);
      await expect(text).toHaveText(textOf(clues[i]));
    }
    await page.locator('#clue-next').tap();
    await expect(count).toHaveText(`clue 1 of ${clues.length}`);
    await page.locator('#clue-prev').tap();
    await expect(count).toHaveText(`clue ${clues.length} of ${clues.length}`);
    expect(await focusedId(page)).toBe('hidden-input');
  });

  test('moving within the row leaves the shown clue; another row or band resets it', async ({ page }) => {
    await load(page, 'marching-bands');
    const n = await page.evaluate(() => window.PUZZLE_DATA.size);
    const { label, count } = nav(page);
    await page.locator('#clue-next').tap();
    await expect(count).toHaveText(/^clue 2 of /);
    await page.locator('#drawn-kb button', { hasText: '▸' }).tap();
    await page.locator('#cell-3').tap();
    await expect(count).toHaveText(/^clue 2 of /);
    // Row 2 (a different row), then back to clue 1 there.
    await page.locator('#cell-' + (n + 2)).tap();
    await expect(label).toHaveText('Row 2');
    await expect(count).toHaveText(/^clue 1 of /);
    // Band mode shows that band's first clue, after stepping on in row mode first (the
    // second cell of row 2 is in band B).
    await page.locator('#clue-next').tap();
    await page.locator('#drawn-kb [data-key="."]').tap();
    await expect(label).toHaveText('Band B');
    await expect(count).toHaveText(/^clue 1 of /);
  });

  test('the list is plain, and tapping a clue jumps to its row showing that clue', async ({ page }) => {
    await load(page, 'marching-bands');
    const n = await page.evaluate(() => window.PUZZLE_DATA.size);
    await page.locator('#drawn-kb [data-key="."]').tap();           // start in band mode
    await page.locator('#clues-btn').tap();
    await expect(page.locator('#list-pane')).toBeVisible();
    await expect(page.locator('#drawn-kb')).toBeHidden();
    // Playwright may scroll the page to reach the clue; the page itself must not after.
    const item = page.locator('#rows-clues .clue-group').nth(2).locator('.clue-item').nth(1);
    await item.scrollIntoViewIfNeeded();
    const scrollY = await page.evaluate(() => window.scrollY);
    await item.tap();
    await expect(page.locator('#list-pane')).toBeHidden();
    await expect(page.locator('#drawn-kb')).toBeVisible();
    expect(await activeCellId(page)).toBe('cell-' + (2 * n + 1));
    await expect(page.locator('#mode-toggle .toggle-opt.active')).toHaveText('Row');
    await expect(nav(page).label).toHaveText('Row 3');
    await expect(nav(page).count).toHaveText(/^clue 2 of /);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  });

  // The list's own tap handler runs in the capture phase, ahead of the group's; a link
  // still opens on its own there, as onClueClick lets it everywhere.
  test('a tap on a link in a list clue opens it and leaves the list open', async ({ page, context }) => {
    await load(page, 'marching-bands-link');
    await page.locator('#drawn-kb [data-key="."]').tap();           // band mode, so a jump would show
    await page.locator('#clues-btn').tap();
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#rows-clues .clue-text a').first().tap(),
    ]);
    await popup.close();
    await expect(page.locator('#list-pane')).toBeVisible();
    await expect(page.locator('#mode-toggle .toggle-opt.active')).toHaveText('Band');
  });

  test('stepping through clues of differing length never moves the grid', async ({ page }) => {
    await load(page, 'marching-bands');
    const clues = await rowClues(page, 1);
    expect(new Set(clues.map(c => c.length)).size).toBeGreaterThan(1);
    const grid = await box(page, '#puzzle-svg');
    const bar = await box(page, '#clue-navigator');
    for (let i = 0; i < clues.length; i++) {
      await page.locator('#clue-next').tap();
      expect(await box(page, '#puzzle-svg')).toEqual(grid);
      expect(await box(page, '#clue-navigator')).toEqual(bar);
    }
  });

  test('its ‹ › are at least 44px square', async ({ page }) => {
    await load(page, 'marching-bands');
    for (const sel of ['#clue-prev', '#clue-next']) {
      const { width, height } = await box(page, sel);
      expect(width).toBeGreaterThanOrEqual(44);
      expect(height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('crushword', () => {
  test('Next commits the cell and advances', async ({ page }) => {
    await load(page, 'crushword');
    const tapped = await tapMiddleCell(page);
    await key(page, 'A').tap();
    await expect(page.locator(`#${tapped}.composing`)).toHaveCount(1);
    await page.locator('#drawn-kb [data-key="Enter"]:not([data-shift])').tap();
    await expect(letterOf(page, tapped)).toHaveText('A');
    await expect(page.locator(`#${tapped}.composing`)).toHaveCount(0);
    expect(await activeCellId(page)).not.toBe(tapped);
  });

  test('Prev commits the cell and goes back to the end of the previous one', async ({ page }) => {
    await load(page, 'crushword');
    const tapped = await tapMiddleCell(page);
    await key(page, 'A').tap();
    await page.locator('#drawn-kb [data-key="Enter"]:not([data-shift])').tap();
    const next = await activeCellId(page);
    await key(page, 'B').tap();
    await page.locator('[aria-label="Previous cell"]').tap();
    await expect(letterOf(page, next)).toHaveText('B');
    await expect(page.locator(`#${next}.composing`)).toHaveCount(0);
    expect(await activeCellId(page)).toBe(tapped);
  });

  test('a hardware keyboard still types', async ({ page }) => {
    await load(page, 'crushword');
    const tapped = await tapMiddleCell(page);
    await page.keyboard.type('Q');
    await expect(letterOf(page, tapped)).toHaveText('Q');
  });

  test('a drawn letter, ⌫ or the switch key changes nothing once the board is solved', async ({ page }) => {
    await load(page, 'crushword');
    await solveAndClose(page, 'crushword');
    const before = await allLetters(page);
    const dir = page.locator(SWITCH_STATE.crushword);
    const dirBefore = await dir.textContent();
    await key(page, 'Q').tap();
    await page.locator('#drawn-kb [data-key="Backspace"]').first().tap();
    await page.locator('#drawn-kb [data-key="."]').tap();
    expect(await allLetters(page)).toEqual(before);
    await expect(dir).toHaveText(dirBefore);
  });

  // A cell holding `typed`, committed with Next; returns its id, active again so Check
  // acts on it.
  async function enterCell(page, typed) {
    const id = await tapMiddleCell(page);
    for (const ch of typed) await key(page, ch).tap();
    await page.locator('#drawn-kb [data-key="Enter"]:not([data-shift])').tap();
    await page.locator('#' + id).tap();
    return id;
  }

  test('Check flashes a wrong cell and marks a right one correct', async ({ page }) => {
    await load(page, 'crushword');
    const right = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.cell')];
      const id = cells[Math.floor(cells.length / 2)].id;
      return window.PUZZLE_DATA.letters[Number(id.slice('cell-'.length)) - 1].toUpperCase();
    });
    const wrong = right[0] === 'A' ? 'B' : 'A';

    const id = await enterCell(page, wrong);
    await tapCheck(page);
    await expect(page.locator('.flash-wrong-overlay')).toHaveCount(1);
    await expect(page.locator('#' + id)).not.toHaveClass(/\bcorrect\b/);

    await page.locator('#drawn-kb [data-key="Backspace"]').first().tap();
    for (const ch of right) await key(page, ch).tap();
    await page.locator('#drawn-kb [data-key="Enter"]:not([data-shift])').tap();
    await page.locator('#' + id).tap();
    await tapCheck(page);
    await expect(page.locator('#' + id)).toHaveClass(/\bcorrect\b/);
    expect(await focusedId(page)).toBe('hidden-input');
  });

  // Crushword's typed cell composes until committed, so Check commits it itself and the
  // solver needn't move off the cell. A wrong cell flashes on the Clues screen too.
  test('on the Clues screen, Check works on a just-typed cell and flashes a wrong one', async ({ page }) => {
    await load(page, 'crushword');
    await openList(page);
    const cell = listCells(page, 2).nth(1);
    await cell.tap();
    const n = Number((await activeCellId(page)).slice('cell-'.length));
    const right = (await page.evaluate(i => window.PUZZLE_DATA.letters[i - 1], n)).toUpperCase();
    const wrong = right === 'A' ? 'B' : 'A';
    await page.locator('#help-btn').tap();
    await expect(page.locator('#help-panel #check-btn')).toBeDisabled();
    await page.locator('#help-btn').tap();

    await key(page, wrong).tap();
    await page.locator('#help-btn').tap();
    await expect(page.locator('#help-panel #check-btn')).toBeEnabled();
    await page.locator('#help-panel #check-btn').tap();
    await expect(cell).toHaveClass(/\bflash-wrong\b/);
    await expect(cell).not.toHaveClass(/\bcorrect\b/);

    await page.locator('#drawn-kb [data-key="Backspace"]').first().tap();
    await key(page, right).tap();
    await page.locator('#help-btn').tap();
    await page.locator('#help-panel #check-btn').tap();
    await expect(cell).toHaveClass(/\bcorrect\b/);
  });

  // The grid's caret has a counterpart in the list, in the cursor's cell only.
  test('on the Clues screen, the caret sits among the cursor cell\'s letters', async ({ page }) => {
    await load(page, 'crushword');
    await openList(page);
    const cell = listCells(page, 2).nth(1);
    await cell.tap();
    const caret = page.locator('#list-pane .list-caret');
    await expect(caret).toHaveCount(1);
    await expect(cell.locator('.list-caret')).toHaveCount(1);
    await key(page, 'A').tap();
    await key(page, 'B').tap();
    // After "AB", then one step left: between them. The text is still "AB".
    const position = () => cell.locator('.list-letter').evaluate(el => {
      const kids = [...el.childNodes];
      const at = kids.findIndex(n => n.nodeType === 1);
      return kids.slice(0, at).map(n => n.textContent).join('').length;
    });
    expect(await position()).toBe(2);
    await page.locator('#drawn-kb [data-key="ArrowLeft"]').tap();
    expect(await position()).toBe(1);
    await expect(cell).toHaveText('AB');
    await expect(page.locator('#list-pane .list-caret')).toHaveCount(1);
    // Off the cell, the caret goes with the cursor.
    await listCells(page, 2).nth(0).tap();
    await expect(cell.locator('.list-caret')).toHaveCount(0);
    await expect(listCells(page, 2).nth(0).locator('.list-caret')).toHaveCount(1);
  });

  // Check is help, so it's off the keyboard, where a stray tap beside ▸ could hit it.
  test('the help menu holds Check cell, off the keyboard, and closes with ☰ and on Check', async ({ page }) => {
    await load(page, 'crushword');
    await expect(page.locator('#drawn-kb #check-btn')).toHaveCount(0);
    await expect(page.locator('#check-btn-toggle-label')).toBeHidden();
    await expect(page.locator('#help-panel')).toBeHidden();
    await page.locator('#help-btn').tap();
    await expect(page.locator('#help-panel')).toBeVisible();
    await page.locator('#menu-btn').tap();
    await expect(page.locator('#menu-panel')).toBeVisible();
    await expect(page.locator('#help-panel')).toBeHidden();
    await page.locator('#help-btn').tap();
    await expect(page.locator('#menu-panel')).toBeHidden();
    await tapMiddleCell(page);
    await key(page, 'A').tap();
    await page.locator('#drawn-kb [data-key="Enter"]:not([data-shift])').tap();
    await page.locator('#drawn-kb [data-key="ArrowLeft"]').tap();
    await page.locator('#help-btn').tap();
    await page.locator('#help-panel #check-btn').tap();
    await expect(page.locator('#help-panel')).toBeHidden();
    expect(await focusedId(page)).toBe('hidden-input');
  });

  test('a muddled puzzle has no help menu, and typing works', async ({ page }) => {
    await load(page, 'muddled');
    await expect(page.locator('#help-btn')).toHaveCount(0);
    const tapped = await tapMiddleCell(page);
    await key(page, 'A').tap();
    await expect(letterOf(page, tapped)).toHaveText('A');
  });

  // Guards against a scroll at restore time, or a scroll-snap, bringing the page to the
  // resumed cell. At load the clue lists sit in the hidden list pane, so this never
  // reaches scrollIntoViewBelow's phone guard: the list-view test below is its test.
  test('a page restored from a save loads scrolled to the top', async ({ page }) => {
    await load(page, 'crushword');
    // The last cell, left composing, so the restore resumes on it, far down the clues.
    await page.locator('.cell').last().tap();
    await key(page, 'A').tap();
    // A fresh navigation, not reload(), which would restore the scroll the tap caused.
    await page.goto(page.url());
    await expect(page.locator('#drawn-kb')).toBeVisible();
    await expect(page.locator('.cell.composing')).toHaveCount(1);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  // The list view is where an engine's clue scrolling could reach the page: its clues
  // are laid out there. A tall header (long instructions, here padding standing in for
  // them) starts the pane below the fold, where a page-level scrollIntoView would bring
  // the page along.
  test('the page never scrolls itself as the active clue changes in the list view', async ({ page }) => {
    await load(page, 'crushword');
    await page.addStyleTag({ content: '.puzzle-header { padding-bottom: 600px; }' });
    // dispatchEvent, since a tap would have Playwright scroll the button into view.
    await page.locator('#clues-btn').dispatchEvent('click');
    await expect(page.locator('#list-pane')).toBeAttached();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => window.scrollY), `after Tab ${i + 1}`).toBe(0);
    }
  });

  test('a tap on a clue that fits the bar switches direction', async ({ page }) => {
    await load(page, 'crushword-short');
    await page.locator('#' + await crossedCrushwordCell(page)).tap();
    const state = page.locator(SWITCH_STATE.crushword);
    const before = await state.textContent();
    await page.locator(BAR_TEXT('crushword')).tap();
    await expect(state).not.toHaveText(before);
    await expect(page.locator('#clue-full')).toBeHidden();
  });

  test('the full clue closes when the active clue changes', async ({ page }) => {
    await load(page, 'crushword-long');
    await page.locator(BAR_TEXT('crushword')).tap();
    await expect(page.locator('#clue-full')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#clue-full')).toBeHidden();
  });

  // The bar's text doesn't change, so only the entry shows that the clue did.
  test('the full clue closes on a move to another clue with the same text', async ({ page }) => {
    await load(page, 'crushword-same');
    const text = page.locator(BAR_TEXT('crushword'));
    const before = await page.locator('#active-clue-primary .active-clue-num').textContent();
    await text.tap();
    await expect(page.locator('#clue-full')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('#active-clue-primary .active-clue-num')).not.toHaveText(before);
    await expect(page.locator('#clue-full')).toBeHidden();
  });

  // A keystroke that keeps the clue (here, a letter typed into its entry) rewrites the
  // bar with the same clue, which must leave the full clue open.
  test('the full clue stays open while the active clue stays the same', async ({ page }) => {
    await load(page, 'crushword-long');
    await page.locator(BAR_TEXT('crushword')).tap();
    await expect(page.locator('#clue-full')).toBeVisible();
    await page.keyboard.press('KeyQ');
    await expect(page.locator('#clue-full')).toBeVisible();
  });

  test('the title and byline sit together in the top bar, and nothing is above it', async ({ page }) => {
    await load(page, 'crushword');
    const title = await page.evaluate(() => document.title);
    await expect(page.locator('.solve-top .solve-title')).toHaveText(title);
    await expect(page.locator('.solve-top .solve-byline')).toHaveText('by Fixtures · 2026');
    await expect(page.locator('.puzzle-header')).toBeHidden();
    expect((await box(page, '.solve-top')).y).toBe(0);
    expect(await page.locator('#solve-view').evaluate(v => v.getBoundingClientRect().top)).toBe(0);
  });

  test('a puzzle without instructions opens on the grid, with none on the Clues screen', async ({ page }) => {
    await load(page, 'crushword');
    await expect(page.locator('#intro')).toHaveCount(0);
    await openList(page);
    await expect(page.locator('#list-pane .list-instructions')).toHaveCount(0);
  });

  test('instructions head the Clues screen', async ({ page }) => {
    await load(page, 'crushword-instructions');
    await openList(page);
    const first = page.locator('#list-pane > :first-child');
    await expect(first).toHaveClass(/\blist-instructions\b/);
    await expect(first).toHaveText(INSTRUCTIONS);
    await expect(page.locator('#instructions')).toBeHidden();
  });

  test('instructions show over the view on a first visit, until a tap; not once there is a save', async ({ page }) => {
    await load(page, 'crushword-instructions', { keepIntro: true });
    const intro = page.locator('#intro');
    await expect(intro).toBeVisible();
    await expect(intro).toContainText(INSTRUCTIONS);
    await intro.tap();
    await expect(intro).toBeHidden();
    expect(await focusedId(page)).toBe('hidden-input');
    await key(page, 'X').tap();
    await page.reload();
    await expect(page.locator('#drawn-kb')).toBeVisible();
    await expect(intro).toBeHidden();
  });

  test('opening the options menu leaves the stage where it was', async ({ page }) => {
    await load(page, 'crushword');
    const before = await box(page, '#solve-stage');
    await page.locator('#menu-btn').tap();
    await expect(page.locator('#menu-panel')).toBeVisible();
    expect(await box(page, '#solve-stage')).toEqual(before);
  });

  test('stepping through clues of differing length changes the clue but never the grid', async ({ page }) => {
    await load(page, 'crushword');
    const grid = await box(page, '#puzzle-svg');
    const text = page.locator('#active-clue-primary .active-clue-text');
    const seen = new Set();
    for (const step of ['#clue-next', '#clue-next', '#clue-next', '#clue-next', '#clue-prev']) {
      const before = await text.textContent();
      await page.locator(step).tap();
      await expect(text).not.toHaveText(before);
      seen.add((await text.textContent()).length);
      expect(await box(page, '#puzzle-svg'), step).toEqual(grid);
      expect(await focusedId(page)).toBe('hidden-input');
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test('switching to the digit layer and back never moves the grid', async ({ page }) => {
    await load(page, 'crushword');
    const grid = await box(page, '#puzzle-svg');
    await page.getByRole('button', { name: '123', exact: true }).tap();
    await expect(key(page, '1')).toBeVisible();
    expect(await box(page, '#puzzle-svg')).toEqual(grid);
    await page.getByRole('button', { name: 'ABC', exact: true }).tap();
    await expect(key(page, 'Q')).toBeVisible();
    expect(await box(page, '#puzzle-svg')).toEqual(grid);
  });
});

// An auto-sizing host sets the frame's height from each varietypack:resize, as the
// README's snippet does: one screen high when the page asks to fill it.
test.describe('embedded in an auto-sizing frame', () => {
  let host;
  test.beforeAll(async () => {
    fs.writeFileSync(path.join(tmpDir, 'host.html'), `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<iframe id="puzzle" style="width:100%;height:300px;border:0;display:block"></iframe>
<script>
  var frame = document.getElementById('puzzle');
  frame.src = new URLSearchParams(location.search).get('p');
  window.__heights = [];
  addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'varietypack:resize') return;
    window.__heights.push(e.data.height);
    frame.style.height = e.data.fill ? '100svh' : e.data.height + 'px';
  });
</script>`);
    host = await startServer(tmpDir);
  });
  test.afterAll(async () => { await host.close(); });

  test('the frame is one screen high, the view fits it, and the height settles', async ({ page }) => {
    await page.goto(`${host.url}host.html?p=crushword.html`);
    const frame = page.frameLocator('#puzzle');
    // The frame must be in the phone layout, or a settled height proves nothing.
    await expect(frame.locator('#solve-view')).toBeVisible();
    const heights = () => page.evaluate(() => window.__heights.slice());
    await expect.poll(async () => (await heights()).length).toBeGreaterThan(0);
    // A growing page posts a new height every round; a settled one stops posting.
    let count;
    await expect.poll(async () => {
      const before = count;
      count = (await heights()).length;
      return before === count;
    }, { intervals: [500], timeout: 5000 }).toBe(true);
    // A settled page posts once on both phones here; the bound leaves room for a round
    // or two of settling, far below what a page growing every round posts in 5s.
    expect((await heights()).length).toBeLessThan(6);
    const screenH = await page.evaluate(() => innerHeight);
    // Within a pixel: svh and innerHeight round apart on some phones.
    const frameH = await page.locator('#puzzle').evaluate(f => f.getBoundingClientRect().height);
    expect(Math.abs(frameH - screenH)).toBeLessThanOrEqual(1);
    const view = await frame.locator('#solve-view').evaluate(el => el.getBoundingClientRect().height);
    expect(Math.abs(view - frameH)).toBeLessThanOrEqual(1);
  });
});
