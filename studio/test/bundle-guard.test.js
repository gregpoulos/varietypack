'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const path     = require('path');
const vm       = require('vm');
const esbuild  = require('esbuild');
const { esbuildOptions, pageOptions, ROOT } = require('../build');

test('the studio bundle rejects a Node builtin it does not map', async () => {
  await assert.rejects(
    esbuild.build({ ...esbuildOptions(), stdin: { contents: "require('os')", resolveDir: ROOT } }),
    /Could not resolve "os"/
  );
});

test('fs resolves to the in-memory file system, not Node\'s', async () => {
  const result = await esbuild.build({
    ...esbuildOptions(),
    stdin: {
      contents: "module.exports = require('fs').readFileSync('/varietypack/shared/base.css', 'utf8')",
      resolveDir: ROOT,
    },
    format: 'iife',
    globalName: 'out',
  });
  const ctx = { globalThis: null };
  vm.createContext(ctx);
  vm.runInContext(result.outputFiles[0].text, ctx);
  assert.equal(vm.runInContext('out', ctx), fs.readFileSync(path.join(ROOT, 'shared/base.css'), 'utf8'));
});

// The studio bundles the build path only. A CLI-layer module or terser imported from the
// core or the UI would bundle without complaint (clean-css alone breaks the build), so
// this checks what the page reaches. The page imports the core, so it covers both.
test('the studio page bundle reaches no CLI-layer module and no minifier', async () => {
  const result = await esbuild.build({ ...pageOptions(), metafile: true });
  const reached = Object.keys(result.metafile.inputs)
    .filter(f => /(^|\/)shared\/cli\/|node_modules\/(terser|clean-css|esbuild)\//.test(f));
  assert.deepEqual(reached, []);
});
