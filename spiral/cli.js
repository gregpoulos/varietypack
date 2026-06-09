#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { buildPuzzle }  = require('./src/builder');
const parseCliArgs          = require('../shared/build/parseCliArgs');
const { defaultOutputPath } = require('../shared/build/builderUtils');
const { GLOBAL_OPTIONS, GLOBAL_FLAG_SPECS } = require('../shared/build/globalHelp');

const args = process.argv.slice(2);

const HELP = `Build a Spiral puzzle HTML from a YAML definition.

Usage: spiral <input.yaml> [options]

Options:
${GLOBAL_OPTIONS}

Examples:
  spiral puzzle.yaml
  spiral puzzle.yaml --theme skeleton -o out/puzzle.html
`;

if (args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

if (args.length < 1) {
  process.stderr.write("Usage: spiral <input.yaml> [options]\nRun 'spiral --help' for options.\n");
  process.exit(1);
}

let flags, positionals;
try {
  ({ flags, positionals } = parseCliArgs(args, [...GLOBAL_FLAG_SPECS]));
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}

if (positionals.length < 1) {
  process.stderr.write('Error: no input file specified.\n');
  process.exit(1);
}

const resolvedInput  = path.resolve(positionals[0]);
const resolvedOutput = flags.output
  ? path.resolve(flags.output)
  : path.resolve(defaultOutputPath(resolvedInput));

if (!flags.force && fs.existsSync(resolvedOutput)) {
  process.stderr.write(`Error: output file already exists: ${resolvedOutput}\nUse -f or --force to overwrite.\n`);
  process.exit(1);
}

try {
  const { title } = buildPuzzle(resolvedInput, resolvedOutput, { theme: flags.theme, font: flags.font, minify: flags.minify, muddle: flags.muddle });
  process.stdout.write(`Built "${title}" → ${resolvedOutput}\n`);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}
