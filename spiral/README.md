# Spiral

A CLI tool that converts YAML puzzle files into self-contained interactive HTML puzzle pages for the **Spiral** variety word puzzle format.

The generated HTML works as a static file — open via `file://` or serve over `http(s)://`.

## Installation

```fish
npm install
```

## Usage

Build the sample puzzle:

```fish
varietypack build ../examples/spiral.yaml
# → ../examples/spiral.html

varietypack build ../examples/spiral.yaml -o output/mypuzzle.html
```

Build all puzzles in `puzzles/`:

```fish
varietypack build puzzles/
# → puzzles/*.html (output next to YAML inputs)
```

Watch mode (rebuilds on save):

```fish
varietypack watch puzzles/
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

Quick example:

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
  # ...

outward:
  - clue: "Jeter or Jacobi"
    answer: "DEREK"
  - clue: "Major snowboard manufacturer"
    answer: "BURTON"
  # ...
```

The total normalized cell count of all inward answers must equal the total of all outward answers, and the combined inward string must be the reverse of the combined outward string. Minimum 40 cells.

## How it works

1. **Author** writes a YAML file with inward and outward clues and answers
2. **Build step** validates the YAML, computes an Archimedean spiral cell layout, and injects everything into a self-contained HTML file
3. **Solver** opens the HTML in any browser and fills in letters cell by cell — a two-segment Inward/Outward toggle controls the active direction; pressing ArrowLeft/Shift+Tab while on Inward (or ArrowRight/Tab while on Outward) switches direction

Build with `--muddle` (or from a muddled YAML produced by `varietypack muddle`) to obscure answers: plain-text answers never appear in the generated HTML — only a single SHA-256 board hash.

## Printing

The generated HTML is print-ready. Use your browser's Print dialog (or Cmd+P / Ctrl+P) to produce a clean puzzle sheet — the Inward/Outward toggle and Check Cell button are hidden, and all cell highlighting is removed.
