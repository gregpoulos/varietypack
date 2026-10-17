#!/usr/bin/env node
'use strict';

const { HOOKS } = require('./src/builder');
const { runBuildPuzzle } = require('../shared/cli/runBuildPuzzle');
const { runToolCli }  = require('../shared/cli/toolCli');
const { GLOBAL_OPTIONS_HELP } = require('../shared/cli/globalHelp');

const HELP = `Build a Marching Bands puzzle HTML from a YAML definition.

Usage: marching-bands <input.yaml> [options]

Options:
${GLOBAL_OPTIONS_HELP}

Examples:
  marching-bands puzzle.yaml
  marching-bands puzzle.yaml --theme skeleton -o out/puzzle.html
`;

function buildPuzzle(inputPath, outputPath, options, io) {
  return runBuildPuzzle(inputPath, outputPath, options, HOOKS, io);
}

// Exported for the `varietypack build` dispatcher, which runs it in-process;
// only a direct run (`node marching-bands/cli.js …`) exits.
const CLI_CONFIG = {
  helpText:  HELP,
  usageLine: 'marching-bands <input.yaml> [options]',
  buildPuzzle,
};

if (require.main === module) process.exit(runToolCli(CLI_CONFIG));

module.exports = { CLI_CONFIG, buildPuzzle };
