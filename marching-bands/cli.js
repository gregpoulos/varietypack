#!/usr/bin/env node
'use strict';

const { buildPuzzle } = require('./src/builder');
const { runToolCli }  = require('../shared/build/toolCli');
const { GLOBAL_OPTIONS } = require('../shared/build/globalHelp');

const HELP = `Build a Marching Bands puzzle HTML from a YAML definition.

Usage: marching-bands <input.yaml> [options]

Options:
${GLOBAL_OPTIONS}

Examples:
  marching-bands puzzle.yaml
  marching-bands puzzle.yaml --theme skeleton -o out/puzzle.html
`;

runToolCli({
  helpText:  HELP,
  usageLine: 'marching-bands <input.yaml> [options]',
  buildPuzzle,
});
