'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isTouchFirst, setupFillList, setupListWrapPref, setupPhoneLayout, scrollWithin, stepIndex,
} = require('../engine-phone.mjs');

// A window whose matchMedia answers `matches` for the touch-first query only.
function fakeWin(matches) {
  return {
    matchMedia(q) {
      return { matches: matches && q === '(hover: none) and (pointer: coarse)' };
    },
  };
}

test('isTouchFirst: true when the touch-first media query matches', () => {
  assert.equal(isTouchFirst(fakeWin(true)), true);
});

test('isTouchFirst: false when it does not', () => {
  assert.equal(isTouchFirst(fakeWin(false)), false);
});

test('setupPhoneLayout: on a non-touch device returns null and touches nothing', () => {
  const win = fakeWin(false);
  // Any document access throws, so a stray touch fails the test rather than passing.
  Object.defineProperty(win, 'document', { get() { throw new Error('touched the document'); } });
  const calls = [];
  const hiddenInput = { setAttribute: (...args) => calls.push(args) };
  assert.equal(setupPhoneLayout({ hiddenInput, grid: {}, lists: [], clueBar: null, bottomRow: [], win }), null);
  assert.deepEqual(calls, []);
});

// A container showing y = 100..300 of the page and an element at [top, bottom); writes
// to scrollTop are recorded.
function scrollCase(top, bottom) {
  const writes = [];
  let scrollTop = 50;
  const container = {
    getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
    get scrollTop() { return scrollTop; },
    set scrollTop(v) { writes.push(v); scrollTop = v; },
  };
  const el = { getBoundingClientRect: () => ({ top, bottom }) };
  scrollWithin(container, el);
  return writes;
}

test('scrollWithin: an element below the visible area scrolls down until its bottom shows', () => {
  assert.deepEqual(scrollCase(320, 340), [50 + 40]);
});

test('scrollWithin: an element above the visible area scrolls up until its top shows', () => {
  assert.deepEqual(scrollCase(70, 90), [50 - 30]);
});

test('scrollWithin: an element already in view leaves scrollTop unwritten', () => {
  assert.deepEqual(scrollCase(120, 300), []);
});

// An element taller than the container can't be wholly in view, so its top shows: a
// clue item and its cell row can outgrow the list pane on a long Spiral entry.
test('scrollWithin: a taller element below the visible area scrolls until its top shows', () => {
  assert.deepEqual(scrollCase(150, 450), [50 + 50]);
});

test('scrollWithin: a taller element whose top shows scrolls no further than its top', () => {
  assert.deepEqual(scrollCase(120, 500), [50 + 20]);
});

test('stepIndex: steps by d and wraps at both ends', () => {
  assert.equal(stepIndex(1, 3, 1), 2);
  assert.equal(stepIndex(2, 3, 1), 0);
  assert.equal(stepIndex(0, 3, -1), 2);
});

// ── setupFillList / setupListWrapPref ─────────────────────────────────────────────────
// A minimal element: attributes, classes, children, listeners and an inline style, as
// far as htmlEl and the two setups use them.
function mockEl(tag) {
  const classes = new Set();
  const listeners = {};
  const props = {};
  return {
    tagName: tag.toUpperCase(),
    attrs: {},
    children: [],
    textContent: '',
    style: { props, setProperty(k, v) { props[k] = String(v); } },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'class') String(v).split(' ').forEach(c => classes.add(c));
    },
    append(...kids) { this.children.push(...kids); },
    insertBefore(kid, ref) {
      const i = this.children.indexOf(ref);
      this.children.splice(i < 0 ? this.children.length : i, 0, kid);
    },
    querySelector(sel) { return this.children.find(c => sel === '#' + (c.attrs && c.attrs.id)) || null; },
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle(c, on = !classes.has(c)) { if (on) classes.add(c); else classes.delete(c); return on; },
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    fire(type, e = {}) { for (const fn of listeners[type] || []) fn(e); },
    getBoundingClientRect: () => ({ top: 0, bottom: 0 }),
  };
}

function withDocument(fn) {
  const saved = globalThis.document;
  globalThis.document = { createElement: mockEl, documentElement: mockEl('html') };
  try { return fn(); } finally { globalThis.document = saved; }
}

