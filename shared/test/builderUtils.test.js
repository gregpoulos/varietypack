'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const fs       = require('fs');
const os       = require('os');
const path     = require('path');
const vm       = require('vm');
const { loadPuzzle, validatePuzzle, composeThemeCss, buildFontCss, getSharedBundle, defaultOutputPath, validateEntryStyles, processEntries, validateCommonHeader, entryLength, entryNorm } = require('../build/builderUtils');
const { THEME_REGISTRY } = require('../build/themeRegistry');

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

// theme-base.css carries this sentinel comment so we can assert it loaded and
// ordered correctly without depending on a specific neutral value (tokens
// override the values, but never the comment).
const THEME_BASE_MARKER = 'theme-base: neutral defaults';

test('composeThemeCss: broadsheet bundle stacks base, tool base, theme-base, tokens, components, print base, tool print in cascade order', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'broadsheet');
  assert.ok(css.includes('box-sizing'),          'shared base missing');
  assert.ok(css.includes('.tool-base'),          'tool base missing');
  assert.ok(css.includes(THEME_BASE_MARKER),     'theme-base missing');
  assert.ok(css.includes('#f9f7f1'),             'broadsheet token value missing');
  assert.ok(css.includes('.cell.active-entry'),  'theme-components missing');
  assert.ok(css.includes(PRINT_BASE_MARKER),     'shared print base missing');
  assert.ok(css.includes('.tool-print'),         'tool print missing');
  // Order
  assert.ok(css.indexOf('box-sizing')         < css.indexOf('.tool-base'));
  assert.ok(css.indexOf('.tool-base')         < css.indexOf(THEME_BASE_MARKER));
  assert.ok(css.indexOf(THEME_BASE_MARKER)    < css.indexOf('#f9f7f1'));
  assert.ok(css.indexOf('#f9f7f1')            < css.indexOf('.cell.active-entry'));
  assert.ok(css.indexOf('.cell.active-entry') < css.indexOf(PRINT_BASE_MARKER));
  assert.ok(css.indexOf(PRINT_BASE_MARKER)    < css.indexOf('.tool-print'));
  // Skeleton's palette must not bleed into broadsheet
  assert.ok(!css.includes('#1a1520'),            'skeleton token value must be absent');
});

test('composeThemeCss: skeleton bundle uses skeleton tokens + shared neutral layer; no broadsheet palette', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'skeleton', 'embed');
  assert.ok(css.includes(THEME_BASE_MARKER),    'theme-base missing');
  assert.ok(css.includes('#1a1520'),            'skeleton token value missing');
  assert.ok(css.includes('.cell.active-entry'), 'theme-components missing');
  assert.ok(css.includes(PRINT_BASE_MARKER),    'shared print base missing');
  assert.ok(!css.includes('#f9f7f1'),           'broadsheet token value must be absent');
});

test('composeThemeCss: a registered token-only theme drops in with no per-tool CSS and no JS branch', () => {
  const themesDir = path.join(__dirname, '..', 'themes');
  const tokenPath = path.join(themesDir, 'dropintest-tokens.css');
  fs.writeFileSync(tokenPath, ':root { --theme-color-bg: #abcdef; }\n');
  THEME_REGISTRY.dropintest = { fonts: null };
  try {
    const css = composeThemeCss(COMPOSE_FIXTURE, 'dropintest');
    assert.ok(css.includes('#abcdef'),            'drop-in token value missing');
    assert.ok(css.includes(THEME_BASE_MARKER),    'theme-base missing');
    assert.ok(css.includes('.cell.active-entry'), 'theme-components missing');
    assert.ok(!css.includes('#f9f7f1'),           'broadsheet palette must not bleed');
    assert.ok(!css.includes('#1a1520'),           'skeleton palette must not bleed');
  } finally {
    fs.rmSync(tokenPath, { force: true });
    delete THEME_REGISTRY.dropintest;
  }
});

test('composeThemeCss: defaults to broadsheet when theme is omitted', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, undefined);
  assert.ok(css.includes('#f9f7f1'), 'broadsheet token value missing');
});

test('composeThemeCss: throws a clear error for an unregistered theme', () => {
  assert.throws(
    () => composeThemeCss(COMPOSE_FIXTURE, 'nonexistent'),
    /Unknown theme "nonexistent"\. Must be one of:/
  );
});

