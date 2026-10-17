'use strict';

const path = require('path');
const fs   = require('fs');
const parseCliArgs          = require('./parseCliArgs');
const { defaultOutputPath } = require('./puzzleFiles');
const { GLOBAL_OPTIONS, writeHelpIfRequested } = require('./globalHelp');

/**
 * Standard CLI runner shared by all per-tool cli.js files.
 *
 * Returns the exit code and never calls process.exit(): tests call it
 * in-process. Each tool's cli.js exits with what it returns.
 *
 * @param {object} config - a tool's CLI_CONFIG
 * @param {string}   config.helpText       - Full help string (including Usage line and examples)
 * @param {string}   config.usageLine      - Short usage shown on no-args error, e.g. "spiral <input.yaml> [options]"
 * @param {object}   [config.extraOptions] - The tool's own util.parseArgs options, beside GLOBAL_OPTIONS
 * @param {Function} config.buildPuzzle    - (inputPath, outputPath, options, { stderr }) → { title }
 * @param {object}   [deps]
 * @param {string[]} [deps.argv]   - Args excluding the node/script path (default: process.argv.slice(2))
 * @param {{write: Function}} [deps.stdout] - Writer for normal output (default:
 *   process.stdout)
 * @param {{write: Function}} [deps.stderr] - Writer for error output (default:
 *   process.stderr)
 * @returns {number} exit code
 */
function runToolCli(
  { helpText, usageLine, extraOptions = {}, buildPuzzle },
  { argv = process.argv.slice(2), stdout = process.stdout, stderr = process.stderr } = {}
) {
  // Unlike the subcommands, a bare tool CLI answers no args with a one-line
  // usage error on stderr, so that case is handled before the shared help check.
  if (argv.length < 1) {
    stderr.write(`Usage: ${usageLine}\nRun '${usageLine.split(' ')[0]} --help' for options.\n`);
    return 1;
  }

  const helpCode = writeHelpIfRequested(argv, helpText, stdout);
  if (helpCode !== null) return helpCode;

  let values, positionals;
  try {
    ({ values, positionals } = parseCliArgs(argv, { ...GLOBAL_OPTIONS, ...extraOptions }, { maxPositionals: 1 }));
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  if (positionals.length < 1) {
    stderr.write('Error: no input file specified.\n');
    return 1;
  }

  return runToolBuild({ buildPuzzle }, { input: positionals[0], values }, { stdout, stderr });
}

/**
 * The build half of runToolCli, for a caller that has already parsed its flags:
 * directory-mode `varietypack build` calls it once per file. `values` is what
 * util.parseArgs returns for GLOBAL_OPTIONS plus the tool's extraOptions.
 * Returns the exit code and never calls process.exit().
 */
function runToolBuild(
  { buildPuzzle },
  { input: inputArg, values },
  { stdout = process.stdout, stderr = process.stderr } = {}
) {
  const input  = path.resolve(inputArg);
  const output = values.output
    ? path.resolve(values.output)
    : path.resolve(defaultOutputPath(input));

  // --force overwrites an old output, never the puzzle being built. Compared as files,
  // not path strings, so a case variant on a case-insensitive disk is caught too.
  if (isSameFile(input, output)) {
    stderr.write(`Error: output path is the input file: ${output}\n`);
    return 1;
  }
  if (!values.force && fs.existsSync(output)) {
    stderr.write(`Error: output file already exists: ${output}\nUse -f or --force to overwrite.\n`);
    return 1;
  }

  // Everything but the CLI-only output/force goes to the builder, under the
  // camelCase name the builders (and the studio) use.
  const { output: _output, force: _force, 'embed-origin': embedOrigin, ...options } = values;
  if (embedOrigin !== undefined) options.embedOrigin = embedOrigin;

  try {
    const { title } = buildPuzzle(input, output, options, { stderr });
    stdout.write(`Built "${title}" → ${output}\n`);
    return 0;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }
}

// False when either file is missing: a new output can't be the input.
function isSameFile(a, b) {
  try {
    const sa = fs.statSync(a), sb = fs.statSync(b);
    return sa.dev === sb.dev && sa.ino === sb.ino;
  } catch {
    return false;
  }
}

module.exports = { runToolCli, runToolBuild };
