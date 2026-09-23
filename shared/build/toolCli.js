'use strict';

const path = require('path');
const fs   = require('fs');
const parseCliArgs          = require('./parseCliArgs');
const { defaultOutputPath } = require('./builderUtils');
const { GLOBAL_FLAG_SPECS, writeHelpIfRequested } = require('./globalHelp');

/**
 * Standard CLI runner shared by all per-tool cli.js files.
 *
 * Pure: reads only the injected `argv` and writes only to the injected
 * `stdout`/`stderr`, returning an exit code rather than calling
 * process.exit(). The actual CLI entry point (each tool's cli.js) is a thin
 * wrapper that calls this with real process.argv/stdout/stderr and exits
 * with the returned code — see e.g. snake-charmer/cli.js.
 *
 * @param {object} opts
 * @param {string}   opts.helpText       - Full help string (including Usage line and examples)
 * @param {string}   opts.usageLine      - Short usage shown on no-args error, e.g. "spiral <input.yaml> [options]"
 * @param {Array}    [opts.extraFlagSpecs] - Tool-specific parseCliArgs specs beyond GLOBAL_FLAG_SPECS
 * @param {Function} opts.buildPuzzle    - (inputPath, outputPath, options) → { title }
 * @param {Function} [opts.buildOptions] - (flags) → options object passed to buildPuzzle.
 *   Default: every parsed flag (global and extraFlagSpecs) except the CLI-only
 *   `output`/`force`, so a tool needs this only to rename or reshape flags.
 * @param {object}   [deps]
 * @param {string[]} [deps.argv]   - Args excluding the node/script path (default: process.argv.slice(2))
 * @param {{write: Function}} [deps.stdout] - Writer for normal output (default: process.stdout)
 * @param {{write: Function}} [deps.stderr] - Writer for error output (default: process.stderr)
 * @returns {number} exit code
 */
function runToolCli(
  { helpText, usageLine, extraFlagSpecs = [], buildPuzzle, buildOptions },
  { argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}
) {
  const args = argv;

  // Unlike the subcommands, a bare tool CLI answers no args with a one-line
  // usage error on stderr, so that case is handled before the shared help check.
  if (args.length < 1) {
    stderr.write(`Usage: ${usageLine}\nRun '${usageLine.split(' ')[0]} --help' for options.\n`);
    return 1;
  }

  const helpCode = writeHelpIfRequested(args, helpText, stdout);
  if (helpCode !== null) return helpCode;

  let flags, positionals;
  try {
    ({ flags, positionals } = parseCliArgs(args, [
      ...GLOBAL_FLAG_SPECS,
      ...extraFlagSpecs,
    ]));
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }

  if (positionals.length < 1) {
    stderr.write('Error: no input file specified.\n');
    return 1;
  }

  const input  = path.resolve(positionals[0]);
  const output = flags.output
    ? path.resolve(flags.output)
    : path.resolve(defaultOutputPath(input));

  if (!flags.force && fs.existsSync(output)) {
    stderr.write(`Error: output file already exists: ${output}\nUse -f or --force to overwrite.\n`);
    return 1;
  }

  const { output: _output, force: _force, ...forwardedFlags } = flags;
  const options = buildOptions ? buildOptions(flags) : forwardedFlags;

  try {
    const { title } = buildPuzzle(input, output, options);
    stdout.write(`Built "${title}" → ${output}\n`);
    return 0;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }
}

module.exports = { runToolCli };
