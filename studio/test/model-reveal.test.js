'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { revealDelta } = require('../src/model/reveal');

const col = { top: 100, bottom: 500 };
const row = (top, h = 40) => ({ top, bottom: top + h });

test('a row inside the frame needs no scroll', () => assert.equal(revealDelta(col, row(200)), 0));
test('a row below the frame scrolls just far enough to show its bottom', () => assert.equal(revealDelta(col, row(480)), 20));
test('a row above the frame scrolls just far enough to show its top', () => assert.equal(revealDelta(col, row(70)), -30));
