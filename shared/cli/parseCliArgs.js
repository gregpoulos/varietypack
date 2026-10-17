'use strict';

const { parseArgs } = require('node:util');

// Node's util.parseArgs (strict), plus the one check it lacks: a cap on
// positionals, so `validate a.yaml b.yaml` fails instead of quietly checking
// only a.yaml. `options` is util.parseArgs's own format; the extra `arg` and
// `description` keys that globalHelp.js's formatOptionsHelp reads are ignored here.
// Returns { values, positionals }; throws on unknown flags, missing or
// ambiguous values (`-o --minify`), and too many positionals.
function parseCliArgs(args, options, { maxPositionals = Infinity } = {}) {
  const { values, positionals } = parseArgs({ args, options, allowPositionals: maxPositionals > 0 });
  if (positionals.length > maxPositionals) {
    throw new Error(`Unexpected argument '${positionals[maxPositionals]}'.`);
  }
  return { values, positionals };
}

module.exports = parseCliArgs;
