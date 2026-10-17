'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { TOOLS } = require('../shared/cli/toolRegistry');
const { main } = require('../cli');

const CLI = path.resolve(__dirname, '..', 'cli.js');
const SC_FIXTURE = path.resolve(__dirname, '..', 'snake-charmer/test/fixtures/circle-36.yaml');
const SP_FIXTURE = path.resolve(__dirname, '..', 'spiral/test/fixtures/test-100.yaml');

// Per-kind fixture used by the table-driven "builds each kind" test below.
const PER_KIND_FIXTURE = {
  'snake-charmer':  SC_FIXTURE,
  'spiral':         SP_FIXTURE,
  'marching-bands': path.resolve(__dirname, '..', 'marching-bands/test/fixtures/mb-12.yaml'),
  'crushword':      path.resolve(__dirname, '..', 'crushword/test/fixtures/cw-9.yaml'),
};

// In-process invocation of the dispatcher's main(), which runs each tool's CLI
// in-process too.
function run(...args) {
  let out = '';
  let err = '';
  const status = main(args, {
    stdout: { write: (s) => { out += s; } },
    stderr: { write: (s) => { err += s; } },
  });
  return { status, stdout: out, stderr: err };
}

// cli.js run as a real program, for what only a process shows (see the
// entry-point tests below).
function runSubprocess(...args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-cli-test-'));
}

// ── help ──────────────────────────────────────────────────────────────────────
//
// No-args / -h / --help semantics live once in shared/test/globalHelp.test.js;
// these only pin that the dispatcher and `build` are wired to that helper.

test('--help writes usage to stdout and exits 0', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: varietypack <subcommand>/);
});

test('build: --help writes build usage and exits 0', () => {
  const r = run('build', '--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Build one or more puzzle files/);
});

test('unknown subcommand exits 1 with error', () => {
  const r = run('bogus-subcommand');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown subcommand/i);
});

// ── entry points run as real programs ─────────────────────────────────────────
//
// Everything else here calls main() in-process, which never reaches the
// `require.main === module` guard each cli.js uses to exit with its code.
// These run each entry point as `node <file>`, the way a user does.

test('cli.js runs as a program and builds', () => {
  const out = path.join(tmpDir(), 'out.html');
  const r = runSubprocess('build', SC_FIXTURE, '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out));
});

for (const kind of Object.keys(TOOLS)) {
  test(`${kind}/cli.js runs as a program, builds, and exits with its code`, () => {
    const cli = path.join(TOOLS[kind].dir, 'cli.js');
    const out = path.join(tmpDir(), 'out.html');
    const ok = spawnSync(process.execPath, [cli, PER_KIND_FIXTURE[kind], '-o', out], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(fs.existsSync(out));
    const bad = spawnSync(process.execPath, [cli, PER_KIND_FIXTURE[kind], '--bogus'], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
  });
}

test('build: --embed-origin reaches PUZZLE_DATA', () => {
  const out = path.join(tmpDir(), 'out.html');
  const r = run('build', SC_FIXTURE, '--muddle', '--embed-origin', 'https://h.example', '-o', out);
  assert.equal(r.status, 0, r.stderr);
  assert.match(fs.readFileSync(out, 'utf8'), /"embedOrigin":\s*"https:\/\/h\.example"/);
});

// ── build: single-file auto-detection, table-driven across all kinds ──────────

for (const kind of Object.keys(TOOLS)) {
  test(`build: auto-detects ${kind} from kind field and builds via dispatcher`, () => {
    const out = path.join(tmpDir(), 'out.html');
    const r = run('build', PER_KIND_FIXTURE[kind], '-o', out);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(out));
  });
}

test('build: yaml file not found exits 1', () => {
  const r = run('build', 'nonexistent.yaml');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not found/i);
});

test('build: yaml with no kind field exits 1', () => {
  const dir = tmpDir();
  const f = path.join(dir, 'nokind.yaml');
  fs.writeFileSync(f, 'title: "No Kind"\n');
  const r = run('build', f);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /kind/i);
});

// `toString`/`constructor` are inherited by every plain object, so a bare
// `TOOLS[kind]` lookup would treat them as known kinds.
for (const kind of ['widget', 'toString', 'constructor']) {
  test(`build: yaml with unknown kind "${kind}" exits 1`, () => {
    const dir = tmpDir();
    const f = path.join(dir, 'badkind.yaml');
    fs.writeFileSync(f, `kind: ${kind}\ntitle: "Bad"\n`);
    const r = run('build', f);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown kind/i);
  });
}

