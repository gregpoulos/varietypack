#!/usr/bin/env node
'use strict';

const { buildCommand }    = require('./shared/build/buildCommand');
const { watchCommand }    = require('./shared/build/watchCommand');
const { validateCommand } = require('./shared/build/validateCommand');

const HELP = `Usage: varietypack <subcommand> [args] [options]

Subcommands:
  build     Build one or more puzzle files
  watch     Watch a directory and rebuild on changes
  validate  Check puzzle files for errors without building

Run 'varietypack <subcommand> --help' for subcommand-specific help.
`;

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(HELP);
  process.exit(args.length === 0 ? 1 : 0);
}

const [subcommand, ...rest] = args;

switch (subcommand) {
  case 'build':    buildCommand(rest);    break;
  case 'watch':    watchCommand(rest);    break;
  case 'validate': validateCommand(rest); break;
  default:
    process.stderr.write(`Unknown subcommand: "${subcommand}"\n`);
    process.stderr.write("Run 'varietypack --help' for usage.\n");
    process.exit(1);
}
