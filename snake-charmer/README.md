# Snake Charmer

A CLI tool that converts YAML puzzle files into self-contained interactive HTML puzzle pages for the **Snake Charmer** variety word puzzle format.

The generated HTML works as a static file — open via `file://` or serve over `http(s)://`.

## Installation

```fish
npm install
```

## Usage

Build the sample puzzle:

```fish
varietypack build ../examples/snake-charmer.yaml
# → ../examples/snake-charmer.html

varietypack build ../examples/snake-charmer.yaml -o sample.html
```

Shape and theme flags:

```fish
# C-shaped ring
varietypack build --shape turn puzzles/mypuzzle.yaml

# S-shaped ring
varietypack build --shape double-turn puzzles/mypuzzle.yaml

# pure circle (no straight sections)
varietypack build --shape circle puzzles/mypuzzle.yaml

# dark purple theme
varietypack build --theme skeleton puzzles/mypuzzle.yaml
```

`--shape` accepts `circle`, `stadium`, `turn`, or `double-turn`. When omitted, the tool auto-selects: `double-turn` if the ring size supports it, otherwise `stadium`.

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

Deploy puzzles to a remote server:

```fish
node deploy.js
# reads deploy.config.json: { "source": "puzzles", "target": "user@host:/path/to/dir" }
```

Run tests:

```fish
node --test test/*.test.js
```

Preview ring geometry (dev tool):

```fish
node devtools/build-ring-preview.js
# → devtools/ring-preview.html (open in browser)
```

## Puzzle format

See [docs/SPEC.md](docs/SPEC.md) for the full YAML format reference.

Quick example (`puzzles/mypuzzle.yaml`):

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
  # ... at least 3 entries, even total cell count, at least 16 cells (ring size ≥ 8)
```

## How it works

1. **Author** writes a YAML file with clues and answers
2. **Build step** validates the YAML, computes the ring layout (stadium, circle, turn, or double-turn), and injects everything into a self-contained HTML file
3. **Solver** opens the HTML in any browser, fills in letters cell by cell — correct entries are revealed automatically (hashed mode) or via the Check Cell button (plain mode)

In hashed mode (`hashed: true`), plain-text answers never appear in the generated HTML — only SHA-256 hashes.
