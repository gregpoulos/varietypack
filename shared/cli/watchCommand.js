'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { TOOLS } = require('./toolRegistry');
const { writeHelpIfRequested } = require('./globalHelp');
const { parseBuildArgs } = require('./buildCommand');

const ROOT = path.resolve(__dirname, '../..');
const CLI = path.join(ROOT, 'cli.js');

const HELP = `Watch a directory and rebuild puzzles on changes.

Usage: varietypack watch <dir> [options]

  <dir>  A directory containing .yaml puzzle files

All build options are forwarded (--theme, --force, --build-index, etc.)

Watches the puzzle directory for YAML file changes, and the shared library
and all known tool source directories for engine and template changes. Press Ctrl-C to stop.
`;

function watchCommand(args) {
  const helpCode = writeHelpIfRequested(args, HELP, process.stdout);
  if (helpCode !== null) process.exit(helpCode);

  // Parsed as build parses them, so the directory may come anywhere among the flags and
  // a bad flag fails now rather than on every rebuild.
  let values, positionals;
  try {
    ({ values, positionals } = parseBuildArgs(args));
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
  const dirArg = positionals[0];
  if (dirArg === undefined) {
    process.stderr.write("Error: no directory given.\nRun 'varietypack watch --help' for usage.\n");
    process.exit(1);
  }
  if (!fs.existsSync(dirArg) || !fs.statSync(dirArg).isDirectory()) {
    process.stderr.write(`Not a directory: "${dirArg}"\n`);
    process.stderr.write("Run 'varietypack watch --help' for usage.\n");
    process.exit(1);
  }

  const dirPath = path.resolve(dirArg);
  const buildArgs = values.force ? args : [...args, '--force'];

  function rebuild() {
    process.stdout.write('Rebuilding...\n');
    // A fresh process per rebuild, not an in-process call: Node caches every module
    // it requires, so only a new process picks up edits to builder and layout code.
    const result = spawnSync(process.execPath, [CLI, 'build', ...buildArgs], { stdio: 'inherit' });
    if (result.status !== 0) process.stderr.write('Build failed.\n');
  }

  // One save can fire several fs.watch events (an editor's write-then-rename fires two
  // for the one file), and each rebuild is a blocking spawnSync. Coalesce a burst into
  // one rebuild, announced with the burst's last message.
  const DEBOUNCE_MS = 100;
  let pending = null;
  function scheduleRebuild(message) {
    clearTimeout(pending);
    pending = setTimeout(() => {
      process.stdout.write(message);
      rebuild();
    }, DEBOUNCE_MS);
  }

  process.stdout.write('Watching for changes... (Ctrl-C to stop)\n');
  rebuild();
  process.stdout.write(`Open: file://${dirPath}/\n`);

  fs.watch(dirPath, { recursive: false }, (event, filename) => {
    if (filename && /\.ya?ml$/i.test(filename)) {
      scheduleRebuild(`Changed: ${filename}, rebuilding...\n`);
    }
  });

  const sourceDirs = [
    path.join(ROOT, 'shared'),
    ...Object.values(TOOLS).map((tool) => path.join(tool.dir, 'src')),
  ];
  for (const srcDir of sourceDirs) {
    if (fs.existsSync(srcDir)) {
      fs.watch(srcDir, { recursive: true }, () => {
        scheduleRebuild('Source changed, rebuilding...\n');
      });
    }
  }
}

module.exports = { watchCommand };