test('composeThemeCss: fontMode is ignored for system-font theme — output identical with or without it', () => {
  const cssWithEmbed   = composeThemeCss(COMPOSE_FIXTURE, 'broadsheet', 'embed');
  const cssWithoutMode = composeThemeCss(COMPOSE_FIXTURE, 'broadsheet');
  assert.equal(cssWithEmbed, cssWithoutMode);
});

test('composeThemeCss: throws for skeleton theme when fontMode is omitted', () => {
  assert.throws(
    () => composeThemeCss(COMPOSE_FIXTURE, 'skeleton'),
    /uses custom fonts.*--font embed or --font link/
  );
});

test('composeThemeCss: skeleton theme with embed mode includes @font-face and Outfit family', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'skeleton', 'embed');
  assert.ok(css.includes('@font-face'), 'should include @font-face block');
  assert.ok(css.includes('Outfit'),     'should reference Outfit family');
});

test('composeThemeCss: skeleton theme with link mode includes @import', () => {
  const css = composeThemeCss(COMPOSE_FIXTURE, 'skeleton', 'link');
  assert.ok(css.includes('@import'), 'should include @import rule');
  assert.ok(css.includes('fonts.googleapis.com'), 'should include Google Fonts CDN URL');
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

test('validateCommonHeader: rejects hashed: in source puzzles (no boardHash), accepts it in muddled', () => {
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', hashed: true }).errors.some(e => e.includes('"hashed:"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', hashed: false }).errors.some(e => e.includes('"hashed:"')));
  assert.deepEqual(runHeader({ kind: 'spiral', title: 'Hi', hashed: true, boardHash: 'abc' }).errors, []);
});

test('validateCommonHeader: rejects empty/whitespace/non-string instructions, accepts non-empty', () => {
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: '' }).errors.some(e => e.includes('"instructions"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: '   ' }).errors.some(e => e.includes('"instructions"')));
  assert.ok(runHeader({ kind: 'spiral', title: 'Hi', instructions: 42 }).errors.some(e => e.includes('"instructions"')));
  assert.deepEqual(runHeader({ kind: 'spiral', title: 'Hi', instructions: 'Go' }).errors, []);
});

// ── entryLength ───────────────────────────────────────────────────────────────

test('entryLength: normalizes answer and returns its length for an answer entry', () => {
  assert.equal(entryLength({ answer: 'WAH-WAH' }), 6);   // wahwah
  assert.equal(entryLength({ answer: 'AA' }),        2);
  assert.equal(entryLength({ answer: "DON'T" }),     4);
});

test('entryLength: returns entry.length directly for a hash+length entry', () => {
  assert.equal(entryLength({ hash: 'abc123', length: 5 }), 5);
  assert.equal(entryLength({ hash: 'xyz',    length: 1 }), 1);
});

test('entryLength: prefers answer over a stray length field (must agree with entryNorm)', () => {
  // A malformed entry carrying both must derive length from the answer, like entryNorm,
  // so the validator (answer-based) and hasher (entryLength-based) never disagree.
  assert.equal(entryLength({ answer: 'ABC', length: 99 }), 3);
});

// ── entryNorm ─────────────────────────────────────────────────────────────────

test('entryNorm: returns normalized answer for an answer entry', () => {
  assert.equal(entryNorm({ answer: 'WAH-WAH' }), 'wahwah');
  assert.equal(entryNorm({ answer: 'AA' }),       'aa');
});

test('entryNorm: returns null for a muddled entry (length only, no answer)', () => {
  assert.strictEqual(entryNorm({ length: 5 }), null);
});

// ── processEntries (muddled length path) ──────────────────────────────────────

test('processEntries: muddled entry — sets correct length, _norm is null, no hash', () => {
  const out = processEntries([{ clue: 'Test', length: 5 }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].clue,   'Test');
  assert.equal(out[0].length, 5);
  assert.strictEqual(out[0]._norm, null);
  assert.ok(!('answer' in out[0]));
  assert.ok(!('hash'   in out[0]));
});

test('processEntries: muddled entry — passes styles through when present', () => {
  const out = processEntries([{ clue: 'c', length: 3, styles: { circle: [0] } }]);
  assert.deepEqual(out[0].styles, { circle: [0] });
});

test('processEntries: muddled entry — omits styles key when absent', () => {
  const out = processEntries([{ clue: 'c', length: 3 }]);
  assert.ok(!('styles' in out[0]));
});

test('processEntries: source entry — no hash key in output', () => {
  const out = processEntries([{ clue: 'Greeting', answer: 'WAH-WAH' }]);
  assert.equal(out[0].length, 6);
  assert.equal(out[0]._norm,  'wahwah');
  assert.ok(!('hash' in out[0]));
});

// ── buildFontCss ──────────────────────────────────────────────────────────────

test('buildFontCss: returns empty string for system-font theme regardless of fontMode', () => {
  const entry = { fonts: null };
  assert.equal(buildFontCss('broadsheet', entry, 'embed'), '');
  assert.equal(buildFontCss('broadsheet', entry, 'link'),  '');
  assert.equal(buildFontCss('broadsheet', entry, undefined), '');
});

test('buildFontCss: returns empty string for unregistered theme entry', () => {
  assert.equal(buildFontCss('unknown', undefined, 'embed'), '');
});

test('buildFontCss: link mode returns @import with cdn url', () => {
  const entry = {
    fonts: { cdn: { source: 'google', url: 'https://fonts.googleapis.com/css2?family=Test' } }
  };
  const css = buildFontCss('testtheme', entry, 'link');
  assert.ok(css.startsWith('@import'));
  assert.ok(css.includes('https://fonts.googleapis.com/css2?family=Test'));
});

test('buildFontCss: link mode throws when no cdn declared', () => {
  const tmp = path.join(os.tmpdir(), `f-${Date.now()}.woff2`);
  fs.writeFileSync(tmp, Buffer.from([0]));
  try {
    const entry = { fonts: { faces: [{ family: 'F', weight: 400, style: 'normal', file: tmp }] } };
    assert.throws(() => buildFontCss('myfont', entry, 'link'), /has no CDN font source/);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: embed mode reads file and returns @font-face with base64 src', () => {
  const tmp = path.join(os.tmpdir(), `test-font-${Date.now()}.woff2`);
  const bytes = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01]);
  fs.writeFileSync(tmp, bytes);
  try {
    const entry = {
      fonts: { faces: [{ family: 'Test Font', weight: 400, style: 'normal', file: tmp }] }
    };
    const css = buildFontCss('testfont', entry, 'embed');
    assert.ok(css.includes("font-family: 'Test Font'"));
    assert.ok(css.includes('font-weight: 400'));
    assert.ok(css.includes('font-style: normal'));
    assert.ok(css.includes("format('woff2')"));
    assert.ok(css.includes('data:font/woff2;base64,'));
    assert.ok(css.includes(bytes.toString('base64')));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: embed mode throws when font file missing', () => {
  const entry = {
    fonts: { faces: [{ family: 'F', weight: 400, style: 'normal', file: '/no/such/font.woff2' }] }
  };
  assert.throws(() => buildFontCss('myfont', entry, 'embed'), /embed failed: file not found/);
});

test('buildFontCss: no fontMode throws listing both modes when both available', () => {
  const tmp = path.join(os.tmpdir(), `f-${Date.now()}.woff2`);
  fs.writeFileSync(tmp, Buffer.from([0]));
  try {
    const entry = {
      fonts: {
        faces: [{ family: 'F', weight: 400, style: 'normal', file: tmp }],
        cdn:   { source: 'google', url: 'https://example.com' }
      }
    };
    assert.throws(
      () => buildFontCss('myfont', entry, undefined),
      /uses custom fonts.*--font embed or --font link/
    );
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: no fontMode error lists only --font embed when cdn absent', () => {
  const tmp = path.join(os.tmpdir(), `f-${Date.now()}.woff2`);
  fs.writeFileSync(tmp, Buffer.from([0]));
  try {
    const entry = { fonts: { faces: [{ family: 'F', weight: 400, style: 'normal', file: tmp }] } };
    let msg = '';
    try { buildFontCss('myfont', entry, undefined); } catch (e) { msg = e.message; }
    assert.ok(msg.includes('--font embed'));
    assert.ok(!msg.includes('--font link'));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('buildFontCss: no fontMode error lists only --font link when faces absent', () => {
  const entry = { fonts: { cdn: { source: 'google', url: 'https://example.com' } } };
  let msg = '';
  try { buildFontCss('myfont', entry, undefined); } catch (e) { msg = e.message; }
  assert.ok(msg.includes('--font link'));
  assert.ok(!msg.includes('--font embed'));
});
