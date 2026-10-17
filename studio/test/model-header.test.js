'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { headerFromYaml, headerToYaml, setHeaderField } = require('../src/model/header');

test('headerFromYaml: reads the common fields and keeps unknown top-level keys in order', () => {
  const h = headerFromYaml({ kind: 'spiral', title: 'T', author: 'A', zeta: 1, inward: [], alpha: 2 }, ['inward', 'outward']);
  assert.equal(h.title, 'T');
  assert.equal(h.author, 'A');
  assert.deepEqual(h.extra, { zeta: 1, alpha: 2 });
});

test('headerFromYaml: a missing title is an empty string', () => {
  assert.equal(headerFromYaml({ kind: 'spiral' }, []).title, '');
});

test('headerToYaml: orders title, author, date, theme, themeTokens, instructions, then extra', () => {
  const out = headerToYaml({ extra: { z: 1 }, instructions: 'I', themeTokens: { 'color-bg': '#fff' }, theme: 'skeleton', date: 'D', author: 'A', title: 'T' });
  assert.deepEqual(Object.keys(out), ['title', 'author', 'date', 'theme', 'themeTokens', 'instructions', 'z']);
});

test('headerToYaml: leaves out optional fields that are not set', () => {
  assert.deepEqual(Object.keys(headerToYaml({ title: 'T', extra: {} })), ['title']);
});

test('setHeaderField: an empty string deletes an optional field, but the title is kept', () => {
  const h = { title: 'T', author: 'A', extra: {} };
  assert.ok(!('author' in setHeaderField(h, 'author', '')));
  assert.equal(setHeaderField(h, 'title', '').title, '');
  assert.equal(setHeaderField(h, 'date', '2026').date, '2026');
  assert.equal(h.author, 'A');
});

test('themeTokens round-trips, is not an "extra" key, and an empty map removes it', () => {
  const h = headerFromYaml({ kind: 'spiral', title: 'T', themeTokens: { 'color-bg': '#fff' } }, []);
  assert.deepEqual(h.themeTokens, { 'color-bg': '#fff' });
  assert.deepEqual(h.extra, {});
  assert.deepEqual(headerToYaml(h).themeTokens, { 'color-bg': '#fff' });
  assert.ok(!('themeTokens' in setHeaderField(h, 'themeTokens', {})));
});

