'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { titleSizePx, HEADER_LIMITS, TITLE_MAX_PX, TITLE_MIN_PX } = require('../src/model/header');

test('a short title keeps the full size', () => {
  assert.equal(titleSizePx(0), TITLE_MAX_PX);
  assert.equal(titleSizePx(20), TITLE_MAX_PX);
});
test('a longer title shrinks steadily, never below the floor', () => {
  assert.ok(titleSizePx(40) < TITLE_MAX_PX && titleSizePx(40) > TITLE_MIN_PX);
  assert.ok(titleSizePx(30) > titleSizePx(40));
  assert.equal(titleSizePx(HEADER_LIMITS.title), TITLE_MIN_PX);
  assert.equal(titleSizePx(500), TITLE_MIN_PX);
});
test('every header field has a limit', () => {
  for (const f of ['title', 'author', 'date']) assert.ok(HEADER_LIMITS[f] > 0, f);
  assert.ok(HEADER_LIMITS.title > HEADER_LIMITS.author && HEADER_LIMITS.author > HEADER_LIMITS.date);
});
