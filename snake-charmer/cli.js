#!/usr/bin/env node
'use strict';

const { HOOKS } = require('./src/builder');
const { runBuildPuzzle } = require('../shared/cli/runBuildPuzzle');
const { runToolCli }  = require('../shared/cli/toolCli');
const { GLOBAL_OPTIONS_HELP, formatOptionsHelp } = require('../shared/cli/globalHelp');
const { SHAPE_NAMES } = require('./src/layout');

const SHAPE_OPTION = {
  shape: { type: 'string', arg: 'name',
    description: 'Ring shape: ' + SHAPE_NAMES.join(', ') + '\nDefault: auto (tries double-turn, falls back to stadium)' },
};

const HELP = `Build a Snake Charmer puzzle HTML from a YAML definition.

Usage: snakecharmer <input.yaml> [options]

Options:
${formatOptionsHelp(SHAPE_OPTION)}

${GLOBAL_OPTIONS_HELP}

Examples:
  snakecharmer puzzle.yaml
  snakecharmer puzzle.yaml --shape stadium --theme skeleton -o out/puzzle.html
`;

function buildPuzzle(inputPath, outputPath, options, io) {
  return runBuildPuzzle(inputPath, outputPath, options, HOOKS, io);
}

// Exported for the `varietypack build` dispatcher, which runs it in-process;
// only a direct run (`node snake-charmer/cli.js …`) exits.
const CLI_CONFIG = {
  helpText:       HELP,
  usageLine:      'snakecharmer <input.yaml> [options]',
  extraOptions:   SHAPE_OPTION,
  buildPuzzle,
};

if (require.main === module) process.exit(runToolCli(CLI_CONFIG));

module.exports = { CLI_CONFIG, buildPuzzle };
