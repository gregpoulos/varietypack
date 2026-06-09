#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { buildPuzzle } = require('./src/builder');
const parseCliArgs          = require('../shared/build/parseCliArgs');
const { defaultOutputPath } = require('../shared/build/builderUtils');
const { GLOBAL_OPTIONS, GLOBAL_FLAG_SPECS } = require('../shared/build/globalHelp');
const { TOOL_OPTIONS }      = require('./cliHelp');

const args = process.argv.slice(2);

const HELP = `Build a Snake Charmer puzzle HTML from a YAML definition.

Usage: snakecharmer <input.yaml> [options]

Options:
${TOOL_OPTIONS}
${GLOBAL_OPTIONS}

Examples:
  snakecharmer puzzle.yaml
  snakecharmer puzzle.yaml --shape stadium --theme skeleton -o out/puzzle.html
`;

if (args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(HELP);
  process.exit(0);
}

if (args.length < 1) {
  process.stderr.write("Usage: snakecharmer <input.yaml> [options]\nRun 'snakecharmer --help' for options.\n");
  process.exit(1);
}

let flags, positionals;
try {
  ({ flags, positionals } = parseCliArgs(args, [
    ...GLOBAL_FLAG_SPECS,
    { flag: '--shape', name: 'shape', values: ['circle', 'stadium', 'turn', 'double-turn'] },
  ]));
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}

if (positionals.length < 1) {
  process.stderr.write('Error: no input file specified.\n');
  process.exit(1);
}

const input  = path.resolve(positionals[0]);
const output = flags.output
  ? path.resolve(flags.output)
  : path.resolve(defaultOutputPath(input));

if (!flags.force && fs.existsSync(output)) {
  process.stderr.write(`Error: output file already exists: ${output}\nUse -f or --force to overwrite.\n`);
  process.exit(1);
}

try {
  const { title } = buildPuzzle(input, output, { shape: flags.shape, theme: flags.theme, font: flags.font, minify: flags.minify, muddle: flags.muddle });
  process.stdout.write(`Built "${title}" → ${output}\n`);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}
