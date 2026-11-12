'use strict';
// A tool's page script: its engine.js and everything it imports, bundled by esbuild into
// one script. It is the same for every puzzle of a tool, so it is built once per process.
//
// This is the one build-path module that needs Node (esbuild). The studio can't run
// esbuild in the browser, so its bundle swaps this module for one holding the same
// scripts, built ahead of time by studio/build.js.

const path = require('path');
const { KINDS } = require('./tools');

const ROOT = path.join(__dirname, '..', '..');

const cache = new Map();

function engineJs(tool) {
  if (!KINDS.includes(tool)) throw new Error(`unknown tool "${tool}"`);
  if (!cache.has(tool)) {
    // Required here, not at load: commands that never build a page don't pay for esbuild.
    const esbuild = require('esbuild');
    const { outputFiles } = esbuild.buildSync({
      entryPoints: [path.join(ROOT, tool, 'src/template/engine.js')],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      legalComments: 'none',
      // esbuild writes an iife without the strict-mode directive the engines carried.
      banner: { js: '"use strict";' },
      write: false,
      logLevel: 'silent',
    });
    cache.set(tool, outputFiles[0].text);
  }
  return cache.get(tool);
}

module.exports = { engineJs };
