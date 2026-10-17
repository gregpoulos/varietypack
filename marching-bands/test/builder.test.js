'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');
const { buildPuzzle } = require('../cli');

// 5×5 puzzle YAML string
const SAMPLE_YAML = yaml.dump({
  kind: 'marching-bands', title: 'Builder Test', author: 'Test', date: '2026',
  rows: [
    { entries: [{ clue: 'A', answer: 'AB'  }, { clue: 'B', answer: 'CDE' }] },
    { entries: [{ clue: 'C', answer: 'FG'  }, { clue: 'D', answer: 'HIJ' }] },
    { entries: [{ clue: 'E', answer: 'KL'  }, { clue: 'F', answer: 'MN'  }] },
    { entries: [{ clue: 'G', answer: 'OPQ' }, { clue: 'H', answer: 'RS'  }] },
    { entries: [{ clue: 'I', answer: 'TU'  }, { clue: 'J', answer: 'VWX' }] },
  ],
  bands: [
    { entries: [
      { clue: 'K', answer: 'ABCDE' }, { clue: 'L', answer: 'JNSX' },
      { clue: 'M', answer: 'WVUT'  }, { clue: 'N', answer: 'OKF'  },
    ] },
    { entries: [
      { clue: 'O', answer: 'GHI' }, { clue: 'P', answer: 'MR' },
      { clue: 'Q', answer: 'QP'  }, { clue: 'R', answer: 'L'  },
    ] },
  ],
});

function withTmpFiles(fn) {
  const yaml_path = path.join(os.tmpdir(), `mb-test-${Date.now()}.yaml`);
  const html_path = yaml_path.replace('.yaml', '.html');
  try {
    fs.writeFileSync(yaml_path, SAMPLE_YAML);
    fn(yaml_path, html_path);
  } finally {
    fs.rmSync(yaml_path, { force: true });
    fs.rmSync(html_path, { force: true });
  }
}

test('buildPuzzle: --muddle HTML contains boardHash, no letters, no plaintext answers', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    buildPuzzle(yamlPath, htmlPath, { muddle: true });
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('"boardHash"'), 'boardHash missing in muddled HTML');
    assert.ok(!html.includes('"letters"'), 'letters should be absent in muddled HTML');
    assert.ok(!html.includes('"ab"'), 'plaintext answer found in muddled HTML');
  });
});

// "buildPuzzle returns { title }" is a pure composition of two facts each tested
// elsewhere: prepareCommon sets .title from the puzzle metadata ("prepareCommon: carries
// title, kind, author and date" in shared/test/prepare.test.js) and runBuildPuzzle
// returns { title: prepared.title } verbatim (shared/test/runBuildPuzzle.test.js), so no
// marching-bands-specific wiring can fail without one of those also failing.
