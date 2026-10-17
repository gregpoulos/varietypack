'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { buildFromObject } = require('../build/buildFromObject');

// buildFromObject is tool-agnostic scaffolding (validate → hashed computation → prepareFn
// → buildHtmlFn). These tests exercise it directly with minimal stub hooks instead of
// through a real tool's builder, so the behavior is covered once rather than once per
// tool — see root CLAUDE.md's builder `hashed` pattern note.

const alwaysOk = () => ({ errors: [], warnings: [] });

// Stub prepareFn: passes the puzzle through, defaulting a title.
const stubPrepare = (rawPuzzle) => ({ ...rawPuzzle, title: rawPuzzle.title || 'Untitled' });

// Stub buildHtmlFn: doesn't need real markup, just something to write to disk.
const stubBuildHtml = (prepared) => `<html><!-- ${prepared.title} --></html>`;

const hooks = (over = {}) => ({ validateFn: alwaysOk, prepareFn: stubPrepare, buildHtmlFn: stubBuildHtml, ...over });

test('buildFromObject: returns html, title, warnings and notes', () => {
  const result = buildFromObject({ kind: 'stub', title: 'T' }, {}, hooks({
    validateFn: () => ({ errors: [], warnings: ['w1'] }),
    buildHtmlFn: (prepared, raw, opts, notes) => { notes.push('n1'); return '<html></html>'; },
  }));
  assert.deepEqual(result, { html: '<html></html>', title: 'T', warnings: ['w1'], notes: ['n1'] });
});

test('buildFromObject: computes hashed=true from options.muddle', () => {
  let seen;
  buildFromObject({ kind: 'stub', title: 'T' }, { muddle: true }, hooks({
    prepareFn: (raw) => { seen = raw.hashed; return stubPrepare(raw); },
  }));
  assert.equal(seen, true);
});

test('buildFromObject: computes hashed=true for a muddled input (boardHash present)', () => {
  let seen;
  buildFromObject({ kind: 'stub', title: 'T', boardHash: 'deadbeef' }, {}, hooks({
    prepareFn: (raw) => { seen = raw.hashed; return stubPrepare(raw); },
  }));
  assert.equal(seen, true);
});

test('buildFromObject: passes the pre-prepare rawPuzzle to buildHtmlFn', () => {
  const { html } = buildFromObject({ kind: 'stub', title: 'T', shape: 'stadium' }, {}, hooks({
    buildHtmlFn: (prepared, raw) => `<html>${raw.shape}</html>`,
  }));
  assert.equal(html, '<html>stadium</html>');
});

test('buildFromObject: throws with errors and warnings attached', () => {
  assert.throws(
    () => buildFromObject({ kind: 'stub' }, {}, hooks({ validateFn: () => ({ errors: ['e1'], warnings: ['w1'] }) })),
    (err) => {
      assert.match(err.message, /^Validation failed for puzzle:\n {2}• e1$/);
      assert.deepEqual(err.errors, ['e1']);
      assert.deepEqual(err.warnings, ['w1']);
      return true;
    },
  );
});

test('buildFromObject: uses ctx.label in the error message', () => {
  assert.throws(
    () => buildFromObject({ kind: 'stub' }, {}, hooks({ validateFn: () => ({ errors: ['e'], warnings: [] }) }), { label: '"x.yaml"' }),
    /Validation failed for "x\.yaml":/,
  );
});

test('buildFromObject: uses the YAML theme when options.theme is absent', () => {
  let seen;
  buildFromObject({ kind: 'stub', title: 'T', theme: 'skeleton' }, {}, hooks({
    buildHtmlFn: (prepared, raw, opts) => { seen = opts.theme; return '<html></html>'; },
  }));
  assert.equal(seen, 'skeleton');
});

test('buildFromObject: options.theme overrides the YAML theme', () => {
  let seen;
  buildFromObject({ kind: 'stub', title: 'T', theme: 'skeleton' }, { theme: 'broadsheet' }, hooks({
    buildHtmlFn: (prepared, raw, opts) => { seen = opts.theme; return '<html></html>'; },
  }));
  assert.equal(seen, 'broadsheet');
});

