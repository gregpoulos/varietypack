'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runCli } = require('./helpers');

test('tmpDir directories are gone after the process exits', () => {
  const helpers = path.resolve(__dirname, 'helpers.js');
  const script = `
    const fs = require('node:fs'), path = require('node:path');
    const { tmpDir } = require(${JSON.stringify(helpers)});
    const d = tmpDir();
    fs.writeFileSync(path.join(d, 'f.txt'), 'x');
    process.stdout.write(d);`;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.length > 0);
  assert.equal(fs.existsSync(r.stdout), false);
});

test('runCli captures stdout and the status', () => {
  const r = runCli('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: varietypack/);
});