const has = (el, cls) => el.classList.contains(cls);
// Each item's `.list-cells` row, and that row's cells.
const rowOf = li => li.children.find(c => has(c, 'list-cells'));
const cellsOf = li => rowOf(li).children;
// What a cell shows.
const shown = cell => cell.children.map(c => c.textContent).join('');

// Two items sharing cell 3, as a crossing (or a second loop) shares a board cell.
function fillHarness({ rect = () => ({ top: 0, bottom: 0 }) } = {}) {
  return withDocument(() => {
    const items = [{ li: mockEl('li'), cells: [1, 2, 3] }, { li: mockEl('li'), cells: [3, 4] }];
    const writes = [];
    let scrollTop = 0;
    const scroller = {
      getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
      get scrollTop() { return scrollTop; },
      set scrollTop(v) { writes.push(v); scrollTop = v; },
    };
    const letters = { 1: 'a', 3: 'xy' };
    const correct = new Set();
    const composing = new Set();
    const taps = [];
    const fillList = setupFillList(items, {
      scroller, getLetter: n => letters[n] || '', isCorrect: n => correct.has(n),
      isComposing: n => composing.has(n), onCellTap: (i, j) => taps.push([i, j]),
    });
    for (const el of items.flatMap(({ li }) => [li, ...cellsOf(li)])) el.getBoundingClientRect = rect;
    return { items, fillList, writes, taps, letters, correct, composing };
  });
}

test('setupFillList: each item gets one .list-cells row with a .list-cell per cell', () => {
  const { items } = fillHarness();
  for (const { li, cells } of items) {
    assert.equal(li.children.filter(c => has(c, 'list-cells')).length, 1);
    assert.equal(cellsOf(li).length, cells.length);
    assert.ok(cellsOf(li).every(c => has(c, 'list-cell')));
  }
});

test('setupFillList: sync shows each cell\'s letter, uppercased, in every row holding it', () => {
  const { items, fillList } = fillHarness();
  fillList.sync(1, items[0].li);
  assert.deepEqual(cellsOf(items[0].li).map(shown), ['A', '', 'XY']);
  assert.deepEqual(cellsOf(items[1].li).map(shown), ['XY', '']);
});

test('setupFillList: sync marks a checked cell .correct in every row holding it, and unmarks it', () => {
  const { items, fillList, correct } = fillHarness();
  const marks = li => cellsOf(li).map(c => has(c, 'correct'));
  correct.add(3);
  fillList.sync(1, items[0].li);
  assert.deepEqual(marks(items[0].li), [false, false, true]);
  assert.deepEqual(marks(items[1].li), [true, false]);
  correct.delete(3);
  fillList.sync(1, items[0].li);
  assert.deepEqual(marks(items[0].li), [false, false, false]);
  assert.deepEqual(marks(items[1].li), [false, false]);
});

// A timer the test runs by hand, so a 600ms flash needn't be waited out.
function withFakeTimers(fn) {
  const saved = globalThis.setTimeout, queued = [];
  globalThis.setTimeout = f => { queued.push(f); return queued.length; };
  try { return fn(queued); } finally { globalThis.setTimeout = saved; }
}

test('setupFillList: flash marks every cell the predicate matches, in every row, until its timer ends', () => {
  const { items, fillList } = fillHarness();
  withFakeTimers(queued => {
    const flashed = li => cellsOf(li).map(c => has(c, 'flash-wrong'));
    fillList.flash(n => n === 3);
    assert.deepEqual(flashed(items[0].li), [false, false, true]);
    assert.deepEqual(flashed(items[1].li), [true, false]);
    queued.forEach(f => f());
    assert.deepEqual(flashed(items[0].li), [false, false, false]);
    assert.deepEqual(flashed(items[1].li), [false, false]);
  });
});

test('setupFillList: .composing marks the cursor\'s cell, in the active item only, while it composes', () => {
  const { items, fillList, composing } = fillHarness();
  const marks = li => cellsOf(li).map(c => has(c, 'composing'));
  fillList.sync(3, items[0].li);
  assert.deepEqual(marks(items[0].li), [false, false, false], 'not composing');
  composing.add(3);
  fillList.sync(3, items[0].li);
  assert.deepEqual(marks(items[0].li), [false, false, true]);
  assert.deepEqual(marks(items[1].li), [false, false], 'the other row holding it');
  composing.clear();
  fillList.sync(3, items[0].li);
  assert.deepEqual(marks(items[0].li), [false, false, false]);
});

