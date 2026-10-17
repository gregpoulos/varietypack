'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { TOOLS, isKnownKind, listYamlFiles } = require('./toolRegistry');
const { GLOBAL_OPTIONS, GLOBAL_OPTIONS_HELP, formatOptionsHelp, writeHelpIfRequested } = require('./globalHelp');
const { runToolBuild } = require('./toolCli');
const { htmlName } = require('./puzzleFiles');
const parseCliArgs = require('./parseCliArgs');

const buildIndex = require('./buildIndex');

const BUILD_INDEX_OPTION = {
  'build-index': { type: 'boolean', description: 'Write index.html linking all built puzzles (default: off)' },
};

const HELP = `Build one or more puzzle files.

Usage: varietypack build <path> [options]

  <path>  A .yaml puzzle file or a directory of .yaml files

Options:
${GLOBAL_OPTIONS_HELP}

Directory options:
${formatOptionsHelp(BUILD_INDEX_OPTION)}

Tool-specific options (e.g. --shape for snake-charmer) are documented in each
tool's docs/SPEC.md. Given a directory, each applies only to puzzles of its kind.

When given a directory, builds all YAML puzzle files found in it.
`;

function readYamlMeta(filePath, stderr) {
  const name = path.basename(filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      stderr.write(`File not found: "${filePath}"\n`);
      return null;
    }
    throw err;
  }
  let doc;
  try {
    doc = yaml.load(content);
  } catch (err) {
    stderr.write(`Could not parse "${name}" as YAML: ${err.message}\n`);
    return null;
  }
  if (typeof doc?.kind !== 'string') {
    stderr.write(`No "kind" field found in "${name}".\n`);
    return null;
  }
  return {
    kind: doc.kind,
    title: typeof doc.title === 'string' ? doc.title : path.basename(filePath, path.extname(filePath)),
  };
}

// The parsed values that `kind`'s CLI takes, so --shape reaches only the Snake Charmers.
function valuesFor(kind, values) {
  const options = { ...GLOBAL_OPTIONS, ...TOOLS[kind].getCli().extraOptions };
  return Object.fromEntries(Object.entries(values).filter(([name]) => Object.hasOwn(options, name)));
}

// build's flags, parsed against the global options and every tool's own, with the path
// anywhere among them. Throws on a bad flag or a second path. `watch` parses with it
// too, since it hands its arguments to build.
function parseBuildArgs(args) {
  const allToolOptions = Object.assign({}, ...Object.values(TOOLS).map(tool => tool.getCli().extraOptions));
  return parseCliArgs(args, { ...GLOBAL_OPTIONS, ...BUILD_INDEX_OPTION, ...allToolOptions }, { maxPositionals: 1 });
}

// One flow for a file and a directory: a file is a directory of one puzzle.
// Flags are parsed once, so a bad one fails before anything builds.
// Returns the exit code; never exits (see main() in cli.js).
function buildCommand(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(args, HELP, stdout);
  if (helpCode !== null) return helpCode;

  let values, positionals;
  try {
    ({ values, positionals } = parseBuildArgs(args));
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  const target = positionals[0];
  if (target === undefined) {
    stderr.write("Error: no puzzle file or directory given.\nRun 'varietypack build --help' for usage.\n");
    return 1;
  }
  const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
  if (!isDir && !/\.ya?ml$/i.test(target)) {
    stderr.write(`Not a YAML file or directory: "${target}"\nRun 'varietypack build --help' for usage.\n`);
    return 1;
  }
  if (!isDir && values['build-index']) {
    stderr.write('Error: --build-index needs a directory.\n');
    return 1;
  }

  // -o names the output file for a single puzzle, the output directory for many.
  const outputDir = isDir && values.output !== undefined ? path.resolve(values.output) : null;

  // Everything that differs between a file and a directory is decided here, so
  // the loop below treats every job alike.
  const jobs = isDir
    ? listYamlFiles(path.resolve(target)).map(file =>
        ({ file, output: outputDir ? path.join(outputDir, htmlName(file)) : undefined }))
    : [{ file: target, output: values.output }];
  if (jobs.length === 0) {
    stderr.write(`No YAML files found in "${target}".\n`);
    return 1;
  }
  if (outputDir) fs.mkdirSync(outputDir, { recursive: true });

  // A flag the puzzle's tool can't take is an error only for a named file;
  // across a directory, each puzzle just gets the flags for its kind.
  const strict = !isDir;

  let anyFailed = false;
  const puzzles = [];
  for (const { file, output } of jobs) {
    const meta = readYamlMeta(file, stderr);
    if (!meta) {
      anyFailed = true;
      continue;
    }
    const { kind, title } = meta;
    if (!isKnownKind(kind)) {
      stderr.write(`"${path.basename(file)}": unknown kind "${kind}".\n`);
      anyFailed = true;
      continue;
    }
    const toolValues = valuesFor(kind, values);
    const unused = strict && Object.keys(values).find(name => !Object.hasOwn(toolValues, name));
    if (unused) {
      stderr.write(`Error: --${unused} doesn't apply to a ${kind} puzzle.\n`);
      anyFailed = true;
      continue;
    }
    const status = runToolBuild(TOOLS[kind].getCli(), { input: file, values: { ...toolValues, output } }, { stdout, stderr });
    if (status !== 0) {
      anyFailed = true;
    } else {
      puzzles.push({ name: htmlName(file), title });
    }
  }

  // Only (re)write the index when at least one puzzle built. Otherwise a failed
  // re-run (e.g. outputs already exist without --force) would clobber a good
  // index with a "No puzzles built yet" placeholder while the HTML is still on disk.
  if (values['build-index'] && puzzles.length > 0) {
    buildIndex(puzzles, outputDir ?? path.resolve(target), 'Puzzles', { stdout });
  }

  return anyFailed ? 1 : 0;
}

module.exports = { buildCommand, parseBuildArgs };
