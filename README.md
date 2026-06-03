# varietypack

A monorepo of variety word puzzle generators.

## Usage

```fish
# Build a single puzzle (kind auto-detected from the YAML's `kind` field)
varietypack build puzzle.yaml

# Build all YAML puzzles in a directory (output next to each input)
varietypack build examples/

# Build all YAML puzzles into a specific output directory
varietypack build examples/ -o out/

# Build all YAML puzzles and write an index.html linking them
varietypack build examples/ --build-index

# Watch a directory for changes and rebuild automatically
varietypack watch examples/

# Validate one or more puzzle files without building
varietypack validate puzzle.yaml
```

The `varietypack` dispatcher reads the `kind` field from each YAML and routes to the correct tool automatically. In directory mode, all YAML files are built; files without a recognised `kind` are skipped with a warning.

### Global options

These are supported by every tool:

| Option | Default | Description |
|---|---|---|
| `--theme <name>` | `broadsheet` | Visual theme. All tools ship `broadsheet` and `skeleton`; the exact list may vary per tool. |
| `--minify` | off | Minify the generated HTML: terser-minifies each `<script>`, strips comments, and trims trailing whitespace. |
| `-o <output.html>` | `<input-basename>.html` | Output path. Defaults to writing next to the input file. |
| `-f`, `--force` | off | Overwrite the output file if it already exists. |

### Tool-specific options

Some tools accept additional options. Pass them after the path argument.

| Tool | Options |
|---|---|
| `snake-charmer` | `--shape circle\|stadium\|turn\|double-turn` |

---

## Tools

| Tool | Status | Description |
|---|---|---|
| `snake-charmer/` | Active | Converts YAML puzzle definitions into self-contained HTML Snake Charmer puzzles |
| `spiral/` | Active | Converts YAML puzzle definitions into self-contained HTML Spiral puzzles |
| `marching-bands/` | Active | Converts YAML puzzle definitions into self-contained HTML Marching Bands puzzles |

## Testing

Run all tests from the repo root:

```fish
npm test
```

Or run tests for a single tool:

```fish
node --test snake-charmer/test/*.test.js
node --test spiral/test/*.test.js
node --test marching-bands/test/*.test.js
node --test shared/test/*.test.js
```

## Shared library

Utilities in `shared/` use the dual-mode export pattern so they work in both Node (CommonJS `require`) and the browser (global functions injected by the build step):

```js
function normalize(str) { /* ... */ }
if (typeof module !== 'undefined') module.exports = normalize;
```

See each tool's `README.md` for puzzle-specific context.
