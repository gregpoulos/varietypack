'use strict';

const { VALID_THEMES } = require('./themeRegistry');

// Help text for options that every tool CLI supports.
const GLOBAL_OPTIONS = `\
  --muddle          Build a hashed (answer-obscured) HTML without needing hashed: in the YAML
  --theme <name>    Visual theme: ${VALID_THEMES.join(', ')} (default: broadsheet)
  --font <mode>     Font delivery for custom-font themes: embed (self-contained) or link (CDN, requires network on every solve)
  --minify          Minify the output HTML (terser-minifies scripts, clean-css minifies styles; strips comments + trailing whitespace)
  -o <output.html>  Output path (default: <input-basename>.html next to input)
  -f, --force       Overwrite output file if it already exists
  -h, --help        Show this help`;

// parseCliArgs specs for the flags every tool CLI supports. Spread into each
// tool's parseCliArgs call alongside any tool-specific flags (parseCliArgs
// matches by flag name, so order is irrelevant). Kept in lockstep with
// GLOBAL_OPTIONS above — both are views of the same cross-tool flag contract.
const GLOBAL_FLAG_SPECS = [
  { flag: '-o',              name: 'output' },
  { flag: '--theme',         name: 'theme',  values: VALID_THEMES },
  { flag: '--font',          name: 'font',   values: ['embed', 'link'] },
  { flag: ['-f', '--force'], name: 'force',  boolean: true },
  { flag: '--minify',        name: 'minify', boolean: true },
  { flag: '--muddle',        name: 'muddle', boolean: true },
];

module.exports = { GLOBAL_OPTIONS, GLOBAL_FLAG_SPECS };
