'use strict';

const path = require('path');
const fs = require('fs');
const { loadAndValidate, listYamlFiles } = require('./toolRegistry');
const { writeHelpIfRequested } = require('./globalHelp');

const HELP = `Check puzzle files for errors without building.

Usage: varietypack validate <path>

  <path>  A .yaml puzzle file or a directory of .yaml files

Exit code: 0 if no errors found, 1 if any errors found.
Warnings are reported but do not affect the exit code.
`;

function validateFile(filePath, stdout) {
  const name = path.basename(filePath);

  const { error, errors, warnings } = loadAndValidate(filePath);
  if (error) {
    stdout.write(`${name}: error\n  ${error}\n`);
    return false;
  }

  if (errors.length === 0 && warnings.length === 0) {
    stdout.write(`${name}: OK\n`);
    return true;
  }

  const parts = [];
  if (errors.length > 0) parts.push(`${errors.length} error${errors.length === 1 ? '' : 's'}`);
  if (warnings.length > 0) parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  stdout.write(`${name}: ${parts.join(', ')}\n`);
  for (const e of errors) stdout.write(`  ${e}\n`);
  for (const w of warnings) stdout.write(`  ${w}\n`);

  return errors.length === 0;
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
function validateCommand(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(args, HELP, stdout);
  if (helpCode !== null) return helpCode;

  const target = args[0];

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
