'use strict';

// The guard for import and export (spec §4.6): importing then exporting an unedited valid
// file must build byte-identical HTML.
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const cw       = require('../src/model/kinds/crushword');
const { buildFromObject } = require('../../shared/build/buildFromObject');
const { HOOKS } = require('../../crushword/src/builder');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(ROOT, 'crushword', 'test', 'fixtures');
const FILES = [
  'examples/crushword.yaml',
  ...fs.readdirSync(FIX).filter(f => /\.yaml$/.test(f) && !/\.muddled\.yaml$/.test(f)).sort()
    .map(f => `crushword/test/fixtures/${f}`),
];
const load = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// FILES always holds the example, so more than one means the fixtures directory was read.
test('the fixtures directory supplies files to round-trip', () => {
  assert.ok(FILES.length > 1, FILES.join(', '));
});

for (const rel of FILES) {
  test(`round trip: ${rel} builds byte-identically and imports without warnings`, () => {
    const { model, warnings } = cw.fromYaml(load(rel));
    assert.deepEqual(warnings, []);
    assert.equal(cw.isModel(model), true);
    const a = buildFromObject(load(rel), {}, HOOKS);
    const b = buildFromObject(cw.toYaml(model), {}, HOOKS);
    assert.equal(b.html, a.html);
  });
}

test('round trip: cw-9\'s cells with only one direction survive', () => {
  const { model } = cw.fromYaml(load('crushword/test/fixtures/cw-9.yaml'));
  assert.ok(cw.gridChecks(model).uncrossed.length > 0);
  assert.deepEqual(cw.toYaml(model).grid, load('crushword/test/fixtures/cw-9.yaml').grid);
});

test('round trip: maxCellLetters is kept when set and absent when not', () => {
  const src = load('crushword/test/fixtures/cw-rebus-5.yaml');
  const m = cw.fromYaml(src).model;
  assert.equal('maxCellLetters' in cw.toYaml(m), 'maxCellLetters' in src);
});
