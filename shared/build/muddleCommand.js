'use strict';

const path = require('path');
const fs   = require('fs');
const yaml = require('js-yaml');
const { TOOLS }             = require('./toolRegistry');
const { loadPuzzle }        = require('./builderUtils');
const { buildMuddledYaml }  = require('./muddleUtils');
const parseCliArgs          = require('./parseCliArgs');

const HELP = `Produce a muddled YAML — a distributable version with answers replaced by hashes.

Usage: varietypack muddle <file.yaml> [options]

  <file.yaml>  A valid puzzle YAML file to muddle

Options:
  -o <path>    Write output to this path (default: <basename>.muddled.yaml next to the source)
  -f, --force  Overwrite output if it already exists

The muddled YAML sets hashed:true and replaces each entry's answer: with length:.
It can only be produced from a valid puzzle and is a derived distribution format, not an
authoring format. Building a muddled puzzle always produces a hashed (answer-obscured) HTML.
`;

function muddleOutputPath(inputPath) {
  const dir  = path.dirname(path.resolve(inputPath));
  const base = path.basename(inputPath).replace(/\.ya?ml$/i, '.muddled.yaml');
  return path.join(dir, base);
}

function muddleCommand(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(args.length === 0 ? 1 : 0);
  }

  let flags, positionals;
  try {
    ({ flags, positionals } = parseCliArgs(args, [
      { flag: '-o',              name: 'output' },
      { flag: ['-f', '--force'], name: 'force', boolean: true },
    ]));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  if (positionals.length < 1) {
    process.stderr.write('Error: no input file specified.\n');
    process.exit(1);
  }

  const inputPath = path.resolve(positionals[0]);
  const force     = flags.force ?? false;

  let puzzle;
  try {
    puzzle = loadPuzzle(inputPath);
  } catch (err) {
    process.stderr.write(`${path.basename(inputPath)}: error\n  ${err.message}\n`);
    process.exit(1);
  }

  const { kind } = puzzle;
  if (typeof kind !== 'string' || !TOOLS[kind]) {
    const msg = typeof kind !== 'string'
      ? 'missing or invalid "kind" field'
      : `unknown kind "${kind}"`;
    process.stderr.write(`${path.basename(inputPath)}: error\n  ${msg}\n`);
    process.exit(1);
  }

  const validate = TOOLS[kind].getValidator();
  const { errors, warnings } = validate(puzzle);
  if (warnings.length > 0) {
    for (const w of warnings) process.stderr.write(`  ${w}\n`);
  }
  if (errors.length > 0) {
    const name = path.basename(inputPath);
    process.stderr.write(`${name}: ${errors.length} error${errors.length === 1 ? '' : 's'}\n`);
    for (const e of errors) process.stderr.write(`  ${e}\n`);
    process.stderr.write('Fix errors before muddling.\n');
    process.exit(1);
  }

  const preparePuzzle = TOOLS[kind].getHasher();
  const { boardHash } = preparePuzzle({ ...puzzle, hashed: true });

  const muddled = buildMuddledYaml(puzzle, boardHash);

  const outPath = flags.output !== undefined
    ? path.resolve(flags.output)
    : muddleOutputPath(inputPath);

  if (!force && fs.existsSync(outPath)) {
    process.stderr.write(`Output already exists: ${outPath}. Use -f to overwrite.\n`);
    process.exit(1);
  }

  fs.writeFileSync(outPath, yaml.dump(muddled, { lineWidth: -1 }));
  process.stdout.write(`${path.basename(inputPath)} → ${path.basename(outPath)}\n`);
}

module.exports = { muddleCommand };
