#!/usr/bin/env node
'use strict';

// The Linux half of the pre-merge e2e check, in Docker, instead of in the private repo's
// CI (docs/TESTING.md → "What to run when"). By default it runs the projects macOS
// doesn't already cover: Firefox, which an agent session can't launch on macOS, and
// the phone projects, the most layout-sensitive, where Linux fonts matter most. Chromium
// and WebKit run natively on macOS instead: the whole matrix in one container
// overloads it and fails WebKit tests by timeout. Needs Docker running.
//
//   npm run test:e2e:linux                                  # Firefox and phones
//   npm run test:e2e:linux -- --project=webkit -g "rebus"   # playwright flags pass through
//
// The image is the Playwright release matching the installed @playwright/test, so its
// browsers match, on the Ubuntu release CI's `ubuntu-latest` runs (resolute is 26.04),
// so its fonts match; move both together when `ubuntu-latest` moves. The working tree
// is piped into the container as git lists it (tracked files, and untracked ones that
// aren't ignored), so node_modules, which holds macOS binaries, and every other ignored
// path stay out; npm reinstalls there, with a named volume caching its downloads
// between runs. Failure artifacts land in test-results/, as on a local run.
// Don't run two at once: the CPU load causes timeouts that look like failures.

const fs   = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const { PHONES } = require('./mobile');

const root = path.resolve(__dirname, '..');
const { version } = require('@playwright/test/package.json');
const image = `mcr.microsoft.com/playwright:v${version}-resolute`;

// Shell-quote the forwarded flags: they become part of the container's bash script.
const quote = s => `'${s.replace(/'/g, `'\\''`)}'`;
const args = process.argv.slice(2);
if (!args.some(a => a.startsWith('--project'))) {
  args.push('--project=firefox', ...PHONES.map(p => `--project=${p.project}`));
}
// One worker unless told otherwise: parallel workers overload the container, and long
// solve tests time out.
if (!args.some(a => a.startsWith('--workers') || a.startsWith('-j'))) {
  args.push('--workers=1');
}
const passthrough = args.map(quote).join(' ');

const script = `
  set -e
  tar -xf - -C /work --warning=no-unknown-keyword
  cd /work && npm ci --silent --no-audit --no-fund
  npx playwright test ${passthrough}`;

// The files to copy: git's list, minus tracked files deleted in the working tree.
const listed = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], { cwd: root })
  .toString().split('\0').filter(f => f && fs.existsSync(path.join(root, f)));

// tar them on the host and stream the archive into the container's stdin.
// COPYFILE_DISABLE keeps macOS tar from adding AppleDouble (._*) files.
fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
const tar = spawn('tar', ['--null', '-T', '-', '-cf', '-'], {
  cwd: root, env: { ...process.env, COPYFILE_DISABLE: '1' }, stdio: ['pipe', 'pipe', 'inherit'],
});
tar.stdin.end(listed.join('\0'));
const docker = spawn('docker', [
  'run', '--rm', '-i', '--ipc=host',
  '-e', 'CI=1',
  '-v', `${path.join(root, 'test-results')}:/work/test-results`,
  '-v', 'varietypack-npm-cache:/root/.npm',
  image, 'bash', '-c', script,
], { stdio: [tar.stdout, 'inherit', 'inherit'] });
docker.on('exit', code => process.exit(code ?? 1));
