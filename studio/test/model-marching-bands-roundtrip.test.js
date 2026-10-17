'use strict';

// The guard for import and export (spec §4.6): importing then exporting an unedited valid
// file must build byte-identical HTML.
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const mb       = require('../src/model/kinds/marching-bands');
const { buildFromObject } = require('../../shared/build/buildFromObject');
const { HOOKS } = require('../../marching-bands/src/builder');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(ROOT, 'marching-bands', 'test', 'fixtures');
const FILES = [
  'examples/marching-bands.yaml',
  ...fs.readdirSync(FIX).filter(f => /\.yaml$/.test(f) && !/\.muddled\.yaml$/.test(f)).sort()
    .map(f => `marching-bands/test/fixtures/${f}`),
];
const load = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// FILES always holds the example, so more than one means the fixtures directory was read.
test('the fixtures directory supplies files to round-trip', () => {
  assert.ok(FILES.length > 1, FILES.join(', '));
});

for (const rel of FILES) {
  test(`round trip: ${rel} builds byte-identically and imports without warnings`, () => {
    const { model, warnings } = mb.fromYaml(load(rel));
    assert.deepEqual(warnings, []);
    const a = buildFromObject(load(rel), {}, HOOKS);
    const b = buildFromObject(mb.toYaml(model), {}, HOOKS);
    assert.equal(b.html, a.html);
  });
}

test('round trip: a source with the size field keeps it, and one without stays without', () => {
  const withSize = { ...load('marching-bands/test/fixtures/mb-5.yaml'), size: 5 };
  assert.equal(mb.toYaml(mb.fromYaml(withSize).model).size, 5);
  const without = load('marching-bands/test/fixtures/mb-5.yaml');
  delete without.size;
  assert.ok(!('size' in mb.toYaml(mb.fromYaml(without).model)));
});

test('round trip: a source with single circles builds equal to the doubled form', () => {
  const src = load('marching-bands/test/fixtures/rebus-5.yaml');
  const single = structuredClone(src);
  for (const band of single.bands) for (const e of band.entries) delete e.styles;
  const { model, warnings } = mb.fromYaml(single);
  assert.ok(warnings.some(w => /^Completed the circle/.test(w)), warnings.join('|'));
  assert.equal(buildFromObject(mb.toYaml(model), {}, HOOKS).html, buildFromObject(src, {}, HOOKS).html);
});

test('round trip: a row/band conflict exports the row letters', () => {
  const src = load('examples/marching-bands.yaml');
  const broken = structuredClone(src);
  const last = broken.bands[0].entries[broken.bands[0].entries.length - 1];
  last.answer = last.answer.slice(0, -1) + (last.answer.endsWith('Z') ? 'Q' : 'Z');
  const { model, warnings } = mb.fromYaml(broken);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Cell \(\d+, \d+\): kept ".*" from Row \d+ · [a-z], discarded ".*" from Band A · [a-z]$/);
  assert.equal(buildFromObject(mb.toYaml(model), {}, HOOKS).html, buildFromObject(src, {}, HOOKS).html);
});
