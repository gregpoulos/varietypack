'use strict';

const path = require('path');
const fs = require('fs');
const { loadAndValidate, listYamlFiles } = require('./toolRegistry');
const { formatWarnings, formatValidationErrors } = require('../build/validation');
const { writeHelpIfRequested } = require('./globalHelp');
const parseCliArgs = require('./parseCliArgs');

const HELP = `Check puzzle files for errors without building.

Usage: varietypack validate <path>

  <path>  A .yaml puzzle file or a directory of .yaml files

Exit code: 0 if no errors found, 1 if any errors found.
Warnings are reported but do not affect the exit code.
`;

// Reports a file's problems in the sections build prints (warnings first, then errors),
// and `name: OK` when it has no errors. A file that won't load reports that as its error.
function validateFile(filePath, stdout) {
  const name = path.basename(filePath);
  const label = `"${name}"`;

  const { error, errors: validationErrors, warnings = [] } = loadAndValidate(filePath);
  const errors = error ? [error] : validationErrors;

  if (warnings.length) stdout.write(formatWarnings(warnings, label));
  if (errors.length) {
    stdout.write(formatValidationErrors(errors, label) + '\n');
    return false;
  }
  stdout.write(`${name}: OK\n`);
  return true;
}

// Returns the exit code; never exits (see main() in cli.js).
function validateCommand(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(args, HELP, stdout);
  if (helpCode !== null) return helpCode;

  let target;
  try {
    // validate takes no flags, so this only rejects stray arguments.
    [target] = parseCliArgs(args, {}, { maxPositionals: 1 }).positionals;
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  let files;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    files = listYamlFiles(target);
    if (files.length === 0) {
      stderr.write(`No YAML files found in "${target}".\n`);
      return 1;
    }
  } else {
    files = [path.resolve(target)];
  }

  let anyErrors = false;
  for (const file of files) {
    if (!validateFile(file, stdout)) anyErrors = true;
  }

  return anyErrors ? 1 : 0;
}

module.exports = { validateCommand };