// ── build: directory mode ─────────────────────────────────────────────────────

test('build: directory mode builds all YAMLs in place', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(dir, 'sp.yaml'));
  const r = run('build', dir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'sc.html')));
  assert.ok(fs.existsSync(path.join(dir, 'sp.html')));
});

test('build: directory mode with -o writes HTML files to output directory', () => {
  const inDir = tmpDir();
  const outDir = path.join(tmpDir(), 'output');
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(inDir, 'sp.yaml'));
  const r = run('build', inDir, '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(outDir, 'sc.html')));
  assert.ok(fs.existsSync(path.join(outDir, 'sp.html')));
  assert.ok(!fs.existsSync(path.join(inDir, 'sc.html')));
});

test('build: directory mode with no YAML files exits 1', () => {
  const dir = tmpDir();
  const r = run('build', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /No YAML files/i);
});

test('build: directory mode skips malformed YAML and still builds the valid files', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'bad.yaml'), 'title: [unterminated\n');
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'good.yaml'));
  const r = run('build', dir);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /could not parse/i);
  assert.ok(fs.existsSync(path.join(dir, 'good.html')), 'valid puzzle should still build');
});

// ── overwrite protection ──────────────────────────────────────────────────────
// The check itself is runToolBuild's, covered in shared/test/toolCli.test.js, and a
// directory reaches the same call; this pins that --force survives valuesFor's per-tool
// filtering.

test('build: --force allows overwriting an existing output file', () => {
  const out = path.join(tmpDir(), 'out.html');
  run('build', SC_FIXTURE, '-o', out);
  const r = run('build', SC_FIXTURE, '--force', '-o', out);
  assert.equal(r.status, 0, r.stderr);
});

// ── build messages go to the injected stderr ──────────────────────────────────

test('build: a validation warning reaches the injected stderr', () => {
  const dir = tmpDir();
  const puzzle = require('js-yaml').load(fs.readFileSync(SC_FIXTURE, 'utf8'));
  puzzle.entries[0].styles = { sparkle: [1] };
  const f = path.join(dir, 'warn.yaml');
  fs.writeFileSync(f, require('js-yaml').dump(puzzle));
  const r = run('build', f, '-o', path.join(dir, 'out.html'));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /sparkle/);
});

// ── one flow for a file and a directory ───────────────────────────────────────

test('build: flags may come before a directory path', () => {
  const outDir = tmpDir();
  const r = run('build', '--theme', 'skeleton', '-o', outDir, mixedDir());
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(outDir, 'sc.html')));
});

test('build: flags with no path exit 1 and say a path is needed', () => {
  const r = run('build', '--theme', 'skeleton');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no puzzle file or directory/i);
});

test("build: a tool flag the single puzzle's tool doesn't take is an error", () => {
  const out = path.join(tmpDir(), 'out.html');
  const r = run('build', SP_FIXTURE, '--shape', 'stadium', '-o', out);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--shape doesn't apply to a spiral puzzle/);
  assert.ok(!fs.existsSync(out));
});

test('build: --build-index with a single file is an error', () => {
  const out = path.join(tmpDir(), 'out.html');
  const r = run('build', SC_FIXTURE, '--build-index', '-o', out);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--build-index needs a directory/);
  assert.ok(!fs.existsSync(out));
});

// ── --build-index flag ────────────────────────────────────────────────────────

test('build: without --build-index does not create index.html', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  const r = run('build', inDir, '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(outDir, 'index.html')));
});

test('build: --build-index writes index.html in place when no -o', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  const r = run('build', dir, '--build-index');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(dir, 'index.html')));
});

test('build: --build-index links built puzzles', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(inDir, 'sp.yaml'));
  const r = run('build', inDir, '--build-index', '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  const index = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.match(index, /sc\.html/);
  assert.match(index, /sp\.html/);
});

test('build: --build-index preserves a populated index when a re-run builds nothing', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  run('build', dir, '--build-index'); // first run: writes sc.html + index.html
  // second run without --force: every per-file build fails the overwrite check,
  // so nothing is rebuilt. The good index must not be clobbered with a placeholder.
  const r = run('build', dir, '--build-index');
  assert.equal(r.status, 1);
  const index = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(index, /sc\.html/, 'index should still link the built puzzle');
  assert.doesNotMatch(index, /No puzzles built yet/);
});

