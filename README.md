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

# Produce a muddled YAML (answers replaced by hashes) for distribution
varietypack muddle puzzle.yaml
```

The `varietypack` dispatcher reads the `kind` field from each YAML and routes to the correct tool automatically. In directory mode, all YAML files are built; files without a recognised `kind` are skipped with a warning.

### Muddling puzzles

`varietypack muddle <file.yaml>` produces a **muddled YAML** — a distributable version of a puzzle where each entry's `answer:` is replaced by `hash:` + `length:`. The muddled file can be shared with collaborators or test-solvers who need to build the HTML themselves without seeing the answers. The built HTML is always answer-obscured (equivalent to `hashed: true`).

```fish
# Produce puzzle.muddled.yaml next to the source
varietypack muddle puzzle.yaml

# Write to a specific path
varietypack muddle puzzle.yaml -o dist/puzzle.yaml

# Overwrite an existing muddled file
varietypack muddle puzzle.yaml -f
```

The puzzle must be valid before it can be muddled. `varietypack validate` runs automatically as part of the muddle step.

### Global options

These are supported by every tool:

| Option | Default | Description |
|---|---|---|
| `--muddle` | off | Build a hashed (answer-obscured) HTML from a source YAML — no `hashed:` field needed. Muddled YAMLs (which carry `boardHash:`) build hashed automatically without this flag. |
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
