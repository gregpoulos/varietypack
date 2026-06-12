'use strict';

const path = require('path');
const fs   = require('fs');
const parseCliArgs          = require('./parseCliArgs');
const { defaultOutputPath } = require('./builderUtils');
const { GLOBAL_FLAG_SPECS } = require('./globalHelp');

/**
 * Standard CLI runner shared by all per-tool cli.js files.
 *
 * @param {object} opts
 * @param {string}   opts.helpText       - Full help string (including Usage line and examples)
 * @param {string}   opts.usageLine      - Short usage shown on no-args error, e.g. "spiral <input.yaml> [options]"
 * @param {Array}    [opts.extraFlagSpecs] - Tool-specific parseCliArgs specs beyond GLOBAL_FLAG_SPECS
 * @param {Function} opts.buildPuzzle    - (inputPath, outputPath, options) → { title }
 * @param {Function} [opts.buildOptions] - (flags) → options object passed to buildPuzzle (default: picks global flags)
 */
function runToolCli({ helpText, usageLine, extraFlagSpecs = [], buildPuzzle, buildOptions }) {
  const args = process.argv.slice(2);

  if (args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(helpText);
    process.exit(0);
  }

  if (args.length < 1) {
    process.stderr.write(`Usage: ${usageLine}\nRun '${usageLine.split(' ')[0]} --help' for options.\n`);
    process.exit(1);
  }

  let flags, positionals;
  try {
    ({ flags, positionals } = parseCliArgs(args, [
      ...GLOBAL_FLAG_SPECS,
      ...extraFlagSpecs,
    ]));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  if (positionals.length < 1) {
    process.stderr.write('Error: no input file specified.\n');
    process.exit(1);
  }

  const input  = path.resolve(positionals[0]);
  const output = flags.output
    ? path.resolve(flags.output)
    : path.resolve(defaultOutputPath(input));

  if (!flags.force && fs.existsSync(output)) {
    process.stderr.write(`Error: output file already exists: ${output}\nUse -f or --force to overwrite.\n`);
    process.exit(1);
  }

  const options = buildOptions
    ? buildOptions(flags)
    : { theme: flags.theme, font: flags.font, minify: flags.minify, muddle: flags.muddle };

  try {
    const { title } = buildPuzzle(input, output, options);
    process.stdout.write(`Built "${title}" → ${output}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { runToolCli };
