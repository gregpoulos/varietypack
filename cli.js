#!/usr/bin/env node
'use strict';

const { buildCommand }    = require('./shared/build/buildCommand');
const { watchCommand }    = require('./shared/build/watchCommand');
const { validateCommand } = require('./shared/build/validateCommand');
const { muddleCommand }   = require('./shared/build/muddleCommand');
const { writeHelpIfRequested } = require('./shared/build/globalHelp');

const HELP = `Usage: varietypack <subcommand> [args] [options]

Subcommands:
  build     Build one or more puzzle files
  watch     Watch a directory and rebuild on changes
  validate  Check puzzle files for errors without building
  muddle    Strip answers from a puzzle file, replacing them with hashes

Run 'varietypack <subcommand> --help' for subcommand-specific help.
`;

/**
 * Pure: reads only `argv`, writes only to the injected `stdout`/`stderr`,
 * and returns an exit code rather than calling process.exit(). The
 * process.exit() call below (guarded by require.main) is the only exiting
 * wrapper — this function itself never exits the process, so it can be
 * called in-process from tests.
 *
 * `watch` is the one subcommand not converted: it runs indefinitely
 * (fs.watch) and has no meaningful "exit code" for the common case, so it
 * keeps its own internal process.exit() calls for its early error paths.
 *
 * @param {string[]} [argv] - default: process.argv.slice(2)
 * @param {object} [deps]
 * @param {{write: Function}} [deps.stdout]
 * @param {{write: Function}} [deps.stderr]
 * @returns {number} exit code
 */
function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(argv, HELP, stdout);
  if (helpCode !== null) return helpCode;

  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case 'build':    return buildCommand(rest, { stdout, stderr });
    case 'watch':    watchCommand(rest); return 0;
    case 'validate': return validateCommand(rest, { stdout, stderr });
    case 'muddle':   return muddleCommand(rest, { stdout, stderr });
    default:
      stderr.write(`Unknown subcommand: "${subcommand}"\n`);
      stderr.write("Run 'varietypack --help' for usage.\n");
      return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main };
