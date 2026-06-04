'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');
const { buildPuzzle } = require('../src/builder');

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

test('buildPuzzle: produces an HTML file', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    buildPuzzle(yamlPath, htmlPath);
    assert.ok(fs.existsSync(htmlPath));
  });
});

test('buildPuzzle: PUZZLE_DATA contains correct size', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    buildPuzzle(yamlPath, htmlPath);
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('"size": 5'), 'size not found in PUZZLE_DATA');
  });
});

test('buildPuzzle: PUZZLE_DATA contains rows and bands arrays', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    buildPuzzle(yamlPath, htmlPath);
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('"rows"'), 'rows not found');
    assert.ok(html.includes('"bands"'), 'bands not found');
  });
});

test('buildPuzzle: non-hashed HTML contains letters array', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    buildPuzzle(yamlPath, htmlPath);
    const html = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(html.includes('"letters"'), 'letters not found');
    assert.ok(!html.includes('"boardHash"'), 'boardHash should be absent');
  });
});

test('buildPuzzle: --muddle HTML contains boardHash, no letters, no plaintext answers', () => {
  const tmpY = path.join(os.tmpdir(), `mb-muddle-${Date.now()}.yaml`);
  const tmpH = tmpY.replace('.yaml', '.html');
  try {
    fs.writeFileSync(tmpY, yaml.dump({
      kind: 'marching-bands', title: 'Muddle Test',
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
    }));
    buildPuzzle(tmpY, tmpH, { muddle: true });
    const html = fs.readFileSync(tmpH, 'utf8');
    assert.ok(html.includes('"boardHash"'), 'boardHash missing in muddled HTML');
    assert.ok(!html.includes('"letters"'), 'letters should be absent in muddled HTML');
    assert.ok(!html.includes('"ab"'), 'plaintext answer found in muddled HTML');
  } finally {
    fs.rmSync(tmpY, { force: true });
    fs.rmSync(tmpH, { force: true });
  }
});

test('buildPuzzle: returns { title }', () => {
  withTmpFiles((yamlPath, htmlPath) => {
    const result = buildPuzzle(yamlPath, htmlPath);
    assert.equal(result.title, 'Builder Test');
  });
});
