'use strict';

const path = require('path');
const fs = require('fs');
const { extraOptionsFor, loadKnownPuzzle, listYamlFiles } = require('./cliTools');
const { KINDS } = require('../build/tools');
const { GLOBAL_OPTIONS, GLOBAL_OPTIONS_HELP, formatOptionsHelp, writeHelpIfRequested } = require('./globalHelp');
const { buildOneFile } = require('./buildOneFile');
const { htmlName, defaultOutputPath } = require('./puzzleFiles');
const parseCliArgs = require('./parseCliArgs');

const buildIndex = require('./buildIndex');

const BUILD_INDEX_OPTION = {
  'build-index': { type: 'boolean', description: 'Write index.html linking all built puzzles (default: off)' },
};

// One heading and option list per tool that has options of its own.
function toolOptionsHelp() {
  return KINDS
    .filter(kind => Object.keys(extraOptionsFor(kind)).length > 0)
    .map(kind => `${kind} options:\n${formatOptionsHelp(extraOptionsFor(kind))}`)
    .join('\n\n');
}

const HELP = `Build one or more puzzle files.

Usage: varietypack build <path> [options]

  <path>  A .yaml puzzle file or a directory of .yaml files

Options:
${GLOBAL_OPTIONS_HELP}

Directory options:
${formatOptionsHelp(BUILD_INDEX_OPTION)}

${toolOptionsHelp()}

Given a directory, each tool's options apply only to puzzles of its kind.

When given a directory, builds all YAML puzzle files found in it.
`;

// The parsed values that `kind`'s CLI takes, so --shape reaches only the Snake Charmers.
function valuesFor(kind, values) {
  const options = { ...GLOBAL_OPTIONS, ...extraOptionsFor(kind) };
  return Object.fromEntries(Object.entries(values).filter(([name]) => Object.hasOwn(options, name)));
}

// build's flags, parsed against the global options and every tool's own, with the path
// anywhere among them. Throws on a bad flag or a second path. `watch` parses with it
// too, since it hands its arguments to build.
function parseBuildArgs(args) {
  const allToolOptions = Object.assign({}, ...KINDS.map(extraOptionsFor));
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

  // A file that can't build (unreadable, not a puzzle, or an unknown kind) is reported
  // here and left out of the shared-page check, so it can't block a valid file sharing
  // its base name. Each file is parsed once, here; the build below reuses the result.
  let anyFailed = false;
  const buildable = [];
  for (const job of jobs) {
    const { error, puzzle, kind } = loadKnownPuzzle(job.file);
    if (error) {
      stderr.write(`"${path.basename(job.file)}": ${error}\n`);
      anyFailed = true;
    } else {
      const title = typeof puzzle.title === 'string' ? puzzle.title : path.basename(job.file, path.extname(job.file));
      buildable.push({ ...job, kind, puzzle, title });
    }
  }

  // Files that would build to the same page: none of them builds, so --force (or a
  // watch rebuild) can't have one silently overwrite another. Pages are grouped with
  // case folded: they don't exist yet to compare as files, and on a case-insensitive disk
  // a.html and A.html are one file. That also refuses the pair on a case-sensitive disk.
  const byOutput = new Map();
  for (const job of buildable) {
    const out = path.resolve(job.output ?? defaultOutputPath(path.resolve(job.file))).toLowerCase();
    byOutput.set(out, [...(byOutput.get(out) ?? []), job]);
  }
  const skipped = new Set();
  for (const group of byOutput.values()) {
    if (group.length < 2) continue;
    const names = group.map(job => `"${path.basename(job.file)}"`);
    const list = `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    const which = group.length === 2 ? 'both' : 'all';
    stderr.write(`Error: ${list} would ${which} build to ${htmlName(group[0].file)}; rename one.\n`);
    for (const job of group) skipped.add(job);
    anyFailed = true;
  }

  // A flag the puzzle's tool can't take is an error only for a named file;
  // across a directory, each puzzle just gets the flags for its kind.
  const strict = !isDir;

  const puzzles = [];
  for (const job of buildable) {
    if (skipped.has(job)) continue;
    const { file, output, kind, puzzle, title } = job;
    const toolValues = valuesFor(kind, values);
    const unused = strict && Object.keys(values).find(name => !Object.hasOwn(toolValues, name));
    if (unused) {
      stderr.write(`Error: --${unused} doesn't apply to a ${kind} puzzle.\n`);
      anyFailed = true;
      continue;
    }
    const status = buildOneFile({ input: file, loaded: { puzzle, kind }, values: { ...toolValues, output } }, { stdout, stderr });
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
