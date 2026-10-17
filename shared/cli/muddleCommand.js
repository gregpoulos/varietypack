'use strict';

const path = require('path');
const fs   = require('fs');
const yaml = require('js-yaml');
const { TOOLS, loadKnownPuzzle } = require('./toolRegistry');
const { muddlePuzzle, MUDDLED_DUMP_OPTIONS } = require('../build/muddleUtils');
const parseCliArgs          = require('./parseCliArgs');
const { formatOptionsHelp, writeHelpIfRequested } = require('./globalHelp');

const OPTIONS = {
  output: { type: 'string', short: 'o', arg: 'file',
    description: 'Write output to this path (default: <basename>.muddled.yaml next to the source)' },
  force: { type: 'boolean', short: 'f', description: 'Overwrite output if it already exists' },
};

const HELP = `Produce a muddled YAML — a distributable version with answers replaced by hashes.

Usage: varietypack muddle <file.yaml> [options]

  <file.yaml>  A valid puzzle YAML file to muddle

Options:
${formatOptionsHelp(OPTIONS)}

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

// Returns the exit code; never exits (see main() in cli.js).
function muddleCommand(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(args, HELP, stdout);
  if (helpCode !== null) return helpCode;

  let values, positionals;
  try {
    ({ values, positionals } = parseCliArgs(args, OPTIONS, { maxPositionals: 1 }));
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  if (positionals.length < 1) {
    stderr.write('Error: no input file specified.\n');
    return 1;
  }

  const inputPath = path.resolve(positionals[0]);
  const force     = values.force ?? false;

  const { error, puzzle, kind } = loadKnownPuzzle(inputPath);
  if (error) {
    stderr.write(`${path.basename(inputPath)}: error\n  ${error}\n`);
    return 1;
  }

  const { errors, warnings, muddled } = muddlePuzzle(puzzle, {
    validateFn: TOOLS[kind].getValidator(),
    prepareFn:  TOOLS[kind].getPreparer(),
  });

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

  const outPath = values.output !== undefined
    ? path.resolve(values.output)
    : muddleOutputPath(inputPath);

  if (!force && fs.existsSync(outPath)) {
    stderr.write(`Output already exists: ${outPath}. Use -f to overwrite.\n`);
    return 1;
  }

  fs.writeFileSync(outPath, yaml.dump(muddled, MUDDLED_DUMP_OPTIONS));
  stdout.write(`${path.basename(inputPath)} → ${path.basename(outPath)}\n`);
  return 0;
}

module.exports = { muddleCommand };
