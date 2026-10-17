'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const vm       = require('vm');
const yaml     = require('js-yaml');
const { bundleCore, ROOT } = require('../build');
const { buildFromObject } = require('../../shared/build/buildFromObject');
const { muddlePuzzle, MUDDLED_DUMP_OPTIONS } = require('../../shared/build/muddleUtils');
const { TOOLS } = require('../../shared/build/engineBundle');

// The studio's core is the repo's build path bundled for the browser. These tests prove
// it produces the CLI's bytes for every example and fixture. See studio/CLAUDE.md for
// what to do when one fails.

const HOOKS = Object.fromEntries(TOOLS.map(k => [k, require(`../../${k}/src/builder`).HOOKS]));

function sourceFiles() {
  const files = [];
  for (const kind of TOOLS) {
    files.push(path.join(ROOT, 'examples', `${kind}.yaml`));
    const dir = path.join(ROOT, kind, 'test', 'fixtures');
    for (const f of fs.readdirSync(dir).sort()) if (/\.yaml$/.test(f)) files.push(path.join(dir, f));
  }
  return files;
}

const VARIANTS = [
  { name: 'plain',          options: {} },
  { name: 'muddle',         options: { muddle: true } },          // skipped for *.muddled.yaml
  { name: 'skeleton embed', options: { theme: 'skeleton', font: 'embed' } },
  { name: 'skeleton link',  options: { theme: 'skeleton', font: 'link' } },
  { name: 'skeleton default font', options: { theme: 'skeleton' } },
];

function browserContext(code) {
  const ctx = { atob, btoa, TextDecoder, TextEncoder, URL, console };
  ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx;
}

for (const minify of [false, true]) {
  test(`core bundle (${minify ? 'minified' : 'unminified'}) builds every fixture byte-identically to buildFromObject in Node`, async () => {
    const ctx = browserContext(await bundleCore({ minify }));
    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8');
      const puzzle = yaml.load(text);
      for (const { name, options } of VARIANTS) {
        if (options.muddle && /\.muddled\.yaml$/.test(file)) continue;
        const where = `${path.relative(ROOT, file)} [${name}]`;
        const expected = buildFromObject(puzzle, options, HOOKS[puzzle.kind]);
        ctx.__text = text;
        ctx.__opts = JSON.stringify(options);
        // Cross the realm boundary as JSON: deepStrictEqual checks prototypes.
        const actual = JSON.parse(vm.runInContext(
          'JSON.stringify(studioCore.build(studioCore.parseYaml(__text), JSON.parse(__opts)))', ctx));
        for (const field of ['html', 'title', 'warnings', 'notes']) {
          assert.deepStrictEqual(actual[field], expected[field], `${where}: ${field} differs`);
        }
      }
    }
  });
}

test('core bundle runs with no Node globals', async () => {
  const ctx = browserContext(await bundleCore());
  for (const g of ['require', 'process', 'Buffer', 'module']) {
    assert.equal(vm.runInContext(`typeof ${g}`, ctx), 'undefined', g);
  }
});

test('core bundle muddles every source YAML exactly as varietypack muddle does', async () => {
  const ctx = browserContext(await bundleCore());
  for (const file of sourceFiles()) {
    if (/\.muddled\.yaml$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const p = yaml.load(text);
    const expected = yaml.dump(muddlePuzzle(p, HOOKS[p.kind]).muddled, MUDDLED_DUMP_OPTIONS);
    ctx.__text = text;
    const actual = vm.runInContext('studioCore.muddle(studioCore.parseYaml(__text)).text', ctx);
    assert.equal(actual, expected, path.relative(ROOT, file));
  }
});

test('core bundle contains no absolute path from the build machine', async () => {
  const code = await bundleCore();
  assert.ok(!code.includes(ROOT));
});
