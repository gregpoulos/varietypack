'use strict';

// parseCliArgs is util.parseArgs plus a positional cap. Node's own parsing isn't
// re-tested here, only what this wrapper adds and the one property of how it
// calls Node that a past bug depended on (strict mode).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const parseCliArgs = require('../cli/parseCliArgs');

const OPTIONS = {
  output: { type: 'string', short: 'o' },
  minify: { type: 'boolean' },
};

test('parseCliArgs: returns util.parseArgs values and positionals', () => {
  const { values, positionals } = parseCliArgs(['in.yaml', '-o', 'out.html', '--minify'], OPTIONS);
  assert.equal(values.output, 'out.html');
  assert.equal(values.minify, true);
  assert.deepEqual(positionals, ['in.yaml']);
});

test('parseCliArgs: a flag in a value slot is not taken as the value', () => {
  // `-o --minify` once set output to "--minify" *and* minify to true.
  assert.throws(() => parseCliArgs(['in.yaml', '-o', '--minify'], OPTIONS), /'-o'.*ambiguous/);
});

test('parseCliArgs: maxPositionals rejects an argument past the limit', () => {
  assert.throws(
    () => parseCliArgs(['a.yaml', 'b.yaml'], OPTIONS, { maxPositionals: 1 }),
    { message: "Unexpected argument 'b.yaml'." }
  );
});

test('parseCliArgs: maxPositionals 0 rejects any positional', () => {
  assert.throws(() => parseCliArgs(['a.yaml'], OPTIONS, { maxPositionals: 0 }), /Unexpected argument 'a\.yaml'/);
});

test('parseCliArgs: positionals are unlimited without maxPositionals', () => {
  assert.deepEqual(parseCliArgs(['a.yaml', 'b.yaml', 'c.yaml'], OPTIONS).positionals, ['a.yaml', 'b.yaml', 'c.yaml']);
});
