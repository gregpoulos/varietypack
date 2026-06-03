'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const parseCliArgs = require('../build/parseCliArgs');

// ── basic positionals ─────────────────────────────────────────────────────────

test('parseCliArgs: returns positional args when no flags defined', () => {
  const { flags, positionals } = parseCliArgs(['foo.yaml'], []);
  assert.deepEqual(flags, {});
  assert.deepEqual(positionals, ['foo.yaml']);
});

test('parseCliArgs: returns empty positionals when args is empty', () => {
  const { flags, positionals } = parseCliArgs([], []);
  assert.deepEqual(flags, {});
  assert.deepEqual(positionals, []);
});

// ── flag with value ───────────────────────────────────────────────────────────

test('parseCliArgs: captures value for a named flag', () => {
  const specs = [{ flag: '-o', name: 'output' }];
  const { flags } = parseCliArgs(['-o', 'out.html'], specs);
  assert.equal(flags.output, 'out.html');
});

test('parseCliArgs: flag is undefined when not present', () => {
  const specs = [{ flag: '-o', name: 'output' }];
  const { flags } = parseCliArgs(['foo.yaml'], specs);
  assert.equal(flags.output, undefined);
});

test('parseCliArgs: flag value is not included in positionals', () => {
  const specs = [{ flag: '-o', name: 'output' }];
  const { positionals } = parseCliArgs(['foo.yaml', '-o', 'out.html'], specs);
  assert.deepEqual(positionals, ['foo.yaml']);
});

test('parseCliArgs: flag before positional is parsed correctly', () => {
  const specs = [{ flag: '-o', name: 'output' }];
  const { flags, positionals } = parseCliArgs(['-o', 'out.html', 'foo.yaml'], specs);
  assert.equal(flags.output, 'out.html');
  assert.deepEqual(positionals, ['foo.yaml']);
});

// ── dangling flag (missing value) ─────────────────────────────────────────────

test('parseCliArgs: throws when flag appears as last arg with no value', () => {
  const specs = [{ flag: '-o', name: 'output' }];
  assert.throws(
    () => parseCliArgs(['-o'], specs),
    { message: 'Error: -o requires a value.' }
  );
});

test('parseCliArgs: throws when long flag appears as last arg with no value', () => {
  const specs = [{ flag: '--shape', name: 'shape' }];
  assert.throws(
    () => parseCliArgs(['puzzle.yaml', '--shape'], specs),
    { message: 'Error: --shape requires a value.' }
  );
});

// ── allowlist validation ──────────────────────────────────────────────────────

test('parseCliArgs: accepts flag value when it is in the allowlist', () => {
  const specs = [{ flag: '--shape', name: 'shape', values: ['circle', 'stadium'] }];
  const { flags } = parseCliArgs(['--shape', 'circle'], specs);
  assert.equal(flags.shape, 'circle');
});

test('parseCliArgs: throws for flag value not in allowlist (two options)', () => {
  const specs = [{ flag: '--shape', name: 'shape', values: ['circle', 'stadium'] }];
  assert.throws(
    () => parseCliArgs(['--shape', 'spiral'], specs),
    { message: 'Invalid --shape value "spiral". Must be "circle" or "stadium".' }
  );
});

test('parseCliArgs: throws for flag value not in allowlist (four options)', () => {
  const specs = [{ flag: '--shape', name: 'shape', values: ['circle', 'stadium', 'turn', 'double-turn'] }];
  assert.throws(
    () => parseCliArgs(['--shape', 'bad'], specs),
    { message: 'Invalid --shape value "bad". Must be "circle", "stadium", "turn", or "double-turn".' }
  );
});

// ── unknown flags ─────────────────────────────────────────────────────────────

test('parseCliArgs: throws on unrecognized flag', () => {
  const specs = [{ flag: '-o', name: 'output' }];
  assert.throws(
    () => parseCliArgs(['--typo', 'puzzle.yaml'], specs),
    { message: 'Error: unknown flag --typo.' }
  );
});

test('parseCliArgs: throws on unrecognized flag even when known flags are present', () => {
  const specs = [{ flag: '-o', name: 'output' }];
  assert.throws(
    () => parseCliArgs(['-o', 'out.html', '--oops', 'puzzle.yaml'], specs),
    { message: 'Error: unknown flag --oops.' }
  );
});

// ── boolean flags ─────────────────────────────────────────────────────────────

test('parseCliArgs: boolean flag present returns true', () => {
  const specs = [{ flag: '--force', name: 'force', boolean: true }];
  const { flags } = parseCliArgs(['--force'], specs);
  assert.equal(flags.force, true);
});

test('parseCliArgs: boolean flag absent returns undefined', () => {
  const specs = [{ flag: '--force', name: 'force', boolean: true }];
  const { flags } = parseCliArgs(['foo.yaml'], specs);
  assert.equal(flags.force, undefined);
});

test('parseCliArgs: boolean flag is not included in positionals', () => {
  const specs = [{ flag: '--force', name: 'force', boolean: true }];
  const { positionals } = parseCliArgs(['foo.yaml', '--force'], specs);
  assert.deepEqual(positionals, ['foo.yaml']);
});

// ── array aliases ─────────────────────────────────────────────────────────────

test('parseCliArgs: first alias sets the flag', () => {
  const specs = [{ flag: ['-f', '--force'], name: 'force', boolean: true }];
  const { flags } = parseCliArgs(['-f'], specs);
  assert.equal(flags.force, true);
});

test('parseCliArgs: second alias sets the flag', () => {
  const specs = [{ flag: ['-f', '--force'], name: 'force', boolean: true }];
  const { flags } = parseCliArgs(['--force'], specs);
  assert.equal(flags.force, true);
});

test('parseCliArgs: neither alias leaves flag undefined', () => {
  const specs = [{ flag: ['-f', '--force'], name: 'force', boolean: true }];
  const { flags } = parseCliArgs(['foo.yaml'], specs);
  assert.equal(flags.force, undefined);
});

test('parseCliArgs: both aliases together are both consumed', () => {
  const specs = [{ flag: ['-f', '--force'], name: 'force', boolean: true }];
  const { flags, positionals } = parseCliArgs(['-f', 'foo.yaml', '--force'], specs);
  assert.equal(flags.force, true);
  assert.deepEqual(positionals, ['foo.yaml']);
});

test('parseCliArgs: non-boolean alias value slot does not leak into positionals', () => {
  // If both --out and -o appear for the same non-boolean spec, neither value
  // should surface as a positional.
  const specs = [{ flag: ['--out', '-o'], name: 'output' }];
  const { flags, positionals } = parseCliArgs(['--out', 'a.html', 'foo.yaml', '-o', 'b.html'], specs);
  assert.equal(flags.output, 'a.html'); // first alias wins
  assert.deepEqual(positionals, ['foo.yaml']); // 'b.html' must not leak
});

// ── multiple flags ────────────────────────────────────────────────────────────

test('parseCliArgs: handles multiple flags and a positional together', () => {
  const specs = [
    { flag: '-o',      name: 'output' },
    { flag: '--shape', name: 'shape',  values: ['circle', 'stadium'] },
    { flag: '--theme', name: 'theme',  values: ['broadsheet', 'skeleton'] },
  ];
  const { flags, positionals } = parseCliArgs(
    ['--shape', 'circle', 'puzzle.yaml', '-o', 'out.html', '--theme', 'broadsheet'],
    specs
  );
  assert.equal(flags.output, 'out.html');
  assert.equal(flags.shape, 'circle');
  assert.equal(flags.theme, 'broadsheet');
  assert.deepEqual(positionals, ['puzzle.yaml']);
});
