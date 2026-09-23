'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeHelpIfRequested } = require('../build/globalHelp');

function call(args) {
  let out = '';
  const code = writeHelpIfRequested(args, 'HELP TEXT', { write: (s) => { out += s; } });
  return { code, out };
}

test('writeHelpIfRequested: no args writes help and returns 1', () => {
  assert.deepEqual(call([]), { code: 1, out: 'HELP TEXT' });
});

for (const flag of ['--help', '-h']) {
  test(`writeHelpIfRequested: ${flag} writes help and returns 0`, () => {
    assert.deepEqual(call([flag, 'ignored']), { code: 0, out: 'HELP TEXT' });
  });
}

test('writeHelpIfRequested: other args write nothing and return null', () => {
  assert.deepEqual(call(['puzzle.yaml', '--help']), { code: null, out: '' });
});
