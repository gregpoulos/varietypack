'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');
const { TOOLS, listYamlFiles } = require('./toolRegistry');
const { GLOBAL_OPTIONS, writeHelpIfRequested } = require('./globalHelp');
const buildIndex = require('./buildIndex');

const HELP = `Build one or more puzzle files.

Usage: varietypack build <path> [options]

  <path>  A .yaml puzzle file or a directory of .yaml files

Options:
${GLOBAL_OPTIONS}

Directory options:
  --build-index    Write index.html linking all built puzzles (default: off)

Tool-specific options (e.g. --shape for snake-charmer) are forwarded to the
tool and documented in each tool's docs/SPEC.md.

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

// Spawns the per-tool cli.js as a real subprocess. This is the one genuine
// process boundary in the build pipeline (the root dispatcher hands off to a
// tool's own CLI entry point) and is deliberately not folded into an
// in-process call — see shared/test/toolCli.test.js and test/cli.test.js for
// the subprocess coverage this specific boundary keeps.
//
// Captured (not 'inherit'), then relayed through the injected stdout/stderr:
// with the default deps (real process.stdout/stderr) this reproduces
// 'inherit' output faithfully; with injected test writers it lets in-process
// callers observe the child's output instead of it leaking straight to the
// real terminal.
function spawnTool(kind, toolArgs, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const result = spawnSync('node', [path.join(TOOLS[kind].dir, 'cli.js'), ...toolArgs], {
    encoding: 'utf8',
  });
  if (result.stdout) stdout.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
  return result.status ?? 1;
}

function buildDirectory(dirPath, remainingArgs, { stdout, stderr }) {
  let outputDir = null;
  let writeIndex = false;
  const forwardArgs = [];
  for (let i = 0; i < remainingArgs.length; i++) {
    if (remainingArgs[i] === '-o') {
      if (i + 1 >= remainingArgs.length) {
        stderr.write('Error: -o requires a value.\n');
        return 1;
      }
      outputDir = path.resolve(remainingArgs[++i]);
    } else if (remainingArgs[i] === '--build-index') {
      writeIndex = true;
    } else {
      forwardArgs.push(remainingArgs[i]);
    }
  }

  const files = listYamlFiles(dirPath);

  if (files.length === 0) {
    stderr.write(`No YAML files found in "${dirPath}".\n`);
    return 1;
  }

  if (outputDir) fs.mkdirSync(outputDir, { recursive: true });

  let anyFailed = false;
  const puzzles = [];
  for (const file of files) {
    const meta = readYamlMeta(file, stderr);
    if (!meta) {
      anyFailed = true;
      continue;
    }
    const { kind, title } = meta;
    if (!TOOLS[kind]) {
      stderr.write(`Skipping "${path.basename(file)}": unknown kind "${kind}".\n`);
      anyFailed = true;
      continue;
    }
    const outputName = path.basename(file).replace(/\.ya?ml$/i, '.html');
    const outFile = outputDir ? path.join(outputDir, outputName) : null;
    const toolArgs = [file, ...forwardArgs, ...(outFile ? ['-o', outFile] : [])];
    const status = spawnTool(kind, toolArgs, { stdout, stderr });
    if (status !== 0) {
      anyFailed = true;
    } else {
      puzzles.push({ name: outputName, title });
    }
  }

  // Only (re)write the index when at least one puzzle built. Otherwise a failed
  // re-run (e.g. outputs already exist without --force) would clobber a good
  // index with a "No puzzles built yet" placeholder while the HTML is still on disk.
  if (writeIndex && puzzles.length > 0) {
    const indexDir = outputDir ?? dirPath;
    buildIndex(puzzles, indexDir, 'Puzzles', { stdout });
  }

  return anyFailed ? 1 : 0;
}

/**
 * Pure: reads only `args`, writes only to the injected `stdout`/`stderr`,
 * and returns an exit code rather than calling process.exit(). The root
 * cli.js entry point is a thin wrapper that calls this with real
 * process.argv/stdout/stderr and exits with the returned code.
 *
 * Note: this still spawns each per-tool cli.js as a real subprocess
 * (spawnTool) — that boundary is deliberately real, not injected; see the
 * comment above spawnTool().
 *
 * @param {string[]} args
 * @param {object} [deps]
 * @param {{write: Function}} [deps.stdout]
 * @param {{write: Function}} [deps.stderr]
 * @returns {number} exit code
 */
function buildCommand(args, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const helpCode = writeHelpIfRequested(args, HELP, stdout);
  if (helpCode !== null) return helpCode;

  const first = args[0];

  if (fs.existsSync(first) && fs.statSync(first).isDirectory()) {
    return buildDirectory(path.resolve(first), args.slice(1), { stdout, stderr });
  }

  if (/\.ya?ml$/i.test(first)) {
    const meta = readYamlMeta(first, stderr);
    if (!meta) return 1;
    if (!TOOLS[meta.kind]) {
      stderr.write(`Unknown kind "${meta.kind}" in "${path.basename(first)}".\n`);
      stderr.write("Run 'varietypack build --help' for usage.\n");
      return 1;
    }
    return spawnTool(meta.kind, args, { stdout, stderr });
  }

  stderr.write(`Not a YAML file or directory: "${first}"\n`);
  stderr.write("Run 'varietypack build --help' for usage.\n");
  return 1;
}

module.exports = { buildCommand };
