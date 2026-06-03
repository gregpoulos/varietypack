'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const vm       = require('vm');
const { loadPuzzle, validatePuzzle, composeThemeCss, getSharedBundle, defaultOutputPath, validateEntryStyles, processEntries, validateCommonHeader } = require('../build/builderUtils');

// ── getSharedBundle ───────────────────────────────────────────────────────────

test('getSharedBundle: exposes normalize, sha256hex, isCellCorrect, and the engine-chrome helpers as callable globals', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(getSharedBundle(), sandbox);
  assert.equal(typeof sandbox.normalize,     'function');
  assert.equal(typeof sandbox.sha256hex,     'function');
  assert.equal(typeof sandbox.isCellCorrect, 'function');
  assert.equal(sandbox.normalize('WAH-WAH'), 'wahwah');
  // engine-chrome.js is browser-only DOM logic, but the bundle must still define
  // its helpers as globals so each engine can call them by name.
  assert.equal(typeof sandbox.renderByline,      'function');
  assert.equal(typeof sandbox.renderInstructions,'function');
  assert.equal(typeof sandbox.setupClearButton,  'function');
  assert.equal(typeof sandbox.scrollByKey,       'function');
  assert.equal(typeof sandbox.storageKey,        'function');
  assert.equal(typeof sandbox.setupStorage,      'function');
  assert.equal(typeof sandbox.flashWrong,        'function');
});

// ── composeThemeCss ───────────────────────────────────────────────────────────

const COMPOSE_FIXTURE = path.join(__dirname, 'fixtures', 'compose');

// `color: inherit` is unique to print-base.css across the whole bundle, so it
// is a reliable position marker for the shared print layer.
const PRINT_BASE_MARKER = 'color: inherit';

test('composeThemeCss: broadsheet bundle stacks shared base, tokens, shared components, tool theme, shared print base, and tool print in cascade order', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'broadsheet');
  assert.ok(css.includes('box-sizing'),            'shared base missing');
  assert.ok(css.includes('--color-bg'),            'broadsheet tokens missing');
  assert.ok(css.includes('.style-circle'),         'shared broadsheet components missing');
  assert.ok(css.includes('.tool-broadsheet'),      'tool theme missing');
  assert.ok(css.includes(PRINT_BASE_MARKER),       'shared print base missing');
  assert.ok(css.includes('.tool-print'),           'tool print missing');
  // Shared broadsheet components precede the tool theme so a tool can override
  // them; print rules come last so @media print wins at equal specificity.
  assert.ok(css.indexOf('box-sizing')        < css.indexOf('.tool-base'));
  assert.ok(css.indexOf('.tool-base')        < css.indexOf('.style-circle'));
  assert.ok(css.indexOf('.style-circle')     < css.indexOf('.tool-broadsheet'));
  assert.ok(css.indexOf('.tool-broadsheet')  < css.indexOf(PRINT_BASE_MARKER));
  assert.ok(css.indexOf(PRINT_BASE_MARKER)   < css.indexOf('.tool-print'));
});

test('composeThemeCss: skeleton bundle omits broadsheet tokens and shared components but keeps shared base and print base', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'skeleton');
  assert.ok(!css.includes('--color-bg'),      'tokens should be absent for skeleton');
  assert.ok(!css.includes('.style-circle'),   'shared broadsheet components should be absent for skeleton');
  assert.ok(css.includes('.tool-skeleton'),   'tool skeleton theme missing');
  assert.ok(css.includes('box-sizing'),       'shared base should always be present');
  assert.ok(css.includes(PRINT_BASE_MARKER),  'shared print base should always be present');
});

// ── loadPuzzle ────────────────────────────────────────────────────────────────

