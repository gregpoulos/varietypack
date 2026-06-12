'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { spawnSync } = require('child_process');
const { TOOLS } = require('./toolRegistry');
const { GLOBAL_OPTIONS } = require('./globalHelp');
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

function readYamlMeta(filePath) {
  const name = path.basename(filePath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`File not found: "${filePath}"`);
      process.exit(1);
    }
    throw err;
  }
  let doc;
  try {
    doc = yaml.load(content);
  } catch (err) {
    console.error(`Could not parse "${name}" as YAML: ${err.message}`);
    return null;
  }
  if (typeof doc?.kind !== 'string') {
    console.error(`No "kind" field found in "${name}".`);
    return null;
  }
  return {
    kind: doc.kind,
    title: typeof doc.title === 'string' ? doc.title : path.basename(filePath, path.extname(filePath)),
  };
}

function spawnTool(kind, toolArgs) {
  const result = spawnSync('node', [path.join(TOOLS[kind].dir, 'cli.js'), ...toolArgs], {
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function buildDirectory(dirPath, remainingArgs) {
  let outputDir = null;
  let writeIndex = false;
  const forwardArgs = [];
  for (let i = 0; i < remainingArgs.length; i++) {
    if (remainingArgs[i] === '-o') {
      if (i + 1 >= remainingArgs.length) {
        console.error('Error: -o requires a value.');
        process.exit(1);
      }
      outputDir = path.resolve(remainingArgs[++i]);
    } else if (remainingArgs[i] === '--build-index') {
      writeIndex = true;
    } else {
      forwardArgs.push(remainingArgs[i]);
    }
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => /\.ya?ml$/i.test(f))
    .sort()
    .map(f => path.join(dirPath, f));

  if (files.length === 0) {
    console.error(`No YAML files found in "${dirPath}".`);
    process.exit(1);
  }

  if (outputDir) fs.mkdirSync(outputDir, { recursive: true });

  let anyFailed = false;
  const puzzles = [];
  for (const file of files) {
    const meta = readYamlMeta(file);
    if (!meta) {
      anyFailed = true;
      continue;
    }
    const { kind, title } = meta;
    if (!TOOLS[kind]) {
      console.error(`Skipping "${path.basename(file)}": unknown kind "${kind}".`);
      anyFailed = true;
      continue;
    }
    const outputName = path.basename(file).replace(/\.ya?ml$/i, '.html');
    const outFile = outputDir ? path.join(outputDir, outputName) : null;
    const toolArgs = [file, ...forwardArgs, ...(outFile ? ['-o', outFile] : [])];
    const status = spawnTool(kind, toolArgs);
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
    buildIndex(puzzles, indexDir, 'Puzzles');
  }

  process.exit(anyFailed ? 1 : 0);
}

function buildCommand(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(HELP);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const first = args[0];

  if (fs.existsSync(first) && fs.statSync(first).isDirectory()) {
    buildDirectory(path.resolve(first), args.slice(1));
    return;
  }

  if (/\.ya?ml$/i.test(first)) {
    const meta = readYamlMeta(first);
    if (!meta) process.exit(1);
    if (!TOOLS[meta.kind]) {
      console.error(`Unknown kind "${meta.kind}" in "${path.basename(first)}".`);
      console.error("Run 'varietypack build --help' for usage.");
      process.exit(1);
    }
    process.exit(spawnTool(meta.kind, args));
  }

  console.error(`Not a YAML file or directory: "${first}"`);
  console.error("Run 'varietypack build --help' for usage.");
  process.exit(1);
}

module.exports = { buildCommand };
