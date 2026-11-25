'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const parseCliArgs = require('./parseCliArgs');
const { HELP_OPTION, formatOptionsHelp, writeHelpIfRequested } = require('./globalHelp');

const ROOT = path.resolve(__dirname, '../..');
const STUDIO_BUILD = path.join(ROOT, 'studio', 'build.js');
const DEFAULT_OUTPUT = path.join(ROOT, 'studio', 'build', 'index.html');

const OPTIONS = {
  output: { type: 'string', short: 'o', arg: 'file',
    description: 'Write the studio page here (default: studio/build/index.html)' },
  force: { type: 'boolean', short: 'f',
    description: 'Overwrite the -o file if it already exists' },
  'no-open': { type: 'boolean',
    description: 'Build only; don\'t open the page in a browser' },
};

const HELP = `Build the studio and open it in your default browser.

Usage: varietypack studio [options]

Options:
${formatOptionsHelp({ ...OPTIONS, ...HELP_OPTION })}

The studio is one self-contained page that runs from disk, so there is no server to
stop: rebuild with this command to pick up source changes, then reload the tab.
`;

// The platform's "open this file with its default app" command. Windows uses explorer
// rather than `cmd /c start`, which would reinterpret & ^ | in the path.
function openerFor(platform) {
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'explorer.exe';
  return 'xdg-open';
}

// Returns an error message, or null once the opener has started. The opener is detached
// and never waited on: xdg-open can run the browser in the foreground, which would hold
// the terminal until the browser exits. A spawn that fails to start has no pid.
function openInBrowser(file, platform = process.platform) {
  const cmd = openerFor(platform);
  const child = spawn(cmd, [file], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  if (child.pid === undefined) return `Could not open ${file} with "${cmd}"; open it yourself.`;
  return null;
}

// A fresh process runs the studio's own build CLI, so this command shares its output
// and errors and never loads the bundler into cli.js.
function buildStudio(out) {
  return spawnSync(process.execPath, [STUDIO_BUILD, '-o', out], { encoding: 'utf8' });
}

// Returns the exit code; never exits (see main() in cli.js). `open` and `build` are
// injectable so tests can see the calls without launching a browser or bundling.
function studioCommand(args, { stdout = process.stdout, stderr = process.stderr, open = openInBrowser, build = buildStudio } = {}) {
  // Unlike the other subcommands, bare `studio` is a complete command, not a request for
  // help, so the helper's no-arguments rule is skipped.
  const helpCode = args.length === 0 ? null : writeHelpIfRequested(args, HELP, stdout);
  if (helpCode !== null) return helpCode;

  let values;
  try {
    ({ values } = parseCliArgs(args, OPTIONS, { maxPositionals: 0 }));
  } catch (err) {
    stderr.write(`Error: ${err.message}\n`);
    return 1;
  }

  // An -o file is the author's and needs --force to replace; the default output is the
  // studio's own gitignored build, which this command exists to refresh.
  const out = values.output !== undefined ? path.resolve(values.output) : DEFAULT_OUTPUT;
  if (values.output !== undefined && !values.force && fs.existsSync(out)) {
    stderr.write(`Error: output file already exists: ${out}\nUse -f or --force to overwrite.\n`);
    return 1;
  }

  // Build, passing on the build's own output, and say why when it couldn't run at all.
  const built = build(out);
  stdout.write(built.stdout ?? '');
  stderr.write(built.stderr ?? '');
  if (built.error || built.signal) {
    const why = built.error ? built.error.message : `killed by ${built.signal}`;
    stderr.write(`Error: the studio build didn't run: ${why}\n`);
    return 1;
  }
  if (built.status !== 0) return 1;

  if (!values['no-open']) {
    const problem = open(out);
    if (problem) {
      stderr.write(`${problem}\n`);
      return 1;
    }
  }
  return 0;
}

module.exports = { studioCommand, openerFor, DEFAULT_OUTPUT };
