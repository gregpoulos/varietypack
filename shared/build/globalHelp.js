'use strict';

// Help text for options that every tool CLI supports.
const GLOBAL_OPTIONS = `\
  --theme <name>    Visual theme: broadsheet (default), skeleton
  --minify          Minify the output HTML (terser-minifies scripts; strips comments + trailing whitespace)
  -o <output.html>  Output path (default: <input-basename>.html next to input)
  -f, --force       Overwrite output file if it already exists
  -h, --help        Show this help`;

module.exports = { GLOBAL_OPTIONS };
