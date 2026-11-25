'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupEmbedResize } = require('../engine-chrome.mjs');

// root.height is the box height (getBoundingClientRect), which can shrink; scrollHeight
// can't. A fake ResizeObserver that records its callback so a test can fire it.
function fakeEnv({ framed = true, fills = false } = {}) {
  const posted = [];
  const root = {
    height: 480.2,
    getBoundingClientRect() { return { height: this.height }; },
  };
  const win = {};
  win.getComputedStyle = () => ({ getPropertyValue: p => (p === '--fills-view' && env.fills ? ' 1' : '') });
  win.parent = framed ? { postMessage: (msg, origin) => posted.push({ msg, origin }) } : win;
  let fire;
  class RO {
    constructor(cb) { fire = cb; }
    observe(el) { this.el = el; }
  }
  const env = { win, root, RO, posted, fills, fire: () => fire() };
  return env;
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

// A layout that fills its view (the phone layout, Crushword's desktop fill layout) is one
// screen high however tall its frame is, so it asks the host for a screen-high frame
// rather than reporting a height to copy; any other page doesn't.
test('embed resize: a page whose layout fills its view asks to fill the screen, others do not', () => {
  for (const fills of [true, false]) {
    const env = fakeEnv({ fills });
    setupEmbedResize({ win: env.win, root: env.root, RO: env.RO });
    env.fire();
    assert.equal(env.posted[0].msg.fill, fills || undefined);
  }
});

// The layout can change while the page is open (a resize across Crushword's width
// threshold) without the height changing, and the host must still hear about it.
test('embed resize: fill follows the layout as it changes', () => {
  const env = fakeEnv({ fills: false });
  setupEmbedResize({ win: env.win, root: env.root, RO: env.RO });
  env.fire();
  assert.equal(env.posted[0].msg.fill, undefined);
  env.fills = true;
  env.fire();
  assert.equal(env.posted.length, 2);
  assert.equal(env.posted[1].msg.fill, true);
  env.fire();
  assert.equal(env.posted.length, 2);
});
