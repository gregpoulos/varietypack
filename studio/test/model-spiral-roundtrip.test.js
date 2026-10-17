'use strict';

// The guard for import and export: importing then exporting an unedited valid file must
// build byte-for-byte the same HTML (spec §4.6).
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const spiral   = require('../src/model/kinds/spiral');
const { buildFromObject } = require('../../shared/build/buildFromObject');
const { HOOKS } = require('../../spiral/src/builder');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(ROOT, 'spiral', 'test', 'fixtures');
const FILES = [
  'examples/spiral.yaml',
  ...fs.readdirSync(FIX).filter(f => /\.yaml$/.test(f) && !/\.muddled\.yaml$/.test(f)).sort()
    .map(f => `spiral/test/fixtures/${f}`),
];
const load = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// FILES always holds the example, so more than one means the fixtures directory was read.
test('the fixtures directory supplies files to round-trip', () => {
  assert.ok(FILES.length > 1, FILES.join(', '));
});

for (const rel of FILES) {
  test(`round trip: ${rel} builds byte-identically and imports without warnings`, () => {
    const { model, warnings } = spiral.fromYaml(load(rel));
    assert.deepEqual(warnings, []);
    const a = buildFromObject(load(rel), {}, HOOKS);
    const b = buildFromObject(spiral.toYaml(model), {}, HOOKS);
    assert.equal(b.html, a.html);
  });
}

test('round trip: a source with single circles builds equal to the doubled form', () => {
  const src = load('spiral/test/fixtures/rebus-40.yaml');
  const doubled = structuredClone(src);
  // Drop the circle from every outward entry; the studio completes it from the inward
  // side.
  const single = structuredClone(src);
  for (const e of single.outward) if (e.styles) delete e.styles.circle;
  for (const e of single.outward) if (e.styles && !Object.keys(e.styles).length) delete e.styles;
  const { model, warnings } = spiral.fromYaml(single);
  assert.ok(warnings.some(w => /^Completed the circle/.test(w)), warnings.join('|'));
  const a = buildFromObject(doubled, {}, HOOKS);
  const b = buildFromObject(spiral.toYaml(model), {}, HOOKS);
  assert.equal(b.html, a.html);
});

test('round trip: a source with a reversal conflict exports the inward letters', () => {
  const src = load('examples/spiral.yaml');
  const broken = structuredClone(src);
  const last = broken.outward[broken.outward.length - 1];
  last.answer = last.answer.slice(0, -1) + (last.answer.endsWith('Z') ? 'Q' : 'Z');   // flip its final letter
  const { model, warnings } = spiral.fromYaml(broken);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Cell \d+: kept ".*" from inward \d+, discarded ".*" from outward \d+$/);
  const a = buildFromObject(src, {}, HOOKS);
  const b = buildFromObject(spiral.toYaml(model), {}, HOOKS);
  assert.equal(b.html, a.html);
});
