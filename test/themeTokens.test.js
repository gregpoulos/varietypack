'use strict';

// themeTokens: the puzzle field reaches every tool's built page (each builder forwards
// it).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const { buildFromObject } = require('../shared/build/buildFromObject');
const { KINDS, hooksFor } = require('../shared/build/tools');

const FIXTURE = {
  'snake-charmer':  'snake-charmer/test/fixtures/circle-36.yaml',
  'spiral':         'spiral/test/fixtures/test-100.yaml',
  'marching-bands': 'marching-bands/test/fixtures/mb-12.yaml',
  'crushword':      'crushword/test/fixtures/cw-9.yaml',
};

for (const kind of KINDS) {
  test(`${kind}: themeTokens land in the built page's CSS, and are absent without the field`, () => {
    const hooks = hooksFor(kind);
    const puzzle = yaml.load(fs.readFileSync(path.join(__dirname, '..', FIXTURE[kind]), 'utf8'));
    const withTokens = buildFromObject({ ...puzzle, themeTokens: { 'color-bg': '#abc123' } }, {}, hooks).html;
    assert.ok(withTokens.includes('--theme-color-bg: #abc123;'));
    assert.ok(!buildFromObject(puzzle, {}, hooks).html.includes('#abc123'));
  });
}
