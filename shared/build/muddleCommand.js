'use strict';

const path = require('path');
const fs   = require('fs');
const yaml = require('js-yaml');
const { TOOLS, loadAndValidate } = require('./toolRegistry');
const { buildMuddledYaml }  = require('./muddleUtils');
const parseCliArgs          = require('./parseCliArgs');
const { writeHelpIfRequested } = require('./globalHelp');

const HELP = `Produce a muddled YAML — a distributable version with answers replaced by hashes.

Usage: varietypack muddle <file.yaml> [options]

  <file.yaml>  A valid puzzle YAML file to muddle

Options:
  -o <path>    Write output to this path (default: <basename>.muddled.yaml next to the source)
  -f, --force  Overwrite output if it already exists

The muddled YAML sets hashed:true and format:2, and replaces each entry's answer: with
length: — a CELL count (a bracketed rebus group like [HAR] counts as one cell, not three
letters). It can only be produced from a valid puzzle and is a derived distribution format,
not an authoring format. Building a muddled puzzle always produces a hashed (answer-obscured)
HTML.
`;

function muddleOutputPath(inputPath) {
  const dir  = path.dirname(path.resolve(inputPath));
  const base = path.basename(inputPath).replace(/\.ya?ml$/i, '.muddled.yaml');
  return path.join(dir, base);
}

/**
 * Pure: reads only `args`, writes only to the injected `stdout`/`stderr`,
 * and returns an exit code rather than calling process.exit(). The root
 * cli.js entry point is a thin wrapper that calls this with real
 * process.argv/stdout/stderr and exits with the returned code.
 *
 * @param {string[]} args
 * @param {object} [deps]
 * @param {{write: Function}} [deps.stdout]
 * @param {{write: Function}} [deps.stderr]
 * @returns {number} exit code
 */
function muddleCommand(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(args, HELP, stdout);
  if (helpCode !== null) return helpCode;

  let flags, positionals;
  try {
    ({ flags, positionals } = parseCliArgs(args, [
      { flag: '-o',              name: 'output' },
      { flag: ['-f', '--force'], name: 'force', boolean: true },
    ]));
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }

  if (positionals.length < 1) {
    stderr.write('Error: no input file specified.\n');
    return 1;
  }

  const inputPath = path.resolve(positionals[0]);
  const force     = flags.force ?? false;

  const { error, puzzle, kind, errors, warnings } = loadAndValidate(inputPath);
  if (error) {
    stderr.write(`${path.basename(inputPath)}: error\n  ${error}\n`);
    return 1;
  }

  if (warnings.length > 0) {
    for (const w of warnings) stderr.write(`  ${w}\n`);
  }
  if (errors.length > 0) {
    const name = path.basename(inputPath);
    stderr.write(`${name}: ${errors.length} error${errors.length === 1 ? '' : 's'}\n`);
    for (const e of errors) stderr.write(`  ${e}\n`);
    stderr.write('Fix errors before muddling.\n');
    return 1;
  }

  const preparePuzzle = TOOLS[kind].getHasher();
  const { boardHash } = preparePuzzle({ ...puzzle, hashed: true });

  const muddled = buildMuddledYaml(puzzle, boardHash);

  const outPath = flags.output !== undefined
    ? path.resolve(flags.output)
    : muddleOutputPath(inputPath);

  if (!force && fs.existsSync(outPath)) {
    stderr.write(`Output already exists: ${outPath}. Use -f to overwrite.\n`);
    return 1;
  }

  fs.writeFileSync(outPath, yaml.dump(muddled, { lineWidth: -1 }));
  stdout.write(`${path.basename(inputPath)} → ${path.basename(outPath)}\n`);
  return 0;
}

module.exports = { muddleCommand };
