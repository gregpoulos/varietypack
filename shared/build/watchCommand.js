'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { TOOLS } = require('./toolRegistry');

const CLI = path.resolve(__dirname, '../../cli.js');

const HELP = `Watch a directory and rebuild puzzles on changes.

Usage: varietypack watch <dir> [options]

  <dir>  A directory containing .yaml puzzle files

All build options are forwarded (--theme, --force, --build-index, etc.)

Watches the puzzle directory for YAML file changes and all known tool
source directories for engine and template changes. Press Ctrl-C to stop.
`;

function watchCommand(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const dirArg = args[0];
  if (!fs.existsSync(dirArg) || !fs.statSync(dirArg).isDirectory()) {
    process.stderr.write(`Not a directory: "${dirArg}"\n`);
    process.stderr.write("Run 'varietypack watch --help' for usage.\n");
    process.exit(1);
  }

  const dirPath = path.resolve(dirArg);

  function rebuild() {
    process.stdout.write('Rebuilding...\n');
    const buildArgs = args.includes('--force') || args.includes('-f') ? args : [...args, '--force'];
    const result = spawnSync(process.execPath, [CLI, 'build', ...buildArgs], { stdio: 'inherit' });
    if (result.status !== 0) process.stderr.write('Build failed.\n');
  }

  process.stdout.write('Watching for changes... (Ctrl-C to stop)\n');
  rebuild();
  process.stdout.write(`Open: file://${dirPath}/\n`);

  fs.watch(dirPath, { recursive: false }, (event, filename) => {
    if (filename && /\.ya?ml$/i.test(filename)) {
      process.stdout.write(`Changed: ${filename}, rebuilding...\n`);
      rebuild();
    }
  });

  for (const tool of Object.values(TOOLS)) {
    const srcDir = path.join(tool.dir, 'src');
    if (fs.existsSync(srcDir)) {
      fs.watch(srcDir, { recursive: true }, () => {
        process.stdout.write('Source changed, rebuilding...\n');
        rebuild();
      });
    }
  }
}

module.exports = { watchCommand };