// ── flag forwarding ───────────────────────────────────────────────────────────

test('build: directory mode forwards flags to each tool', () => {
  const inDir = tmpDir();
  const outDir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(inDir, 'sc.yaml'));
  const r = run('build', inDir, '--theme', 'skeleton', '--font', 'embed', '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(outDir, 'sc.html')));
  const bad = run('build', inDir, '--theme', 'nonexistent', '-o', tmpDir());
  assert.equal(bad.status, 1);
});

// Directory mode parses its flags once, against the global flags and every
// tool's own, then hands each puzzle only the flags its tool takes.

function mixedDir() {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'sc.yaml'));
  fs.copyFileSync(SP_FIXTURE, path.join(dir, 'sp.yaml'));
  return dir;
}

test('build: directory mode applies a tool-specific flag only to puzzles of that kind', () => {
  const outDir = tmpDir();
  const r = run('build', mixedDir(), '--shape', 'stadium', '-o', outDir);
  assert.equal(r.status, 0, r.stderr);
  // The fixture's own shape is circle, so stadium can only have come from the flag.
  assert.match(fs.readFileSync(path.join(outDir, 'sc.html'), 'utf8'), /"shape":\s*"stadium"/);
  assert.ok(fs.existsSync(path.join(outDir, 'sp.html')), 'spiral builds, ignoring --shape');
});

test('build: directory mode rejects an unknown flag once, before building anything', () => {
  const outDir = tmpDir();
  const r = run('build', mixedDir(), '--bogus', '-o', outDir);
  assert.equal(r.status, 1);
  assert.equal(r.stderr.match(/Unknown option/g)?.length, 1, r.stderr);
  assert.deepEqual(fs.readdirSync(outDir), []);
});

test('build: directory mode rejects a second path instead of ignoring it', () => {
  const r = run('build', mixedDir(), 'other-dir');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unexpected argument 'other-dir'/);
});

// ── watch ─────────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('watch: the process keeps running after the initial build', async () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'puzzle.yaml'));
  const child = spawn(process.execPath, [CLI, 'watch', dir]);
  let exited = false;
  child.on('exit', () => { exited = true; });
  try {
    await sleep(1500);
    assert.equal(exited, false, 'watch must not exit on its own');
  } finally {
    child.kill();
  }
});

test('watch: flags may come before the directory, as for build', async () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'puzzle.yaml'));
  const child = spawn(process.execPath, [CLI, 'watch', '--theme', 'skeleton', dir]);
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { err += d; });
  try {
    for (let i = 0; i < 50 && !out.includes('Open:'); i++) await sleep(100);
    assert.match(out, /Built "/, err);
    assert.ok(fs.existsSync(path.join(dir, 'puzzle.html')));
  } finally {
    child.kill();
  }
});

test('watch: a bad flag exits 1 before building anything', () => {
  const dir = tmpDir();
  fs.copyFileSync(SC_FIXTURE, path.join(dir, 'puzzle.yaml'));
  // A watch that accepted the flag would run until killed.
  const r = spawnSync(process.execPath, [CLI, 'watch', dir, '--bogus'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unknown option '--bogus'/);
  assert.ok(!fs.existsSync(path.join(dir, 'puzzle.html')));
});

test('watch: one editor-style save triggers one rebuild', async () => {
  const dir = tmpDir();
  const yamlPath = path.join(dir, 'puzzle.yaml');
  fs.copyFileSync(SC_FIXTURE, yamlPath);
  const child = spawn(process.execPath, [CLI, 'watch', dir]);
  let out = '';
  child.stdout.on('data', d => { out += d; });
  try {
    // Wait for the initial build, then give the watchers a moment to start.
    for (let i = 0; i < 50 && !out.includes('Open:'); i++) await sleep(100);
    await sleep(300);

    // Editors save by writing a temp file and renaming it over the original, which can
    // fire more than one fs.watch event for the one file.
    fs.writeFileSync(yamlPath + '.tmp', fs.readFileSync(yamlPath, 'utf8') + '\n');
    fs.renameSync(yamlPath + '.tmp', yamlPath);
    await sleep(800);

    assert.equal(out.match(/Changed:/g)?.length ?? 0, 1, out);
  } finally {
    child.kill();
  }
});
