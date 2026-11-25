'use strict';

// The guard for import and export: importing then exporting an unedited valid file must
// build byte-for-byte the same HTML. One table row per kind; kind-specific round-trip
// cases follow the generated ones.
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const yaml     = require('js-yaml');
const { buildFromObject } = require('../../shared/build/buildFromObject');

const ROOT = path.resolve(__dirname, '..', '..');
const load = (rel) => yaml.load(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// The example plus every non-muddled fixture of the kind.
function filesOf(kind) {
  const dir = path.join(ROOT, kind, 'test', 'fixtures');
  return [
    `examples/${kind}.yaml`,
    ...fs.readdirSync(dir).filter(f => /\.yaml$/.test(f) && !/\.muddled\.yaml$/.test(f)).sort()
      .map(f => `${kind}/test/fixtures/${f}`),
  ];
}

// Flips the final letter of an entry's answer.
function flipLast(entry) {
  entry.answer = entry.answer.slice(0, -1) + (entry.answer.endsWith('Z') ? 'Q' : 'Z');
}

// Per kind:
//   mod / HOOKS        the studio kind module and the tool's build hooks
//   dropCircles        optional: [fixture, edit] where edit(src) removes one side's circles
//   conflict           optional: edit(src) makes two entries disagree at one cell, and the
//                      warning that reports it
//   checkModel/checkBuilt  optional extra assertions on every round trip
const KINDS = [
  {
    kind: 'snake-charmer',
    mod: require('../src/model/kinds/snake-charmer'),
    HOOKS: require('../../snake-charmer/src/builder').HOOKS,
    checkBuilt: (a, b) => assert.deepEqual(b.notes, a.notes),
    dropCircles: ['snake-charmer/test/fixtures/rebus-8.yaml', (single) => {
      const circled = single.entries.filter(e => e.styles && e.styles.circle);
      assert.ok(circled.length >= 2, 'the fixture circles the cell on more than one entry');
      delete circled[circled.length - 1].styles;
    }],
    conflict: {
      edit: (broken) => flipLast(broken.entries[broken.entries.length - 1]),
      warning: /\(lap 1\), discarded ".*" from entry \d+ \(lap 2\)$/,
      exportsLabel: 'lap-1',
    },
  },
  {
    kind: 'spiral',
    mod: require('../src/model/kinds/spiral'),
    HOOKS: require('../../spiral/src/builder').HOOKS,
    // Drop the circle from every outward entry; the studio completes it from the inward
    // side.
    dropCircles: ['spiral/test/fixtures/rebus-40.yaml', (single) => {
      for (const e of single.outward) if (e.styles) delete e.styles.circle;
      for (const e of single.outward) if (e.styles && !Object.keys(e.styles).length) delete e.styles;
    }],
    conflict: {
      edit: (broken) => flipLast(broken.outward[broken.outward.length - 1]),
      warning: /^Cell \d+: kept ".*" from inward \d+, discarded ".*" from outward \d+$/,
      exportsLabel: 'inward',
    },
  },
  {
    kind: 'marching-bands',
    mod: require('../src/model/kinds/marching-bands'),
    HOOKS: require('../../marching-bands/src/builder').HOOKS,
    dropCircles: ['marching-bands/test/fixtures/rebus-5.yaml', (single) => {
      for (const band of single.bands) for (const e of band.entries) delete e.styles;
    }],
    conflict: {
      edit: (broken) => flipLast(broken.bands[0].entries[broken.bands[0].entries.length - 1]),
      warning: /^Cell \(\d+, \d+\): kept ".*" from Row \d+ · [a-z], discarded ".*" from Band A · [a-z]$/,
      exportsLabel: 'row',
    },
  },
  {
    kind: 'crushword',
    mod: require('../src/model/kinds/crushword'),
    HOOKS: require('../../crushword/src/builder').HOOKS,
    checkModel: (mod, model) => assert.equal(mod.isModel(model), true),
  },
];

for (const row of KINDS) {
  const { kind, mod, HOOKS } = row;
  const files = filesOf(kind);

  // `files` always holds the example, so more than one means the fixtures were read.
  test(`[${kind}] the fixtures directory supplies files to round-trip`, () => {
    assert.ok(files.length > 1, files.join(', '));
  });

  for (const rel of files) {
    test(`[${kind}] round trip: ${rel} builds byte-identically and imports without warnings`, () => {
      const { model, warnings } = mod.fromYaml(load(rel));
      assert.deepEqual(warnings, []);
      if (row.checkModel) row.checkModel(mod, model);
      const a = buildFromObject(load(rel), {}, HOOKS);
      const b = buildFromObject(mod.toYaml(model), {}, HOOKS);
      assert.equal(b.html, a.html);
      if (row.checkBuilt) row.checkBuilt(a, b);
    });
  }

  if (row.dropCircles) {
    const [fixture, edit] = row.dropCircles;
    test(`[${kind}] round trip: a source with single circles builds equal to the doubled form`, () => {
      const src = load(fixture);
      const single = structuredClone(src);
      edit(single);
      const { model, warnings } = mod.fromYaml(single);
      assert.ok(warnings.some(w => /^Completed the circle/.test(w)), warnings.join('|'));
      assert.equal(buildFromObject(mod.toYaml(model), {}, HOOKS).html, buildFromObject(src, {}, HOOKS).html);
    });
  }

  if (row.conflict) {
    test(`[${kind}] round trip: a conflict exports the kept ${row.conflict.exportsLabel} letters`, () => {
      const src = load(`examples/${kind}.yaml`);
      const broken = structuredClone(src);
      row.conflict.edit(broken);
      const { model, warnings } = mod.fromYaml(broken);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], row.conflict.warning);
      assert.equal(buildFromObject(mod.toYaml(model), {}, HOOKS).html, buildFromObject(src, {}, HOOKS).html);
    });
  }
}

// ── kind-specific round trips ────────────────────────────────────────────────

test('[snake-charmer] round trip: the example\'s display texts survive verbatim', () => {
  const sc = KINDS[0].mod;
  const out = sc.toYaml(sc.fromYaml(load('examples/snake-charmer.yaml')).model);
  assert.ok(out.entries.some(e => e.answer === 'LIE TO'));
  assert.ok(out.entries.some(e => e.answer === 'GUESS WHO'));
});

test('[marching-bands] round trip: a source with the size field keeps it, and one without stays without', () => {
  const mb = KINDS[2].mod;
  const withSize = { ...load('marching-bands/test/fixtures/mb-5.yaml'), size: 5 };
  assert.equal(mb.toYaml(mb.fromYaml(withSize).model).size, 5);
  const without = load('marching-bands/test/fixtures/mb-5.yaml');
  delete without.size;
  assert.ok(!('size' in mb.toYaml(mb.fromYaml(without).model)));
});

test('[crushword] round trip: cw-9\'s cells with only one direction survive', () => {
  const cw = KINDS[3].mod;
  const { model } = cw.fromYaml(load('crushword/test/fixtures/cw-9.yaml'));
  assert.ok(cw.gridChecks(model).uncrossed.length > 0);
  assert.deepEqual(cw.toYaml(model).grid, load('crushword/test/fixtures/cw-9.yaml').grid);
});

test('[crushword] round trip: maxCellLetters is kept when set and absent when not', () => {
  const cw = KINDS[3].mod;
  const src = load('crushword/test/fixtures/cw-rebus-5.yaml');
  const m = cw.fromYaml(src).model;
  assert.equal('maxCellLetters' in cw.toYaml(m), 'maxCellLetters' in src);
});
