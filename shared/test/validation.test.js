'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { validateCommonHeader, validateEmbedOrigin } = require('../build/validation');

function runHeader(puzzle, kind = 'spiral') {
  const errors = [];
  const ok = validateCommonHeader(puzzle, kind, errors);
  return { ok, errors };
}

test('validateCommonHeader: returns false and reports a non-object puzzle', () => {
  const { ok, errors } = runHeader(null);
  assert.equal(ok, false);
  assert.ok(errors.some(e => e.includes('must be a YAML object')));
});

test('validateCommonHeader: returns true and reports nothing for a valid header', () => {
  const { ok, errors } = runHeader({ kind: 'spiral', title: 'Hi' });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test('validateCommonHeader: reports a kind mismatch, naming the expected kind', () => {
  const { errors } = runHeader({ kind: 'wrong', title: 'Hi' }, 'spiral');
  assert.ok(errors.some(e => e.includes('"kind"') && e.includes('spiral')));
});

test('validateCommonHeader: reports a missing or empty title', () => {
  assert.ok(runHeader({ kind: 'spiral', title: '' }).errors.some(e => e.includes('"title"')));
  assert.ok(runHeader({ kind: 'spiral' }).errors.some(e => e.includes('"title"')));
});

test('validateCommonHeader: rejects hashed: in source puzzles (no boardHash), accepts it in muddled', () => {
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', hashed: true }).errors.some(e => e.includes('"hashed:"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', hashed: false }).errors.some(e => e.includes('"hashed:"')));
  assert.deepEqual(runHeader({ kind: 'spiral', title: 'Hi', hashed: true, format: 2, boardHash: 'abc' }).errors, []);
});

test('validateCommonHeader: rejects empty/whitespace/non-string instructions, accepts non-empty', () => {
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: '' }).errors.some(e => e.includes('"instructions"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: '   ' }).errors.some(e => e.includes('"instructions"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: 42 }).errors.some(e => e.includes('"instructions"')));
  assert.deepEqual(runHeader({ kind: 'spiral', title: 'Hi', instructions: 'Go' }).errors, []);
});

test('validateCommonHeader: format: is rejected in a source puzzle', () => {
  const { errors } = runHeader({ kind: 'spiral', title: 'T', format: 2 });
  assert.ok(errors.some(e => /format/.test(e) && /source/.test(e)));
});

test('validateCommonHeader: a muddled puzzle without format: 2 is rejected', () => {
  const { errors } = runHeader({ kind: 'spiral', title: 'T', hashed: true, boardHash: 'abc' });
  assert.ok(errors.some(e => /varietypack muddle/.test(e)));
});

test('validateCommonHeader: accepts a registered theme', () => {
  const { errors } = runHeader({ kind: 'spiral', title: 'T', theme: 'skeleton' });
  assert.deepStrictEqual(errors, []);
});

test('validateCommonHeader: rejects an unregistered theme, listing the allowed ones', () => {
  const { errors } = runHeader({ kind: 'spiral', title: 'T', theme: 'neon' });
  assert.ok(errors.some(e => /"theme" must be one of: broadsheet, skeleton, got: "neon"/.test(e)), errors.join('|'));
});

test('validateEmbedOrigin: accepts origins', () => {
  assert.equal(validateEmbedOrigin('https://example.com'), null);
  assert.equal(validateEmbedOrigin('http://127.0.0.1:8080'), null);
});

test('validateEmbedOrigin: rejects non-origins', () => {
  for (const bad of ['https://example.com/', 'https://a.com/path', 'example.com', 'ftp://x.com']) {
    assert.match(validateEmbedOrigin(bad), /must be an origin like/, bad);
  }
});

test('validateEmbedOrigin: for a URL that has an origin, says what to write instead', () => {
  const cases = [
    ['https://a.com/path',    'https://a.com'],
    ['https://example.com/',  'https://example.com'],
    ['HTTPS://Example.COM',   'https://example.com'],
    ['https://example.com:443', 'https://example.com'],
    ['http://localhost:8080/x', 'http://localhost:8080'],
  ];
  for (const [bad, fix] of cases) {
    assert.match(validateEmbedOrigin(bad), new RegExp(`did you mean ${fix}\\?`), bad);
  }
});

test('validateEmbedOrigin: offers no correction when the value is no http(s) URL', () => {
  for (const bad of ['example.com', 'ftp://x.com', '']) {
    assert.doesNotMatch(validateEmbedOrigin(bad), /did you mean/, bad);
  }
});

test('validateCommonHeader: a valid themeTokens override passes', () => {
  const { errors } = runHeader({ kind: 'spiral', title: 'T', themeTokens: { 'color-bg': '#abc123', 'font-body': 'Georgia, serif' } });
  assert.deepEqual(errors, []);
});

test('validateCommonHeader: themeTokens must be a map, with known token names', () => {
  for (const bad of [[], 'x', 5]) {
    assert.ok(runHeader({ kind: 'spiral', title: 'T', themeTokens: bad }).errors.includes('"themeTokens" must be a map of token names to values'), JSON.stringify(bad));
  }
  assert.ok(runHeader({ kind: 'spiral', title: 'T', themeTokens: { nope: '#fff' } }).errors
    .includes('"themeTokens" has unknown token "nope" (see docs/AUTHORING.md for the list)'));
});

test('validateCommonHeader: themeTokens values that could break out of the declaration are rejected', () => {
  for (const bad of ['red; background: blue', 'red}', 'url(http://x/y.png)', 'URL (x)', '@import "x"', '<b>', 'a\\b', 'red /*', 'red "', "it's", 'rgb(1,2', 'a)', 'calc(1px', 'x[1]', 'image-set("x" 1x)', ' ', '', 5, 'x'.repeat(201)]) {
    assert.ok(runHeader({ kind: 'spiral', title: 'T', themeTokens: { 'color-bg': bad } }).errors
      .includes('"themeTokens.color-bg" has an unsafe value'), JSON.stringify(bad));
  }
});

test('validateCommonHeader: balanced quotes, parentheses and var()/rgb() values are allowed', () => {
  const { errors } = runHeader({ kind: 'spiral', title: 'T', themeTokens: {
    'font-body': '"Georgia\'s Pro", serif', 'font-display': "'Times New Roman', \"x)\"", 'color-bg': 'rgb(1, 2, 3)', 'color-text': 'var(--theme-color-muted)', 'card-radius': 'calc(2px + 1px)' } });
  assert.deepEqual(errors, []);
});
