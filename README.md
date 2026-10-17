# varietypack

A monorepo of variety word puzzle generators.

**[Try the examples online](https://gregpoulos.github.io/varietypack/examples/)**

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

# Validate a puzzle file, or every puzzle in a directory, without building
varietypack validate puzzle.yaml

# Produce a muddled YAML (answers obscured) for distribution
varietypack muddle puzzle.yaml
```

The `varietypack` dispatcher reads the `kind` field from each YAML and routes to the correct tool automatically. In directory mode, all YAML files are built; files without a recognized `kind` are skipped with a warning.

### Muddling puzzles

`varietypack muddle <file.yaml>` produces a **muddled YAML** — a distributable version of a puzzle where each entry's `answer:` is replaced by `length:` (a cell count — a bracketed rebus group like `[HAR]` counts as one cell, not three letters), and `hashed: true`, `format: 2`, plus a single `boardHash:` (SHA-256 of the board's cells, each normalized individually and joined with a delimiter) are added at the top level. The muddled file can be shared with collaborators or test-solvers who need to build the HTML themselves without seeing the answers. Building a muddled YAML always produces answer-obscured HTML.

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
| `--theme <name>` | the YAML's `theme:`, else `broadsheet` | Visual theme; overrides the YAML's `theme:` field. The theme list is shared across all tools (see `docs/AUTHORING.md` → "Themes and fonts"); all tools ship at least `broadsheet` and `skeleton`. |
| `--font <mode>` | `embed` | Font delivery for custom-font themes: `embed` inlines fonts as base64 (self-contained output) or `link` references a CDN via `@import` (needs network at solve time). Defaults to `embed` (or `link` for a theme with no local font files); ignored for system-font themes. |
| `--embed-origin <origin>` | off | Post the completion message, including the solution, to this one parent origin (e.g. `https://hunt.example.com`) and no other, for embedding. Meaningful with `--muddle`: the host can check the solution against the `boardHash`. |
| `--minify` | off | Minify the generated HTML: terser-minifies each `<script>`, clean-css minifies each `<style>`, strips comments, and trims trailing whitespace. |
| `-o`, `--output <file>` | `<input-basename>.html` | Output path. Defaults to writing next to the input file. |
| `-f`, `--force` | off | Overwrite the output file if it already exists. |

### Tool-specific options

Some tools accept additional options. When building a directory, each applies only to the puzzles of that kind, so `--shape` reshapes the Snake Charmers and the other puzzles ignore it; given to a single puzzle of another kind, it's an error.

| Tool | Options |
|---|---|
| `snake-charmer` | `--shape circle\|stadium\|turn\|double-turn` |

---

## Puzzle formats

Every tool's `clue` field, and the top-level `instructions` field, accept a small markdown subset: `**bold**`, `*italic*`, `` `code` ``, `[text](url)` links, `~~strikethrough~~`, `H~2~O`-style subscript, `29^th^`-style superscript, and `:shortcode:` emoji. Rendering happens at build time, so the shipped puzzle HTML has no runtime markdown dependency.

See [docs/AUTHORING.md](docs/AUTHORING.md) for the full cross-tool authoring guide — common header fields, this markdown subset, normalization, cell styles, rebus bracket grammar, muddling/hashed builds, and themes/fonts — shared by all four formats below.

### Snake Charmer

N numbered answers fill a continuous snake-shaped loop of cells. Each answer starts at its numbered cell and proceeds clockwise; the loop is closed so the last answer ends where the first begins. **[Try an example](https://gregpoulos.github.io/varietypack/examples/snake-charmer.html)**

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

Two sets of entries share every cell: inward entries fill the spiral from the outer edge toward the center; outward entries fill it from the center back out. The inward cells, read in order, must be the reverse of the outward cells. Minimum 40 cells. The generated HTML is print-ready. **[Try an example](https://gregpoulos.github.io/varietypack/examples/spiral.html)**

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

An N×N grid where words march in two formations: **Rows** (two or more words per numbered row, reading left to right) and **Bands** (words march clockwise around each concentric rectangular band). Every cell belongs to exactly one Row word and one Band word; where words begin and end within a row or band is for the solver to discover. For odd N, the center cell is a black square. The generated HTML is print-ready. **[Try an example](https://gregpoulos.github.io/varietypack/examples/marching-bands.html)**

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

N is derived from the first row (the sum of its entry cell counts); the optional `size` field is validated against it.

See [marching-bands/docs/SPEC.md](marching-bands/docs/SPEC.md) for the full format reference.

### Crushword

A rebus crossword: standard American crossword grid and clue numbering (across/down, black squares), plus the repo-wide rebus convention that a bracketed group in an `answer:` occupies a single cell however many letters it holds. Tab jumps between entries (not rows or bands) since a crossword's numbering already reveals entry boundaries to the solver. **[Try an example](https://gregpoulos.github.io/varietypack/examples/crushword.html)**

```yaml
kind: crushword
title: "My Crushword"
author: "Your Name"
date: "2026"
grid:
  - "...#."
  - "....."
  - "....."
  - "....."
  - ".#..."
across:
  1:
    clue: "First three letters"
    answer: "ABC"
  # ... keyed by clue number, matching the grid's derived numbering
down:
  1:
    clue: "First column"
    answer: "AEIMR"
  # ... keyed by clue number, matching the grid's derived numbering
```

`grid` uses `.` for an open cell and `#` for a block; clue numbers are derived from the grid (standard American crossword numbering) and must match `across`/`down`'s keys exactly. `maxCellLetters` (optional, default 3) bounds how many letters one bracketed rebus cell may hold.

See [crushword/docs/SPEC.md](crushword/docs/SPEC.md) for the full format reference.

---

## Themes

All tools share one set of themes. A theme controls colors, fonts, and decorative styling — never layout. Select one with the YAML's `theme:` field or `--theme <name>`, which overrides it (default `broadsheet`). The repo ships `broadsheet` (warm newsprint, system serif) and `skeleton` (dark, custom display font).

**Creating a theme** is two steps:

1. Add `shared/themes/<name>-tokens.css` — a `:root { … }` block overriding only the `--theme-*` variables that differ from the neutral defaults in `shared/themes/theme-base.css`. Tool-agnostic component styles in `theme-components.css` pick up the rest, so no per-tool CSS is needed.
2. Register the name in `THEME_REGISTRY` in `shared/build/themeRegistry.js`.

**Fonts.** A system-font-only theme registers `{ fonts: null }` and needs nothing else. To ship a custom font, commit the `.woff2` to `shared/themes/fonts/<name>/` and declare it in the registry entry:

```js
skeleton: {
  fonts: {
    faces: [{ family: 'Outfit', weight: '100 900', style: 'normal', file: 'fonts/skeleton/outfit-variable.woff2' }],
    cdn:   { source: 'google', url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap' },
  },
},
```

Custom-font themes take a `--font` mode (default `embed`, or `link` for a theme with no local font files):

- `--font embed` — base64-inlines `faces` into `@font-face`; the HTML stays self-contained (no network at solve time) at the cost of the font's bytes in every file.
- `--font link` — emits an `@import` to `cdn.url`; smaller HTML, but the font loads from the CDN in the solver's browser on every open.

Declare `faces` for embed, `cdn` for link, or both. The flag is silently ignored for system-font themes.

---

## Studio

The studio is a browser page for composing puzzles without the command line. Open or create a puzzle of any kind, edit its YAML with live problem checking, test-solve the built puzzle page, and export it. It runs the same build path as the CLI, in the page, so what it builds is byte-identical to what `varietypack build` writes; nothing is sent anywhere.

Build it once, then open it from disk or host the single file anywhere:

```fish
npm install
npm run build:studio    # writes studio/build/index.html
```

What it does today:

- **A structured editor for every kind**: type letters onto the real board (the spiral, the ring, the grid), split entries where you want them (Crushword: place blocks as you go, with an optional symmetry lock and live numbering), and clue them in a panel beside the board. New puzzles start from a chosen size; opening a source file imports it into the editor, and it exports a file that builds the same page.
- **YAML mode for every kind**, for power users and for files the editor can't represent, starting from a kind's example, an opened `.yaml` file, or a saved draft.
- **Live problems list** (the same validators as `varietypack validate`) and a **sandboxed preview** you can test-solve, with a "test-solved in m:ss" badge.
- **Export** of the puzzle page, the puzzle page with answers hidden, the source YAML (verbatim) and the muddled YAML. Nothing exports while the puzzle has errors.
- **Drafts** saved automatically in the browser (answers in plain text), plus a draft file to keep a copy or move computers.
- **Build-only mode** for a muddled YAML someone sends you: pick a theme, test-solve it, and build its page without ever seeing the answers.

---

## Embedding puzzles

A puzzle page can sit in an iframe on another site, such as a puzzle hunt, and tell that site when it's solved. In the studio, Export → *Puzzle page for embedding* asks for the host site's origin and gives you the page plus the snippet to paste; from the command line, build with `--muddle --embed-origin <origin>`.

```html
<iframe src="puzzle.hashed.html" title="My puzzle" data-varietypack style="width:100%;border:0;min-height:480px"></iframe>
<script>
addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'varietypack:resize') return;
  document.querySelectorAll('iframe[data-varietypack]').forEach(function (f) {
    if (f.contentWindow === e.source) f.style.height = e.data.height + 'px';
  });
});
</script>
```

The page posts `varietypack:resize` whenever its height changes, so the frame fits it. When the solver finishes, it posts one `varietypack:complete` message, with the `solution`, to the origin you named and to nobody else.

To verify a solve on the host's server: check that `e.origin` is the puzzle's origin, then check `sha256hex(solution) === boardHash`, using the `boardHash` from the puzzle's muddled YAML. The server never needs the answers. Only the answers-hidden (`--muddle`) page gives a verifiable solve: a plain page ships its answers, so a posted solution proves nothing. Whether a solver's progress is kept inside a cross-origin iframe depends on the browser, and hasn't been checked. A puzzle can also override theme tokens to match the host site: see [docs/AUTHORING.md](docs/AUTHORING.md) → "Theme overrides".

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
node --test crushword/test/*.test.js
node --test shared/test/*.test.js
```

End-to-end (Playwright) tests are separate from `npm test`:

```fish
npm run test:e2e
```
