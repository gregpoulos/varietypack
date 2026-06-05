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

# Produce a muddled YAML (answers obscured) for distribution
varietypack muddle puzzle.yaml
```

The `varietypack` dispatcher reads the `kind` field from each YAML and routes to the correct tool automatically. In directory mode, all YAML files are built; files without a recognised `kind` are skipped with a warning.

### Muddling puzzles

`varietypack muddle <file.yaml>` produces a **muddled YAML** — a distributable version of a puzzle where each entry's `answer:` is replaced by `length:`, and `hashed: true` plus a single `boardHash:` (SHA-256 of all normalized answer letters concatenated) are added at the top level. The muddled file can be shared with collaborators or test-solvers who need to build the HTML themselves without seeing the answers. Building a muddled YAML always produces answer-obscured HTML.

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

## Puzzle formats

### Snake Charmer

N numbered answers fill a continuous snake-shaped loop of cells. Each answer starts at its numbered cell and proceeds clockwise; the loop is closed so the last answer ends where the first begins.

```yaml
kind: snake-charmer
title: "My Snake Charmer"
author: "Your Name"
date: "2025"
entries:
  - clue: "Promenade"
    answer: "MALL"
  - clue: "Mislead"
    answer: "LIE TO"
  # at least 3 entries, even total cell count, at least 16 cells (ring size ≥ 8)
```

`--shape` accepts `circle`, `stadium`, `turn`, or `double-turn`. When omitted, the tool auto-selects `double-turn` if the ring size supports it, otherwise `stadium`. The `shape` field in the YAML sets a default that the `--shape` flag overrides.

See [snake-charmer/docs/SPEC.md](snake-charmer/docs/SPEC.md) for the full format reference.

### Spiral

Two sets of entries share every cell: inward entries fill the spiral from the outer edge toward the center; outward entries fill it from the center back out. The combined inward string must be the reverse of the combined outward string. Minimum 40 cells. The generated HTML is print-ready.

```yaml
kind: spiral
title: "My Spiral"
author: "Your Name"
date: "2026"

inward:
  - clue: "Indian flatbread"
    answer: "ROTI"
  - clue: "Guitar pedal that generates a spectral glide"
    answer: "WAH-WAH"

outward:
  - clue: "Jeter or Jacobi"
    answer: "DEREK"
  - clue: "Major snowboard manufacturer"
    answer: "BURTON"
```

See [spiral/docs/SPEC.md](spiral/docs/SPEC.md) for the full format reference.

### Marching Bands

An N×N grid where words march in two formations: **Rows** (two or more words per numbered row, reading left to right) and **Bands** (words march clockwise around each concentric rectangular band). Every cell belongs to exactly one Row word and one Band word; where words begin and end within a row or band is for the solver to discover. For odd N, the center cell is a black square. The generated HTML is print-ready.

```yaml
kind: marching-bands
title: "My Marching Bands"
author: "Your Name"
date: "2026"
size: 5

rows:
  - entries:
      - clue: "Unwell"
        answer: "ILL"
      - clue: "All correct"
        answer: "OK"
  # 5 rows total; each row's answers sum to N (center row sums to N−1 for odd N)

bands:
  - entries:
      - clue: "Ski hill"
        answer: "SLOPES"
      - clue: "Settee"
        answer: "DIVAN"
      - clue: "Blackboard stick"
        answer: "CHALK"
  # ⌊N/2⌋ bands total; band k's answers sum to 4×(N−1−2k)
```

N is derived from the first row (the sum of its answer lengths); the optional `size` field is validated against it.

See [marching-bands/docs/SPEC.md](marching-bands/docs/SPEC.md) for the full format reference.

---

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
