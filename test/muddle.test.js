'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const path  = require('node:path');
const fs    = require('node:fs');
const os    = require('node:os');

const { main } = require('../cli');

const SC_FIXTURE = path.resolve(__dirname, '..', 'snake-charmer/test/fixtures/circle-8.yaml');

// In-process invocation of the dispatcher's pure main(). muddle/validate/build
// (single-file) never spawn a subprocess internally, so this fully replaces
// the previous spawnSync-based coverage for these commands.
function run(...args) {
  let out = '';
  let err = '';
  const status = main(args, {
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
  });
  return { status, stdout: out, stderr: err };
}
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-muddle-cmd-test-'));
}

// ── help ───────────────────────────────────────────────────────────────────────
//
// No-args / -h / --help semantics live once in shared/test/globalHelp.test.js;
// this only pins that muddleCommand is wired to that helper. Its -f/--force
// check, by contrast, is its own (parseCliArgs, not buildOneFile), so the
// overwrite tests below are not duplicates of shared/test/buildOneFile.test.js.

test('muddle: --help exits 0 and shows usage', () => {
  const r = run('muddle', '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Produce a muddled YAML/);
});

// ── success path ──────────────────────────────────────────────────────────────

test('muddle: -o redirects output to specified path', () => {
  const dir     = tmpDir();
  const input   = path.join(dir, 'circle-8.yaml');
  const outPath = path.join(dir, 'custom-output.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const r = run('muddle', input, '-o', outPath);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(outPath), 'custom output path not created');
  assert.ok(!fs.existsSync(path.join(dir, 'circle-8.muddled.yaml')), 'default output should not exist');
});

test('muddle: -f overwrites existing output', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  run('muddle', input);          // first run
  const r = run('muddle', input, '-f');  // force-overwrite
  assert.equal(r.status, 0, r.stderr);
});

// ── diagnostics streams ─────────────────────────────────────────────────────────

test('muddle: validator warnings go to stderr, not stdout', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.writeFileSync(input, fs.readFileSync(SC_FIXTURE, 'utf8') + 'bogus_key: 1\n');
  const r = run('muddle', input);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /unknown key "bogus_key"/, 'warning belongs on stderr');
  assert.ok(!/unknown key/.test(r.stdout), 'warning must not pollute stdout');
});

// ── error cases ───────────────────────────────────────────────────────────────

test('muddle: refuses to overwrite without -f and exits 1', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  run('muddle', input);          // first run
  const r = run('muddle', input);  // second run, no -f
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already exists/i);
});

test('muddle: refuses to overwrite its own source, even with -f', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const before = fs.readFileSync(input);
  // The same file reached three ways: by its own path, through a hard link and through a
  // symlink. The last two are different path strings, so only comparing files catches
  // them.
  const hardLink = path.join(dir, 'hard-link.yaml');
  const symlink  = path.join(dir, 'symlink.yaml');
  fs.linkSync(input, hardLink);
  fs.symlinkSync(input, symlink);
  for (const out of [input, hardLink, symlink]) {
    const r = run('muddle', input, '-o', out, '-f');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Error: output path is the input file: /);
    assert.deepEqual(fs.readFileSync(input), before, 'source must be untouched');
  }
});

test('muddle: -o creates a missing parent directory', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  const out   = path.join(dir, 'dist', 'nested', 'p.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  const r = run('muddle', input, '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out));
});

test('muddle: an already-muddled puzzle exits 1', () => {
  const dir   = tmpDir();
  const input = path.join(dir, 'circle-8.yaml');
  const first = path.join(dir, 'first.muddled.yaml');
  fs.copyFileSync(SC_FIXTURE, input);
  run('muddle', input, '-o', first);
  const r = run('muddle', first, '-o', path.join(dir, 'second.yaml'));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /already muddled/);
  assert.doesNotMatch(r.stderr, /Fix errors/, 'nothing in the file to fix');
  assert.ok(!fs.existsSync(path.join(dir, 'second.yaml')));
});

// Missing files, unparseable YAML and unknown kinds all reach this one branch, through
// loadKnownPuzzle (shared/cli/cliTools.js); validateCommand.test.js covers the
// Object.prototype kind names it shares with validate.
test('muddle: an unknown kind exits 1', () => {
  const dir = tmpDir();
  const f   = path.join(dir, 'widget.yaml');
  fs.writeFileSync(f, 'kind: widget\ntitle: "Bad"\n');
  const r = run('muddle', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown kind/i);
});

test('muddle: invalid puzzle exits 1 with "Fix errors" message', () => {
  const dir = tmpDir();
  const f   = path.join(dir, 'broken.yaml');
  fs.writeFileSync(f, [
    'kind: snake-charmer',
    'title: Broken',
    'entries:',
    '  - clue: Short',
    '    answer: A',
  ].join('\n'));
  const r = run('muddle', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Fix errors/i);
});

