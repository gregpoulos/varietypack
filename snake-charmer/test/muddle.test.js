'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path  = require('node:path');
const fs    = require('node:fs');
const os    = require('node:os');
const yaml  = require('js-yaml');
const { preparePuzzle } = require('../src/hasher');

const CLI          = path.resolve(__dirname, '../../cli.js');
const FIXTURE_YAML = path.resolve(__dirname, 'fixtures/circle-8.yaml');

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-sc-muddle-'));
}

const SOURCE = yaml.load(fs.readFileSync(FIXTURE_YAML, 'utf8'));
const EXPECTED_BOARD_HASH = preparePuzzle({ ...SOURCE, hashed: true }).boardHash;

test('muddle: creates .muddled.yaml next to the source', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  const r = run('muddle', input);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'circle-8.muddled.yaml')), 'output file missing');
  assert.match(r.stdout, /circle-8\.yaml.*circle-8\.muddled\.yaml/);
});

test('muddle: output has hashed:true, boardHash, no answer: or hash: keys', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);
  const muddled = yaml.load(fs.readFileSync(path.join(dir, 'circle-8.muddled.yaml'), 'utf8'));

  assert.equal(muddled.hashed,    true);
  assert.equal(muddled.boardHash, EXPECTED_BOARD_HASH);
  for (const entry of muddled.entries) {
    assert.ok(!('answer' in entry), 'entry still contains answer');
    assert.ok(!('hash'   in entry), 'entry contains hash');
    assert.ok(Number.isInteger(entry.length) && entry.length >= 1);
  }
});

test('muddle: building from muddled YAML produces same boardHash as building source with hashed:true', () => {
  const dir         = tmpDir();
  const input       = path.join(dir, 'circle-8.yaml');
  const muddledPath = path.join(dir, 'circle-8.muddled.yaml');
  const outHtml     = path.join(dir, 'circle-8.muddled.html');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);

  const buildResult = run('build', muddledPath, '-o', outHtml);
  assert.equal(buildResult.status, 0, buildResult.stderr);
  assert.ok(fs.existsSync(outHtml), 'HTML not built from muddled YAML');

  const html = fs.readFileSync(outHtml, 'utf8');
  assert.ok(
    html.includes(`"boardHash": "${EXPECTED_BOARD_HASH}"`),
    `Built HTML does not contain expected boardHash.\nExpected: ${EXPECTED_BOARD_HASH}\nHTML snippet: ${html.slice(html.indexOf('boardHash') - 5, html.indexOf('boardHash') + 80)}`
  );
});

test('validate: muddled YAML exits 0 with skip notice', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);
  const r = run('validate', path.join(dir, 'circle-8.muddled.yaml'));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /muddled/i);
});

test('muddle: idempotent — re-muddling a muddled file produces identical output', () => {
  const dir         = tmpDir();
  const input       = path.join(dir, 'circle-8.yaml');
  const muddledPath = path.join(dir, 'circle-8.muddled.yaml');
  const remuddle    = path.join(dir, 'circle-8.muddled2.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);
  run('muddle', muddledPath, '-o', remuddle);
  assert.equal(
    fs.readFileSync(muddledPath, 'utf8'),
    fs.readFileSync(remuddle,    'utf8')
  );
});

test('muddle: -f overwrites existing output', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);
  const r = run('muddle', input, '-f');
  assert.equal(r.status, 0, r.stderr);
});

test('muddle: refuses to overwrite without -f', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);
  const r = run('muddle', input);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/i);
});
