'use strict';

// The guard for import and export (spec §4.6): importing then exporting an unedited valid
// file must build byte-identical HTML.
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const sc       = require('../src/model/kinds/snake-charmer');
const { buildFromObject } = require('../../shared/build/buildFromObject');
const { HOOKS } = require('../../snake-charmer/src/builder');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(ROOT, 'snake-charmer', 'test', 'fixtures');
const FILES = [
  'examples/snake-charmer.yaml',
  ...fs.readdirSync(FIX).filter(f => /\.yaml$/.test(f) && !/\.muddled\.yaml$/.test(f)).sort()
    .map(f => `snake-charmer/test/fixtures/${f}`),
];
const load = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// FILES always holds the example, so more than one means the fixtures directory was read.
test('the fixtures directory supplies files to round-trip', () => {
  assert.ok(FILES.length > 1, FILES.join(', '));
});

for (const rel of FILES) {
  test(`round trip: ${rel} builds byte-identically and imports without warnings`, () => {
    const { model, warnings } = sc.fromYaml(load(rel));
    assert.deepEqual(warnings, []);
    const a = buildFromObject(load(rel), {}, HOOKS);
    const b = buildFromObject(sc.toYaml(model), {}, HOOKS);
    assert.equal(b.html, a.html);
    assert.deepEqual(b.notes, a.notes);
  });
}

test('round trip: the example\'s display answers survive verbatim', () => {
  const out = sc.toYaml(sc.fromYaml(load('examples/snake-charmer.yaml')).model);
  assert.ok(out.entries.some(e => e.answer === 'LIE TO'));
  assert.ok(out.entries.some(e => e.answer === 'GUESS WHO'));
});

test('round trip: a source with single circles builds equal to the doubled form', () => {
  const src = load('snake-charmer/test/fixtures/rebus-8.yaml');
  const single = structuredClone(src);
  const circled = single.entries.filter(e => e.styles && e.styles.circle);
  assert.ok(circled.length >= 2, 'the fixture circles the cell on more than one entry');
  delete circled[circled.length - 1].styles;
  const { model, warnings } = sc.fromYaml(single);
  assert.ok(warnings.some(w => /^Completed the circle/.test(w)), warnings.join('|'));
  const a = buildFromObject(src, {}, HOOKS);
  const b = buildFromObject(sc.toYaml(model), {}, HOOKS);
  assert.equal(b.html, a.html);
});

test('round trip: a lap conflict exports the lap-1 letters', () => {
  const src = load('examples/snake-charmer.yaml');
  const broken = structuredClone(src);
  const last = broken.entries[broken.entries.length - 1];
  last.answer = last.answer.slice(0, -1) + (last.answer.endsWith('Z') ? 'Q' : 'Z');
  const { model, warnings } = sc.fromYaml(broken);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\(lap 1\), discarded ".*" from entry \d+ \(lap 2\)$/);
  assert.equal(buildFromObject(sc.toYaml(model), {}, HOOKS).html, buildFromObject(src, {}, HOOKS).html);
});
