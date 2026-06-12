#!/usr/bin/env node
'use strict';

const { buildPuzzle } = require('./src/builder');
const { runToolCli }  = require('../shared/build/toolCli');
const { GLOBAL_OPTIONS } = require('../shared/build/globalHelp');

const HELP = `Build a Spiral puzzle HTML from a YAML definition.

Usage: spiral <input.yaml> [options]

Options:
${GLOBAL_OPTIONS}

Examples:
  spiral puzzle.yaml
  spiral puzzle.yaml --theme skeleton -o out/puzzle.html
`;

runToolCli({
  helpText:  HELP,
  usageLine: 'spiral <input.yaml> [options]',
  buildPuzzle,
});
