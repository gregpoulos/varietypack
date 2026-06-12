'use strict';

/**
 * Smoke test for the Snake Charmer CLI.
 *
 * Shared behavioral tests (--help, no-args, --force, --minify, invalid-flag)
 * live in shared/test/toolCli.test.js — one home per behavior.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs   = require('node:fs');
const os   = require('node:os');

const CLI     = path.resolve(__dirname, '..', 'cli.js');
const FIXTURE = path.resolve(__dirname, 'fixtures/circle-36.yaml');

test('builds a puzzle HTML successfully', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-smoke-')), 'out.html');
  const r = spawnSync(process.execPath, [CLI, FIXTURE, '-o', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out), 'output file should exist');
});
