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
const FIXTURE_YAML = path.resolve(__dirname, 'fixtures/mb-5.yaml');

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-mb-muddle-'));
}

const SOURCE = yaml.load(fs.readFileSync(FIXTURE_YAML, 'utf8'));
const EXPECTED_BOARD_HASH = preparePuzzle({ ...SOURCE, hashed: true }).boardHash;

test('muddle: creates .muddled.yaml next to the source', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'mb-5.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  const r = run('muddle', input);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'mb-5.muddled.yaml')));
});

test('muddle: output has hashed:true, boardHash, no answer: or hash: in rows or bands', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'mb-5.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);
  const muddled = yaml.load(fs.readFileSync(path.join(dir, 'mb-5.muddled.yaml'), 'utf8'));

  assert.equal(muddled.hashed,    true);
  assert.equal(muddled.boardHash, EXPECTED_BOARD_HASH);
  const allEntries = [
    ...muddled.rows.flatMap(r => r.entries),
    ...muddled.bands.flatMap(b => b.entries),
  ];
  for (const entry of allEntries) {
    assert.ok(!('answer' in entry), 'entry still contains answer');
    assert.ok(!('hash'   in entry), 'entry contains hash');
    assert.ok(Number.isInteger(entry.length) && entry.length >= 1);
  }
});

test('muddle: building from muddled YAML produces same boardHash as source built with hashed:true', () => {
  const dir         = tmpDir();
  const input       = path.join(dir, 'mb-5.yaml');
  const muddledPath = path.join(dir, 'mb-5.muddled.yaml');
  const outHtml     = path.join(dir, 'mb-5.muddled.html');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);

  const buildResult = run('build', muddledPath, '-o', outHtml);
  assert.equal(buildResult.status, 0, buildResult.stderr);

  const html = fs.readFileSync(outHtml, 'utf8');
  assert.ok(
    html.includes(`"boardHash": "${EXPECTED_BOARD_HASH}"`),
    `Built HTML boardHash mismatch. Expected: ${EXPECTED_BOARD_HASH}`
  );
});

test('validate: muddled marching-bands YAML exits 0 with skip notice', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'mb-5.yaml');
  fs.copyFileSync(FIXTURE_YAML, input);
  run('muddle', input);
  const r = run('validate', path.join(dir, 'mb-5.muddled.yaml'));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /muddled/i);
});