test('loadPuzzle: parses a valid YAML file', () => {
  const tmp = path.join(os.tmpdir(), `builderutils-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmp, 'kind: test\ntitle: Hello\n');
  try {
    const result = loadPuzzle(tmp);
    assert.equal(result.kind, 'test');
    assert.equal(result.title, 'Hello');
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('loadPuzzle: throws on missing file', () => {
  assert.throws(() => loadPuzzle('/no/such/file.yaml'), /Cannot read file/);
});

test('loadPuzzle: throws on invalid YAML syntax', () => {
  const tmp = path.join(os.tmpdir(), `builderutils-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmp, 'key: {bad yaml\n');
  try {
    assert.throws(() => loadPuzzle(tmp), /YAML parse error/);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('loadPuzzle: throws when YAML content is not an object', () => {
  const tmp = path.join(os.tmpdir(), `builderutils-test-${Date.now()}.yaml`);
  fs.writeFileSync(tmp, '- just a list\n- not an object\n');
  try {
    assert.throws(() => loadPuzzle(tmp), /does not contain a valid YAML object/);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// ── validatePuzzle ────────────────────────────────────────────────────────────

const alwaysOk   = () => ({ errors: [], warnings: [] });
const withWarn   = () => ({ errors: [], warnings: ['something looks off'] });
const withErrors = () => ({ errors: ['bad field', 'missing key'], warnings: [] });

test('validatePuzzle: does not throw when validate returns no errors', () => {
  assert.doesNotThrow(() => validatePuzzle({}, 'test.yaml', alwaysOk));
});

test('validatePuzzle: throws with "Validation failed" on errors', () => {
  assert.throws(
    () => validatePuzzle({}, 'test.yaml', withErrors),
    /Validation failed for "test.yaml"/
  );
});

test('validatePuzzle: error message includes each error string', () => {
  let caught;
  try {
    validatePuzzle({}, 'test.yaml', withErrors);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, 'expected an error to be thrown');
  assert.ok(caught.message.includes('bad field'));
  assert.ok(caught.message.includes('missing key'));
});

test('validatePuzzle: does not throw for warnings-only result', () => {
  assert.doesNotThrow(() => validatePuzzle({}, 'test.yaml', withWarn));
});

test('validatePuzzle: writes warnings to stderr', () => {
  const written = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => written.push(s);
  try {
    validatePuzzle({}, 'test.yaml', withWarn);
  } finally {
    process.stderr.write = orig;
  }
  assert.ok(written.some(s => s.includes('something looks off')));
});

test('validatePuzzle: uses "puzzle" as label when sourcePath is null', () => {
  assert.throws(
    () => validatePuzzle({}, null, withErrors),
    /Validation failed for puzzle/
  );
});

// ── defaultOutputPath ─────────────────────────────────────────────────────────

test('defaultOutputPath: strips .yaml and appends .html', () => {
  assert.equal(defaultOutputPath('/some/dir/puzzle.yaml'), '/some/dir/puzzle.html');
});

test('defaultOutputPath: strips .yml and appends .html', () => {
  assert.equal(defaultOutputPath('/some/dir/puzzle.yml'), '/some/dir/puzzle.html');
});

test('defaultOutputPath: preserves directory', () => {
  assert.equal(defaultOutputPath('/a/b/c/test.yaml'), '/a/b/c/test.html');
});

test('defaultOutputPath: handles .yml in a flat path', () => {
  assert.equal(defaultOutputPath('mypuzzle.yml'), 'mypuzzle.html');
});

// ── validateEntryStyles ───────────────────────────────────────────────────────

function runStyles(entry, label = 'entries[0]', normLength = 4) {
  const errors = [], warnings = [];
  validateEntryStyles(entry, label, normLength, errors, warnings);
  return { errors, warnings };
}

test('validateEntryStyles: no-op when styles is undefined', () => {
  const { errors, warnings } = runStyles({ styles: undefined });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validateEntryStyles: no-op when styles is absent', () => {
  const { errors, warnings } = runStyles({});
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validateEntryStyles: error when styles is null', () => {
  const { errors } = runStyles({ styles: null });
  assert.ok(errors.some(e => e.includes('entries[0].styles must be an object')));
});

test('validateEntryStyles: error when styles is a string', () => {
  const { errors } = runStyles({ styles: 'circle' });
  assert.ok(errors.some(e => e.includes('entries[0].styles must be an object')));
});

test('validateEntryStyles: error when styles is an array', () => {
  const { errors } = runStyles({ styles: [0, 1] });
  assert.ok(errors.some(e => e.includes('entries[0].styles must be an object')));
});

test('validateEntryStyles: warning for unrecognized style name', () => {
  const { errors, warnings } = runStyles({ styles: { 'blue-shade': [0] } });
  assert.ok(warnings.some(w => w.includes('unrecognized style "blue-shade"')));
  assert.deepEqual(errors, []);
});

test('validateEntryStyles: error when style value is not an array', () => {
  const { errors } = runStyles({ styles: { circle: 0 } });
  assert.ok(errors.some(e => e.includes('circle') && e.includes('must be an array')));
});

test('validateEntryStyles: error when position is out of range', () => {
  const { errors } = runStyles({ styles: { circle: [4] } }, 'entries[0]', 4);
  assert.ok(errors.some(e => e.includes('position 4 is out of range (answer has 4 cells)')));
});

test('validateEntryStyles: error when position is negative', () => {
  const { errors } = runStyles({ styles: { circle: [-1] } });
  assert.ok(errors.some(e => e.includes('position -1 is out of range')));
});

test('validateEntryStyles: error when position is non-integer', () => {
  const { errors } = runStyles({ styles: { circle: [0.5] } });
  assert.ok(errors.some(e => e.includes('position 0.5 is out of range')));
});

test('validateEntryStyles: valid positions produce no errors', () => {
  const { errors, warnings } = runStyles({ styles: { circle: [0, 3] } }, 'entries[0]', 4);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validateEntryStyles: empty styles object produces no errors', () => {
  const { errors, warnings } = runStyles({ styles: {} });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('validateEntryStyles: multiple style names — known valid and unknown both processed', () => {
  const { errors, warnings } = runStyles({ styles: { circle: [0], 'blue-shade': [1] } }, 'entries[0]', 4);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some(w => w.includes('unrecognized style "blue-shade"')));
  assert.ok(!warnings.some(w => w.includes('circle')));
});

test('validateEntryStyles: entryLabel appears in all error messages', () => {
  const { errors } = runStyles({ styles: { circle: [99] } }, 'inward[2]', 4);
  assert.ok(errors.every(e => e.startsWith('inward[2]')));
});

// ── processEntries ────────────────────────────────────────────────────────────

test('processEntries: keeps clue, computes normalized length, carries _norm', () => {
  const out = processEntries([{ clue: 'Greeting', answer: 'WAH-WAH' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].clue, 'Greeting');
  assert.equal(out[0].length, 6);        // "wahwah"
  assert.equal(out[0]._norm, 'wahwah');
});

test('processEntries: strips spaces, hyphens, and punctuation before counting', () => {
  const out = processEntries([{ clue: 'c', answer: "DON'T" }]);
  assert.equal(out[0].length, 4);
  assert.equal(out[0]._norm, 'dont');
});

test('processEntries: passes styles through by value when present', () => {
  const styles = { circle: [0] };
  const out = processEntries([{ clue: 'c', answer: 'AB', styles }]);
  assert.deepEqual(out[0].styles, { circle: [0] });
});

test('processEntries: keeps an empty styles object (presence test, not truthiness)', () => {
  const out = processEntries([{ clue: 'c', answer: 'AB', styles: {} }]);
  assert.ok('styles' in out[0]);
  assert.deepEqual(out[0].styles, {});
});

test('processEntries: omits the styles key entirely when styles is undefined', () => {
  const out = processEntries([{ clue: 'c', answer: 'AB' }]);
  assert.ok(!('styles' in out[0]));
});

// ── validateCommonHeader ──────────────────────────────────────────────────────

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

test('validateCommonHeader: rejects a non-boolean hashed but accepts true/false/absent', () => {
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', hashed: 'yes' }).errors.some(e => e.includes('"hashed"')));
  assert.deepEqual(runHeader({ kind: 'spiral', title: 'Hi', hashed: true }).errors, []);
  assert.deepEqual(runHeader({ kind: 'spiral', title: 'Hi', hashed: false }).errors, []);
});

test('validateCommonHeader: rejects empty/whitespace/non-string instructions, accepts non-empty', () => {
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: '' }).errors.some(e => e.includes('"instructions"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: '   ' }).errors.some(e => e.includes('"instructions"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: 42 }).errors.some(e => e.includes('"instructions"')));
  assert.deepEqual(runHeader({ kind: 'spiral', title: 'Hi', instructions: 'Go' }).errors, []);
});