test('buildFromObject: passes embedOrigin to buildHtmlFn via prepared', () => {
  let seen;
  buildFromObject({ title: 'T' }, { embedOrigin: 'https://h.example', muddle: true },
    { validateFn: alwaysOk, prepareFn: stubPrepare, buildHtmlFn: (prepared) => { seen = prepared.embedOrigin; return '<html></html>'; } });
  assert.equal(seen, 'https://h.example');
});

test('buildFromObject: rejects an invalid embedOrigin', () => {
  assert.throws(() => buildFromObject({ title: 'T' }, { embedOrigin: 'https://a.com/path' },
    { validateFn: alwaysOk, prepareFn: stubPrepare, buildHtmlFn: stubBuildHtml }), /must be an origin like/);
});

test('buildFromObject: hands its options to validateFn', () => {
  let seen;
  const options = { shape: 'turn' };
  buildFromObject({ title: 'T' }, options,
    { validateFn: (p, o) => { seen = o; return { errors: [], warnings: [] }; }, prepareFn: stubPrepare, buildHtmlFn: stubBuildHtml });
  assert.equal(seen, options);
});

test('buildFromObject: an invalid embedOrigin is a validation error, reported with the puzzle\'s own and before any prepare', () => {
  let prepared = false;
  const hooks = {
    validateFn: () => ({ errors: ['title is required'], warnings: ['w'] }),
    prepareFn: (p) => { prepared = true; return stubPrepare(p); },
    buildHtmlFn: stubBuildHtml,
  };
  let caught;
  try { buildFromObject({}, { embedOrigin: 'https://a.com/path' }, hooks, { label: 'x.yaml' }); } catch (e) { caught = e; }
  assert.equal(caught.errors.length, 2);
  assert.equal(caught.errors[0], 'title is required');
  assert.match(caught.errors[1], /must be an origin like/);
  assert.deepEqual(caught.warnings, ['w']);
  assert.match(caught.message, /^Validation failed for x\.yaml:/);
  assert.equal(prepared, false);
});

// The flags arrive unchecked from the CLI (parseCliArgs allowlists no values); a bad
// one is reported in the puzzle's own error list, before anything is built.
test('buildFromObject: an unknown --theme or --font is a validation error beside the puzzle\'s own', () => {
  const failing = hooks({ validateFn: () => ({ errors: ['e1'], warnings: [] }) });
  for (const [options, message] of [
    [{ theme: 'toString' }, '--theme must be one of: broadsheet, skeleton, got "toString"'],
    [{ font: 'bogus' }, '--font must be "embed" or "link", got "bogus"'],
  ]) {
    let caught;
    try { buildFromObject({ title: 'T' }, options, failing); } catch (e) { caught = e; }
    assert.deepEqual(caught?.errors, ['e1', message]);
  }
});

test('buildFromObject: a known --theme and --font are no error', () => {
  assert.doesNotThrow(() => buildFromObject({ title: 'T' }, { theme: 'skeleton', font: 'link' }, hooks()));
});

test('buildFromObject: notes that embedOrigin on a plain build proves nothing, and not on a hashed one', () => {
  const hooks = { validateFn: alwaysOk, prepareFn: stubPrepare, buildHtmlFn: stubBuildHtml };
  const plain = buildFromObject({ title: 'T' }, { embedOrigin: 'https://h.example' }, hooks);
  assert.ok(plain.notes.some(n => /proves nothing/.test(n)), plain.notes.join('|'));
  const hashed = buildFromObject({ title: 'T' }, { embedOrigin: 'https://h.example', muddle: true }, hooks);
  assert.ok(!hashed.notes.some(n => /proves nothing/.test(n)));
  assert.deepEqual(buildFromObject({ title: 'T' }, {}, hooks).notes, []);
});

test('buildFromObject: passes the puzzle\'s themeTokens to buildHtmlFn through the options', () => {
  let seen;
  buildFromObject({ title: 'T', themeTokens: { 'color-bg': '#abc123' } }, {},
    { validateFn: alwaysOk, prepareFn: stubPrepare, buildHtmlFn: (p, raw, opts) => { seen = opts.themeTokens; return '<html></html>'; } });
  assert.deepEqual(seen, { 'color-bg': '#abc123' });
});
