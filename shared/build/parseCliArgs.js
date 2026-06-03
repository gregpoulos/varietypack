'use strict';

function formatAllowlist(values) {
  if (values.length === 1) return `"${values[0]}"`;
  if (values.length === 2) return `"${values[0]}" or "${values[1]}"`;
  return values.slice(0, -1).map(v => `"${v}"`).join(', ') + `, or "${values[values.length - 1]}"`;
}

// flagSpecs: [{ flag: '-o'|['-f','--force'], name: 'output', values?: ['a','b'], boolean?: true }, ...]
// Returns: { flags: { [name]: string|true|undefined }, positionals: string[] }
// Throws Error for dangling flags or invalid values.
function parseCliArgs(args, flagSpecs) {
  const flagIndices = new Set();
  const flags = {};

  for (const spec of flagSpecs) {
    const flagNames = Array.isArray(spec.flag) ? spec.flag : [spec.flag];
    let firstIdx = -1;

    for (const f of flagNames) {
      const idx = args.indexOf(f);
      if (idx !== -1) {
        flagIndices.add(idx);
        if (firstIdx === -1) {
          firstIdx = idx;
        } else if (!spec.boolean && idx + 1 < args.length) {
          // Non-primary alias: consume its value slot so it doesn't leak into positionals
          flagIndices.add(idx + 1);
        }
      }
    }

    if (firstIdx === -1) {
      flags[spec.name] = undefined;
      continue;
    }

    if (spec.boolean) {
      flags[spec.name] = true;
      continue;
    }

    if (firstIdx + 1 >= args.length) {
      throw new Error(`Error: ${flagNames[0]} requires a value.`);
    }
    const value = args[firstIdx + 1];
    if (spec.values && !spec.values.includes(value)) {
      throw new Error(
        `Invalid ${flagNames[0]} value "${value}". Must be ${formatAllowlist(spec.values)}.`
      );
    }
    flags[spec.name] = value;
    flagIndices.add(firstIdx + 1);
  }

  const positionals = args.filter((_, i) => !flagIndices.has(i));
  for (const pos of positionals) {
    if (pos.startsWith('-')) {
      throw new Error(`Error: unknown flag ${pos}.`);
    }
  }
  return { flags, positionals };
}

module.exports = parseCliArgs;