// ── Per-tool round trip + validate skip notice (table-driven) ────────────────
//
// Consolidates the four `*/test/muddle.test.js` files (one per tool) into a
// single generic loop. Each kind gets its own fixture and expected boardHash
// (computed via that tool's own prepare step, from shared/build/tools), then
// exercises: muddle → build → built HTML carries the same boardHash as a
// hashed:true build of the source, and `validate` on the muddled output exits
// 0 with the "skip" notice.
const { KINDS, hooksFor } = require('../shared/build/tools');
const { toolDir } = require('../shared/cli/cliTools');

const PER_TOOL_FIXTURES = {
  'snake-charmer':  'circle-8.yaml',
  'spiral':         'test-100.yaml',
  'marching-bands': 'mb-5.yaml',
  'crushword':      'cw-9.yaml',
};

for (const [kind, fixtureName] of Object.entries(PER_TOOL_FIXTURES)) {
  const fixturePath = path.join(toolDir(kind), 'test', 'fixtures', fixtureName);
  const source = require('js-yaml').load(fs.readFileSync(fixturePath, 'utf8'));
  const expectedBoardHash = hooksFor(kind).prepareFn({ ...source, hashed: true }).boardHash;

  test(`muddle round trip [${kind}]: build from muddled YAML matches source boardHash; validate exits 0 with skip notice`, () => {
    const dir         = tmpDir();
    const input        = path.join(dir, fixtureName);
    const muddledPath  = path.join(dir, fixtureName.replace(/\.yaml$/, '.muddled.yaml'));
    const outHtml       = path.join(dir, fixtureName.replace(/\.yaml$/, '.muddled.html'));
    fs.copyFileSync(fixturePath, input);

    const muddleResult = run('muddle', input);
    assert.equal(muddleResult.status, 0, muddleResult.stderr);
    assert.ok(fs.existsSync(muddledPath));

    const buildResult = run('build', muddledPath, '-o', outHtml);
    assert.equal(buildResult.status, 0, buildResult.stderr);
    const html = fs.readFileSync(outHtml, 'utf8');
    assert.ok(
      html.includes(`"boardHash": "${expectedBoardHash}"`),
      `[${kind}] built HTML boardHash mismatch. Expected: ${expectedBoardHash}`
    );

    const validateResult = run('validate', muddledPath);
    assert.equal(validateResult.status, 0, validateResult.stdout);
    assert.match(validateResult.stdout, /muddled/i);
  });
}

// ── Committed muddled fixtures stay faithful to their sources ────────────────
//
// Each `<name>.muddled.yaml` is a DERIVED artifact of `<name>.yaml`. Nothing in the
// build regenerates it, and marching-bands/devtools/regen-fixtures.js deliberately
// skips muddled files — so editing a source's answers, or changing the board-string
// format, silently leaves the sibling stale. This test is the guard: it re-derives
// each pair's hash from the source and compares.
test('every committed *.muddled.yaml matches a fresh hash of its source', () => {
  const yaml = require('js-yaml');
  const repoRoot = path.resolve(__dirname, '..');

  let checked = 0;
  for (const kind of KINDS) {
    const fixDir = path.join(toolDir(kind), 'test', 'fixtures');
    if (!fs.existsSync(fixDir)) continue;

    for (const file of fs.readdirSync(fixDir).filter(f => f.endsWith('.muddled.yaml'))) {
      const muddledPath = path.join(fixDir, file);
      const sourcePath  = path.join(fixDir, file.replace(/\.muddled\.yaml$/, '.yaml'));
      if (!fs.existsSync(sourcePath)) continue;  // muddled file with no committed source

      const muddled = yaml.load(fs.readFileSync(muddledPath, 'utf8'));
      const source  = yaml.load(fs.readFileSync(sourcePath, 'utf8'));
      const fresh   = hooksFor(kind).prepareFn({ ...source, hashed: true }).boardHash;

      const rel = path.relative(repoRoot, muddledPath);
      assert.equal(muddled.boardHash, fresh,
        `${rel} is stale — re-run: node cli.js muddle ${path.relative(repoRoot, sourcePath)} -o ${rel} -f`);
      assert.equal(muddled.format, 2, `${rel} must declare format: 2`);
      checked++;
    }
  }
  assert.ok(checked >= 3, `expected at least one muddled fixture per tool, checked ${checked}`);
});

test('muddle: a second path is an error, not silently ignored', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'p.yaml'));
  const r = run('muddle', path.join(dir, 'p.yaml'), 'extra.yaml');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unexpected argument 'extra\.yaml'/);
  assert.ok(!fs.existsSync(path.join(dir, 'p.muddled.yaml')));
});