test('setupFillList: .list-cursor marks the cursor\'s cell in the active item only', () => {
  const { items, fillList } = fillHarness();
  fillList.sync(3, items[1].li);
  const cursors = li => cellsOf(li).map(c => has(c, 'list-cursor'));
  assert.deepEqual(cursors(items[0].li), [false, false, false]);
  assert.deepEqual(cursors(items[1].li), [true, false]);
  fillList.sync(3, items[0].li);
  assert.deepEqual(cursors(items[0].li), [false, false, true]);
  assert.deepEqual(cursors(items[1].li), [false, false]);
});

test('setupFillList: a tap on a cell reports its item and position', () => {
  const { items, taps } = fillHarness();
  cellsOf(items[1].li)[1].fire('click', {});
  assert.deepEqual(taps, [[1, 1]]);
});

// Every item and cell stays outside the pane's visible area, so every scroll writes.
test('setupFillList: sync scrolls on a new active item, a cursor move or an edit to the item, and only then', () => {
  const { items, fillList, writes, letters } = fillHarness({ rect: () => ({ top: 400, bottom: 420 }) });
  const scrolls = () => writes.length;
  fillList.sync(1, items[0].li);
  assert.equal(scrolls(), 1, 'a new active item');
  fillList.sync(1, items[0].li);
  assert.equal(scrolls(), 1, 'nothing changed (a refocus)');
  fillList.sync(2, items[0].li);
  assert.equal(scrolls(), 2, 'the cursor moved');
  letters[2] = 'b';
  fillList.sync(2, items[0].li);
  assert.equal(scrolls(), 3, 'a letter in the active item changed');
  letters[4] = 'z';
  fillList.sync(2, items[0].li);
  assert.equal(scrolls(), 3, 'a letter in another item changed');
  fillList.sync(3, items[1].li);
  assert.equal(scrolls(), 4, 'a new active item');
});

// A Map-backed storage. Storage errors are boolPref's, tested in
// engine-chrome.storage.test.js.
function memStorage() {
  const store = new Map();
  return {
    store,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
}

function listWrapHarness(storage) {
  return withDocument(() => {
    const root = mockEl('html');
    const panel = mockEl('div');
    const clearBtn = mockEl('button');
    clearBtn.setAttribute('id', 'clear-btn');
    panel.append(clearBtn);
    const refocused = { count: 0 };
    const { pref } = setupListWrapPref({ storage, root, panel, refocus: () => { refocused.count++; } });
    const label = panel.children[0];
    const input = label.children.find(c => c.tagName === 'INPUT');
    return { root, panel, label, input, pref, clearBtn, refocused };
  });
}

test('setupListWrapPref: adds its checkbox above Clear, checked and wrapping when nothing is stored', () => {
  const { root, panel, label, input, pref, clearBtn } = listWrapHarness(memStorage());
  assert.deepEqual(panel.children, [label, clearBtn]);
  assert.ok(label.children.includes(' Wrap long rows of cells'));
  assert.equal(pref.load(), true);
  assert.equal(input.checked, true);
  assert.equal(has(root, 'list-nowrap'), false);
});

test('setupListWrapPref: unchecking it keeps rows to one line and persists across pages', () => {
  const storage = memStorage();
  const first = listWrapHarness(storage);
  first.input.checked = false;
  first.input.fire('change');
  assert.equal(has(first.root, 'list-nowrap'), true);
  assert.equal(storage.store.get('vp:pref:listWrap'), 'false');
  assert.equal(first.refocused.count, 1);
  const next = listWrapHarness(storage);
  assert.equal(next.pref.load(), false);
  assert.equal(next.input.checked, false);
  assert.equal(has(next.root, 'list-nowrap'), true);
  next.input.checked = true;
  next.input.fire('change');
  assert.equal(has(next.root, 'list-nowrap'), false);
  assert.equal(next.pref.load(), true);
});
