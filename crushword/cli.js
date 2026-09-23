#!/usr/bin/env node
'use strict';

const { buildPuzzle } = require('./src/builder');
const { runToolCli }  = require('../shared/build/toolCli');
const { GLOBAL_OPTIONS } = require('../shared/build/globalHelp');

const HELP = `Build a Crushword puzzle HTML from a YAML definition.

Usage: crushword <input.yaml> [options]

Options:
${GLOBAL_OPTIONS}

Examples:
  crushword puzzle.yaml
  crushword puzzle.yaml --theme skeleton -o out/puzzle.html
`;

const code = runToolCli({
  helpText:  HELP,
  usageLine: 'crushword <input.yaml> [options]',
  buildPuzzle,
});
process.exit(code);
