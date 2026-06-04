# Marching Bands

A CLI tool that converts YAML puzzle files into self-contained interactive HTML puzzle pages for the **Marching Bands** variety word puzzle format.

The generated HTML works as a static file — open via `file://` or serve over `http(s)://`.

## Installation

```fish
npm install
```

## Usage

Build a single puzzle:

```fish
varietypack build puzzles/sample.yaml
# → puzzles/sample.html

varietypack build puzzles/sample.yaml -o output/mypuzzle.html
```

Theme flag:

```fish
# dark, high-contrast theme
varietypack build --theme skeleton puzzles/mypuzzle.yaml
```

`--theme` accepts `broadsheet` (default) or `skeleton`.

Build all puzzles in `puzzles/`:

```fish
varietypack build puzzles/
# → puzzles/*.html (output next to YAML inputs)
```

Watch mode (rebuilds on save):

```fish
varietypack watch puzzles/
```

Rebuild the visual-QA fixtures on save (`test/fixtures/*.yaml` → `*.html`):

```fish
node watch-fixtures.js
```

Deploy puzzles to a remote server:

```fish
node deploy.js
# reads deploy.config.json: { "source": "puzzles", "target": "user@host:/path/to/dir" }
```

Run tests:

```fish
node --test test/*.test.js
```

## Puzzle format

See [docs/SPEC.md](docs/SPEC.md) for the full YAML format reference.

A Marching Bands puzzle is played on an N×N grid. Words march in two formations: **Rows** (two or more words per numbered row, reading left to right) and **Bands** (words march clockwise around each concentric rectangular band). Every cell is used once in a Row word and once in a Band word; where one word ends and the next begins within a row or band is for the solver to discover. For odd N, the center cell is a black square belonging to no word.

Quick example (5×5):

```yaml
kind: marching-bands
title: "My Marching Bands"
author: "Your Name"
date: "2026"
size: 5

rows:
  - entries:                    # each row's answers sum to N (= 5)
      - clue: "Unwell"
        answer: "ILL"
      - clue: "All correct"
        answer: "OK"
  # ... 5 rows total; the center row (odd N) sums to N − 1

bands:
  - entries:                    # band 0 (outermost): 4 × (N − 1) = 16 cells
      - clue: "Ski hill"
        answer: "SLOPES"
      - clue: "Settee"
        answer: "DIVAN"
      - clue: "Blackboard stick"
        answer: "CHALK"
  # ... ⌊N/2⌋ bands total; band k sums to 4 × (N − 1 − 2k)
```

N is derived from the first row (the sum of its answer lengths); the optional `size` field is validated against it.

## How it works

1. **Author** writes a YAML file of Row and Band clues and answers
2. **Build step** validates the YAML (row and band cell counts, and that Row and Band words agree on every shared cell), derives all grid geometry from N, and injects everything into a self-contained HTML file
3. **Solver** opens the HTML in any browser and fills in letters cell by cell — a two-segment Row/Band toggle (or clicking the active cell) controls whether typing marches across the row or clockwise around the band

Build with `--muddle` (or from a muddled YAML produced by `varietypack muddle`) to obscure answers: plain-text answers never appear in the generated HTML — only a single SHA-256 hash of the whole board.

## Printing

The generated HTML is print-ready. Use your browser's Print dialog (or Cmd+P / Ctrl+P) to produce a clean puzzle sheet — the Row/Band toggle and Check Cell button are hidden, and all cell highlighting is removed. (Landscape orientation keeps the three-column screen layout; portrait stacks the grid above two clue columns.)
