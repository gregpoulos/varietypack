#!/usr/bin/env node
'use strict';

// Scoped e2e run for one tool, for the edit-test loop: the tool's own specs plus that
// tool's share of e2e/shared.spec.js, instead of the whole suite. Not a substitute for
// the full matrix, which CI runs (docs/TESTING.md → "What to run when").
//
//   npm run test:e2e:tool -- spiral                     # Chromium
//   npm run test:e2e:tool -- spiral --project=webkit    # any other playwright flags pass through
//
// shared.spec.js runs each shared contract once per tool, with the title prefixed
// `[<tool>]`, so `-g` selects one tool's share by title. It is a separate run because
// `-g` would also filter the tool's own specs, whose titles carry no prefix.

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { KINDS: TOOLS } = require('../shared/build/tools');

// The tool name is the first argument that isn't a flag; everything else is forwarded.
const args = process.argv.slice(2);
const tool = args.find(a => !a.startsWith('-'));
if (!TOOLS.includes(tool)) {
  console.error(`usage: npm run test:e2e:tool -- <${TOOLS.join('|')}> [playwright flags]`);
  process.exit(2);
}
const passthrough = args.filter(a => a !== tool);
if (!passthrough.some(a => a.startsWith('--project'))) passthrough.push('--project=chromium');

// The tool's own specs: its page and its studio editor, where they exist.
const own = [`${tool}.spec.js`, `studio-${tool}.spec.js`]
  .map(f => path.join('e2e', f))
  .filter(f => fs.existsSync(f));

const run = extra => spawnSync('npx', ['playwright', 'test', ...extra, ...passthrough], { stdio: 'inherit' }).status;
const ownStatus = run(own);
const sharedStatus = run(['e2e/shared.spec.js', '-g', `\\[${tool}\\]`]);
process.exit(ownStatus || sharedStatus);
