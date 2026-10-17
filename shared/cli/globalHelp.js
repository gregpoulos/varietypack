'use strict';

const { VALID_THEMES } = require('../build/themeRegistry');

// Width of the flag column in --help output; a wider label is followed by two spaces.
const FLAG_COLUMN = 19;

// The `Options:` lines for a util.parseArgs options object, so a CLI's help can't
// drift from what it parses. Each option needs a `description` (a '\n' continues
// under the help column); a string option's `arg` names its value, as in `-o <arg>`.
function formatOptionsHelp(options) {
  return Object.entries(options).map(([name, option]) => {
    const flags = option.short ? `-${option.short}, --${name}` : `--${name}`;
    if (typeof option.description !== 'string') throw new Error(`option --${name} has no description`);
    const label = option.type === 'string' ? `${flags} <${option.arg}>` : flags;
    const indent = ' '.repeat(2 + FLAG_COLUMN + 2);
    const [first, ...rest] = option.description.split('\n');
    return [`  ${label.padEnd(FLAG_COLUMN)}  ${first}`, ...rest.map(l => indent + l)].join('\n');
  }).join('\n');
}

// util.parseArgs options for the flags every tool CLI supports; a tool spreads
// in its own beside them. Key order is only the order --help lists them in.
const GLOBAL_OPTIONS = {
  muddle: { type: 'boolean',
    description: 'Build a hashed (answer-obscured) HTML without needing hashed: in the YAML' },
  theme: { type: 'string', arg: 'name',
    description: `Visual theme: ${VALID_THEMES.join(', ')} (default: the YAML's theme:, else broadsheet)` },
  font: { type: 'string', arg: 'mode',
    description: 'Font delivery for custom-font themes (default: embed): embed (self-contained) or link (CDN, requires network on every solve)' },
  'embed-origin': { type: 'string', arg: 'origin',
    description: 'Post solves, with the solution, to this parent origin only (for embedding)' },
  minify: { type: 'boolean',
    description: 'Minify the output HTML (terser-minifies scripts, clean-css minifies styles; strips comments + trailing whitespace)' },
  output: { type: 'string', short: 'o', arg: 'file',
    description: 'Output path (default: <input-basename>.html next to input)' },
  force: { type: 'boolean', short: 'f',
    description: 'Overwrite output file if it already exists' },
};

// Help-only: writeHelpIfRequested handles -h/--help before any parsing.
const HELP_OPTION = { help: { type: 'boolean', short: 'h', description: 'Show this help' } };

// Help text for options that every tool CLI supports.
const GLOBAL_OPTIONS_HELP = formatOptionsHelp({ ...GLOBAL_OPTIONS, ...HELP_OPTION });

// Every subcommand's help check: no args writes helpText and returns 1, a leading
// -h/--help writes it and returns 0, anything else writes nothing and returns
// null so the caller carries on. Only a *leading* flag counts as a help request.
function writeHelpIfRequested(args, helpText, stdout) {
  if (args.length === 0) { stdout.write(helpText); return 1; }
  if (args[0] === '--help' || args[0] === '-h') { stdout.write(helpText); return 0; }
  return null;
}

module.exports = { GLOBAL_OPTIONS, GLOBAL_OPTIONS_HELP, HELP_OPTION, formatOptionsHelp, writeHelpIfRequested };
