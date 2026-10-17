'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupCellClicks } = require('../engine-chrome.mjs');

// The board takes a plain mock, on the setupRebusButton precedent: one listener on the
// <svg>, and a click target whose closest('.cell') is the cell under the pointer, or
// null for anything else (the background, a black square).
function makeSvg() {
  const listeners = [];
  return {
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    clickOn(cell) {
      const target = { closest: sel => (sel === '.cell' ? cell : null) };
      for (const l of listeners) if (l.type === 'click') l.fn({ target });
    },
    count: () => listeners.length,
  };
}

test('a click on a cell passes its number to the handler', () => {
  const svg = makeSvg();
  const seen = [];
  setupCellClicks(svg, n => seen.push(n));
  svg.clickOn({ id: 'cell-12' });
  svg.clickOn({ id: 'cell-0' });
  assert.deepEqual(seen, [12, 0]);
});

test('a click outside every cell is ignored', () => {
  const svg = makeSvg();
  const seen = [];
  setupCellClicks(svg, n => seen.push(n));
  svg.clickOn(null);
  assert.deepEqual(seen, []);
});

test('the whole board shares one listener', () => {
  const svg = makeSvg();
  setupCellClicks(svg, () => {});
  assert.equal(svg.count(), 1);
});
