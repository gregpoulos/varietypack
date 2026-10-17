#!/usr/bin/env node
'use strict';

const { buildCommand }    = require('./shared/cli/buildCommand');
const { watchCommand }    = require('./shared/cli/watchCommand');
const { validateCommand } = require('./shared/cli/validateCommand');
const { muddleCommand }   = require('./shared/cli/muddleCommand');
const { writeHelpIfRequested } = require('./shared/cli/globalHelp');

const HELP = `Usage: varietypack <subcommand> [args] [options]

Subcommands:
  build     Build one or more puzzle files
  watch     Watch a directory and rebuild on changes
  validate  Check puzzle files for errors without building
  muddle    Strip answers from a puzzle file, replacing them with hashes

Run 'varietypack <subcommand> --help' for subcommand-specific help.
`;

// Returns the exit code and never calls process.exit(), nor may any subcommand:
// tests call main() in-process, and an exit would kill the test runner. The one
// exception is `watch`, which runs until killed; main returns null for it.
function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(argv, HELP, stdout);
  if (helpCode !== null) return helpCode;

  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case 'build':    return buildCommand(rest, { stdout, stderr });
    case 'watch':    watchCommand(rest); return null;
    case 'validate': return validateCommand(rest, { stdout, stderr });
    case 'muddle':   return muddleCommand(rest, { stdout, stderr });
    default:
      stderr.write(`Unknown subcommand: "${subcommand}"\n`);
      stderr.write("Run 'varietypack --help' for usage.\n");
      return 1;
  }
}

if (require.main === module) {
  const code = main();
  // null = watch: exiting here would tear down its fs.watch handles.
  if (code !== null) process.exit(code);
}

module.exports = { main };
