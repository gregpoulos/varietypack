'use strict';

const path = require('path');
const fs = require('fs');
const { TOOLS } = require('./toolRegistry');
const { loadPuzzle } = require('./builderUtils');

const HELP = `Check puzzle files for errors without building.

Usage: varietypack validate <path>

  <path>  A .yaml puzzle file or a directory of .yaml files

Exit code: 0 if no errors found, 1 if any errors found.
Warnings are reported but do not affect the exit code.
`;

function validateFile(filePath) {
  const name = path.basename(filePath);

  let puzzle;
  try {
    puzzle = loadPuzzle(filePath);
  } catch (err) {
    process.stdout.write(`${name}: error\n  ${err.message}\n`);
    return false;
  }

  const { kind } = puzzle;
  if (typeof kind !== 'string' || !TOOLS[kind]) {
    const msg = typeof kind !== 'string'
      ? 'missing or invalid "kind" field'
      : `unknown kind "${kind}"`;
    process.stdout.write(`${name}: error\n  ${msg}\n`);
    return false;
  }

  const validate = TOOLS[kind].getValidator();
  const { errors, warnings } = validate(puzzle);

  if (errors.length === 0 && warnings.length === 0) {
    process.stdout.write(`${name}: OK\n`);
    return true;
  }

  const parts = [];
  if (errors.length > 0) parts.push(`${errors.length} error${errors.length === 1 ? '' : 's'}`);
  if (warnings.length > 0) parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  process.stdout.write(`${name}: ${parts.join(', ')}\n`);
  for (const e of errors) process.stdout.write(`  ${e}\n`);
  for (const w of warnings) process.stdout.write(`  ${w}\n`);

  return errors.length === 0;
}

function validateCommand(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const target = args[0];

  let files;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    files = fs.readdirSync(target)
      .filter(f => /\.ya?ml$/i.test(f))
      .sort()
      .map(f => path.join(target, f));
    if (files.length === 0) {
      process.stderr.write(`No YAML files found in "${target}".\n`);
      process.exit(1);
    }
  } else {
    files = [path.resolve(target)];
  }

  let anyErrors = false;
  for (const file of files) {
    if (!validateFile(file)) anyErrors = true;
  }

  process.exit(anyErrors ? 1 : 0);
}

module.exports = { validateCommand };
