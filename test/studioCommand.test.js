'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { main } = require('../cli');
const { studioCommand, openerFor, DEFAULT_OUTPUT } = require('../shared/cli/studioCommand');
const { tmpDir } = require('./helpers');

// Output captured, with `open` and `build` stubbed so no test launches a browser and only
// the end-to-end test bundles. `opened` and `built` record the paths each was given.
function runStudio(args, { open = () => null, build = () => ({ status: 0, stdout: '', stderr: '' }) } = {}) {
  let stdout = '';
  let stderr = '';
  const opened = [];
  const built = [];
  const status = studioCommand(args, {
    stdout: { write: s => { stdout += s; } },
    stderr: { write: s => { stderr += s; } },
    open: file => { opened.push(file); return open(file); },
    build: file => { built.push(file); return build(file); },
  });
  return { status, stdout, stderr, opened, built };
}

test('varietypack studio builds the page to -o and opens that file', () => {
  const out = path.join(tmpDir(), 'studio.html');
  const opened = [];
  let stderr = '';
  const status = main(['studio', '-o', out], {
    stdout: { write: () => {} },
    stderr: { write: s => { stderr += s; } },
    open: file => { opened.push(file); return null; },
  });
  assert.equal(status, 0, stderr);
  assert.deepEqual(opened, [out]);
  assert.match(fs.readFileSync(out, 'utf8'), /<html/i);
});

test('bare studio builds the default page and opens it rather than printing help', () => {
  const r = runStudio([]);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Usage:/);
  assert.deepEqual(r.built, [DEFAULT_OUTPUT]);
  assert.deepEqual(r.opened, [DEFAULT_OUTPUT]);
});

test('studio --help prints its usage, -h included, and exits 0', () => {
  const r = runStudio(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: varietypack studio/);
  assert.match(r.stdout, /-h, --help/);
  assert.deepEqual(r.built, []);
});

test('studio --no-open builds without opening', () => {
  const r = runStudio(['--no-open']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.built.length, 1);
  assert.deepEqual(r.opened, []);
});

test('studio -o refuses an existing file unless forced', () => {
  const out = path.join(tmpDir(), 'puzzle.html');
  fs.writeFileSync(out, 'a puzzle');
  const refused = runStudio(['-o', out]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /already exists.*\n.*--force/);
  assert.deepEqual(refused.built, []);
  const forced = runStudio(['-o', out, '-f']);
  assert.equal(forced.status, 0, forced.stderr);
  assert.deepEqual(forced.built, [out]);
});

test('studio reports a build that could not run', () => {
  const r = runStudio(['--no-open'], { build: () => ({ status: null, signal: null, error: new Error('spawn EACCES') }) });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /spawn EACCES/);
  const killed = runStudio(['--no-open'], { build: () => ({ status: null, signal: 'SIGKILL' }) });
  assert.equal(killed.status, 1);
  assert.match(killed.stderr, /SIGKILL/);
});

test('studio stops at a failed build without opening', () => {
  const r = runStudio([], { build: () => ({ status: 1, stdout: '', stderr: 'bundle failed\n' }) });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /bundle failed/);
  assert.deepEqual(r.opened, []);
});

test('studio reports an opener that fails', () => {
  const r = runStudio([], { open: () => 'no browser' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no browser/);
});

test('studio rejects a positional argument', () => {
  const r = runStudio(['extra']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unexpected argument 'extra'/);
});

test('each platform has an opener', () => {
  assert.equal(openerFor('darwin'), 'open');
  assert.equal(openerFor('win32'), 'explorer.exe');
  assert.equal(openerFor('linux'), 'xdg-open');
});
