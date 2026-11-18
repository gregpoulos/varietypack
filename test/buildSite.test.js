'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { VALID_THEMES } = require('../shared/build/themeRegistry');
const { tmpDir } = require('./helpers');

// The release ships what scripts/build-site.js writes, and CI never runs a release, so
// this is the only check that the site builds at all.
test('build-site writes every example in every theme, the landing page and the studio', () => {
  const root = tmpDir();
  const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-site.js'), '-o', root], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);

  const names = fs.readdirSync(path.join(__dirname, '..', 'examples'))
    .filter(f => f.endsWith('.yaml')).map(f => path.basename(f, '.yaml'));
  const landing = fs.readFileSync(path.join(root, 'examples', 'index.html'), 'utf8');
  for (const theme of VALID_THEMES) {
    for (const name of names) {
      assert.ok(fs.existsSync(path.join(root, 'examples', theme, `${name}.html`)), `${theme}/${name}.html`);
      assert.ok(landing.includes(`href="${theme}/${name}.html"`), `landing links ${theme}/${name}`);
    }
  }
  assert.ok(fs.existsSync(path.join(root, 'studio', 'index.html')));
});
