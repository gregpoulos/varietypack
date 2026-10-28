'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupEmbedResize } = require('../engine-chrome.mjs');

// root.height is the box height (getBoundingClientRect), which can shrink; scrollHeight
// can't. A fake ResizeObserver that records its callback so a test can fire it.
function fakeEnv({ framed = true, phone = false } = {}) {
  const posted = [];
  const root = {
    height: 480.2,
    getBoundingClientRect() { return { height: this.height }; },
    classList: { contains: c => phone && c === 'phone' },
  };
  const win = {};
  win.parent = framed ? { postMessage: (msg, origin) => posted.push({ msg, origin }) } : win;
  let fire;
  class RO {
    constructor(cb) { fire = cb; }
    observe(el) { this.el = el; }
  }
  return { win, root, RO, posted, fire: () => fire() };
}

test('embed resize: the first callback posts the document height', () => {
  const env = fakeEnv();
  setupEmbedResize({ win: env.win, root: env.root, RO: env.RO });
  env.fire();
  assert.deepEqual(env.posted, [{ msg: { type: 'varietypack:resize', height: 481 }, origin: '*' }]);
});

test('embed resize: an unchanged height does not post again, a changed one does', () => {
  const env = fakeEnv();
  setupEmbedResize({ win: env.win, root: env.root, RO: env.RO });
  env.fire();
  env.fire();
  assert.equal(env.posted.length, 1);
  env.root.height = 700;
  env.fire();
  assert.equal(env.posted.length, 2);
  assert.equal(env.posted[1].msg.height, 700);
});

test('embed resize: a page that is not framed does nothing', () => {
  const env = fakeEnv({ framed: false });
  assert.equal(setupEmbedResize({ win: env.win, root: env.root, RO: env.RO }), null);
});

test('embed resize: without ResizeObserver does nothing', () => {
  const env = fakeEnv();
  assert.equal(setupEmbedResize({ win: env.win, root: env.root, RO: undefined }), null);
  assert.deepEqual(env.posted, []);
});

// The phone layout is one screen high however tall its frame is, so it asks the host
// for a screen-high frame rather than reporting a height to copy; a desktop page doesn't.
test('embed resize: a phone layout asks to fill the screen, a desktop page does not', () => {
  for (const phone of [true, false]) {
    const env = fakeEnv({ phone });
    setupEmbedResize({ win: env.win, root: env.root, RO: env.RO });
    env.fire();
    assert.equal(env.posted[0].msg.fill, phone || undefined);
  }
});
