'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { routeOf, formatRoute, parseRoute, historyStep } = require('../src/model/route');

const doc = (view, yaml = false) => ({ screen: 'doc', id: 'dabc', view, yaml });
const home = { screen: 'home' };

test('formatRoute and parseRoute round-trip', () => {
  const rows = [
    [home, '#/'],
    [{ screen: 'muddled' }, '#/muddled'],
    [doc('clues'), '#/d/dabc/clues'],
    [doc('board', true), '#/d/dabc/yaml'],
  ];
  for (const [route, hash] of rows) {
    assert.equal(formatRoute(route), hash);
    assert.deepEqual(parseRoute(hash), route);
    assert.deepEqual(parseRoute(hash.slice(1)), route);
  }
  // Parsing 'test' gives yaml:false, so only formatting is checked.
  assert.equal(formatRoute(doc('test', true)), '#/d/dabc/test');
});

test("parseRoute: '' and '#' are home; '#/d/x/nope' and '#/zzz' are null", () => {
  assert.deepEqual(parseRoute(''), home);
  assert.deepEqual(parseRoute('#'), home);
  assert.equal(parseRoute('#/d/x/nope'), null);
  assert.equal(parseRoute('#/zzz'), null);
});

test('historyStep', () => {
  assert.equal(historyStep(null, home), 'replace');
  assert.equal(historyStep(doc('board'), doc('clues')), 'push');
  assert.equal(historyStep(doc('board'), doc('board', true)), 'replace');
  assert.equal(historyStep(home, doc('board')), 'push');
  assert.equal(historyStep(doc('clues'), doc('clues')), 'none');
});

test('routeOf: home, a structured doc, a YAML doc, a muddled doc', () => {
  assert.deepEqual(routeOf({ doc: null, view: 'board' }), home);
  assert.deepEqual(routeOf({ doc: { id: 'dabc', mode: 'structured' }, view: 'clues' }), doc('clues'));
  assert.deepEqual(routeOf({ doc: { id: 'dabc', mode: 'yaml' }, view: 'board' }), doc('board', true));
  assert.deepEqual(routeOf({ doc: { id: 'dabc', mode: 'muddled' }, view: 'board' }), { screen: 'muddled' });
});

test('an id that needs escaping round-trips; a malformed escape is null', () => {
  const route = { screen: 'doc', id: 'a/b', view: 'board', yaml: false };
  assert.equal(formatRoute(route), '#/d/a%2Fb/board');
  assert.deepEqual(parseRoute('#/d/a%2Fb/board'), route);
  assert.equal(parseRoute('#/d/%E0%A4%A/clues'), null);
});
