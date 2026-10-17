'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');
const { buildPuzzle } = require('../cli');

// 5x5 grid, one crossing rebus cell at (0,1): across[5]="E[TH]FGH" pos1,
// down[2]="B[TH]JO" pos1.
const SAMPLE_YAML = yaml.dump({
  kind: 'crushword', title: 'Builder Test', author: 'Test', date: '2026',
  grid: ['...#.', '.....', '.....', '.....', '.#...'],
  across: {
    1: { clue: 'a1', answer: 'ABC' },
    5: { clue: 'a5', answer: 'E[TH]FGH' },
    7: { clue: 'a7', answer: 'IJK[ING]L' },
    8: { clue: 'a8', answer: 'MNOPQ' },
    9: { clue: 'a9', answer: 'STU' },
  },
  down: {
    1: { clue: 'd1', answer: 'AEIMR' },
    2: { clue: 'd2', answer: 'B[TH]JN' },
    3: { clue: 'd3', answer: 'CFKOS' },
    4: { clue: 'd4', answer: 'DHLQU' },
    6: { clue: 'd6', answer: 'G[ING]PT' },
  },
});

function withTmpFiles(fn) {
  const yamlPath = path.join(os.tmpdir(), `cw-test-${Date.now()}.yaml`);
  const htmlPath = yamlPath.replace('.yaml', '.html');
  try {
    fs.writeFileSync(yamlPath, SAMPLE_YAML);
    fn(yamlPath, htmlPath);
  } finally {
    fs.rmSync(yamlPath, { force: true });
    fs.rmSync(htmlPath, { force: true });
  }
}

test('buildPuzzle: PUZZLE_DATA contains maxCellLetters (defaulted to 3)', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    buildPuzzle(yamlPath, htmlPath);
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('"maxCellLetters": 3'));
  });
});

test('buildPuzzle: --muddle HTML contains boardHash, no letters, no plaintext answers', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    buildPuzzle(yamlPath, htmlPath, { muddle: true });
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('"boardHash"'));
    assert.ok(!html.includes('"letters"'));
    assert.ok(!html.includes('"abc"'));
  });
});

// "buildPuzzle returns { title }" is a pure composition of two facts each tested
// elsewhere: prepareCommon sets .title from the puzzle metadata ("prepareCommon: carries
// title, kind, author and date" in shared/test/prepare.test.js) and runBuildPuzzle
// returns { title: prepared.title } verbatim (shared/test/runBuildPuzzle.test.js), so no
// crushword-specific wiring can fail without one of those also failing.
