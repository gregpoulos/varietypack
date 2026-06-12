#!/usr/bin/env node
'use strict';

const { buildPuzzle } = require('./src/builder');
const { runToolCli }  = require('../shared/build/toolCli');
const { GLOBAL_OPTIONS } = require('../shared/build/globalHelp');
const { TOOL_OPTIONS }   = require('./cliHelp');

const HELP = `Build a Snake Charmer puzzle HTML from a YAML definition.

Usage: snakecharmer <input.yaml> [options]

Options:
${TOOL_OPTIONS}
${GLOBAL_OPTIONS}

Examples:
  snakecharmer puzzle.yaml
  snakecharmer puzzle.yaml --shape stadium --theme skeleton -o out/puzzle.html
`;

runToolCli({
  helpText:       HELP,
  usageLine:      'snakecharmer <input.yaml> [options]',
  extraFlagSpecs: [
    { flag: '--shape', name: 'shape', values: ['circle', 'stadium', 'turn', 'double-turn'] },
  ],
  buildPuzzle,
  buildOptions: (flags) => ({
    shape:  flags.shape,
    theme:  flags.theme,
    font:   flags.font,
    minify: flags.minify,
    muddle: flags.muddle,
  }),
});
