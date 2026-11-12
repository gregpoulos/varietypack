'use strict';

const path = require('path');
const fs   = require('fs');
const { defaultOutputPath, isSameFile } = require('./puzzleFiles');
const { buildKnownPuzzle } = require('./writePuzzlePage');

/**
 * Builds one puzzle file for `varietypack build`, which has already parsed its flags,
 * loaded the file and calls this once per file. `values` is what util.parseArgs returns
 * for GLOBAL_OPTIONS plus the tool's own options (extraOptionsFor); `loaded` is the
 * file's loadKnownPuzzle result. Resolves the output path, refuses to overwrite, then
 * builds. Returns the exit code and never calls process.exit().
 */
function buildOneFile(
  { input: inputArg, loaded, values },
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
    const { title } = buildKnownPuzzle(loaded, input, output, options, { stderr });
    stdout.write(`Built "${title}" → ${output}\n`);
    return 0;
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 1;
  }
}

module.exports = { buildOneFile };
