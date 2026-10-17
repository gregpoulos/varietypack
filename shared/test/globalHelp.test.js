'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { writeHelpIfRequested } = require('../cli/globalHelp');

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

// ── formatOptionsHelp ─────────────────────────────────────────────────────────

const { formatOptionsHelp, GLOBAL_OPTIONS, GLOBAL_OPTIONS_HELP } = require('../cli/globalHelp');

test('formatOptionsHelp: one line per option, flags and <arg> before the description', () => {
  const lines = formatOptionsHelp({
    force: { type: 'boolean', short: 'f', description: 'Overwrite' },
    theme: { type: 'string', arg: 'name', description: 'Visual theme' },
  }).split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^ {2}-f, --force +Overwrite$/);
  assert.match(lines[1], /^ {2}--theme <name> +Visual theme$/);
});

test('formatOptionsHelp: descriptions start in one column', () => {
  const lines = formatOptionsHelp({
    output: { type: 'string', short: 'o', arg: 'file', description: 'Output path' },
    minify: { type: 'boolean', description: 'Minify' },
  }).split('\n');
  assert.equal(lines[0].indexOf('Output path'), lines[1].indexOf('Minify'));
});

test('formatOptionsHelp: a label wider than the column is still separated from its description', () => {
  const line = formatOptionsHelp({ 'embed-origin': { type: 'string', arg: 'origin', description: 'Post solves' } });
  assert.match(line, /--embed-origin <origin> {2}Post solves$/);
});

test('formatOptionsHelp: later lines of a multi-line description continue under the description column', () => {
  const lines = formatOptionsHelp({ shape: { type: 'string', arg: 'name', description: 'Ring shape\nDefault: auto' } }).split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1].indexOf('Default'), lines[0].indexOf('Ring shape'));
  assert.match(lines[1], /^ +Default: auto$/);
});

test('formatOptionsHelp: an option without a description is a bug, not an "undefined" line', () => {
  assert.throws(() => formatOptionsHelp({ x: { type: 'boolean' } }), /--x.*description/);
});

test('GLOBAL_OPTIONS_HELP lists every global option, plus -h/--help', () => {
  for (const [name, option] of Object.entries(GLOBAL_OPTIONS)) {
    assert.match(GLOBAL_OPTIONS_HELP, new RegExp(`--${name}\\b`), name);
    if (option.short) assert.match(GLOBAL_OPTIONS_HELP, new RegExp(`-${option.short}, --${name}\\b`), name);
  }
  assert.match(GLOBAL_OPTIONS_HELP, /-h, --help +Show this help/);
});

test('GLOBAL_OPTIONS_HELP documents --output as the long form of -o', () => {
  assert.match(GLOBAL_OPTIONS_HELP, /^ {2}-o, --output <file> +Output path/m);
});
