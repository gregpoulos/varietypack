# Crushword — YAML Format Reference

A Crushword puzzle file is a YAML file describing a standard American crossword: a rectangular grid of open and blocked cells, with clues keyed by the grid's derived numbering, in two directions — **Across** and **Down**. Unlike Marching Bands, entry boundaries are visible to the solver (the numbering itself reveals where each entry starts), so navigation and clue lists work per-entry rather than per-row/band.

Common header fields (`kind`, `title`, `author`, `date`, `instructions`),
common entry fields (`clue`, `answer`, `styles`), markdown syntax,
normalization, cell styles, rebus bracket grammar, muddling, themes, and
CLI usage are all covered in `docs/AUTHORING.md` — this file covers only
what's specific to Crushword.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"crushword"` |
| `maxCellLetters` | no | integer (default 3) | Bounds how many letters a single bracketed rebus cell may hold. Checked only against source (non-muddled) puzzles — a muddled entry has no plaintext left to measure. |
| `grid` | yes | array of strings | Equal-length rows; `.` is an open cell, `#` is a block. At least one open cell is required. |
| `across` | yes | object | Keyed by clue number (not an array) — see "Grid numbering" below |
| `down` | yes | object | Keyed by clue number (not an array) — see "Grid numbering" below |

## Rebus cells (multi-letter cells)

See `docs/AUTHORING.md` → "Rebus cells" for the bracket syntax and grammar.
Crushword has no separate rebus mode or Rebus button — see "Solving a rebus
cell" below for how it differs from the other three tools.

**Crushword's rule — a crossing Across and Down entry must bracket their shared square identically.** The build cross-checks every board cell where an across and a down slot cross, and rejects the puzzle if the across entry's cell and the down entry's cell disagree — cell for cell, not merely letter for letter split some other way.

**`maxCellLetters`** (default 3) additionally bounds how many letters one bracketed cell may hold — the only tool-level cap on rebus cell width in this repo. It is checked only against source (non-muddled) puzzles.

**Solving a rebus cell.** There's no separate mode to open — a solver just types a cell's letters and moves on when ready, whether that cell needs one letter or several; a thin vertical caret marks where the next keystroke will land. The Left/Right arrow keys move that caret one letter at a time within the cell before crossing into the next or previous one, so fixing a single wrong letter in the middle of a group doesn't require retyping the rest. Moving to another cell — Tab, Space, Enter, or a click elsewhere — confirms whatever's typed there, and a cell also advances on its own once it reaches `maxCellLetters`. Space advances to the next cell landing at its front, treating anything past the cursor in the cell just left as a stale guess and clearing it first. Enter (and Shift+Enter, which moves to the previous cell instead) always keeps everything typed and lands at the end of the target cell's content rather than its front. Typing inserts at the caret while a cell still has room to grow — even one already holding a single letter — so revisiting an established cell and typing adds to it rather than replacing it; only once a cell reaches `maxCellLetters` does typing at the caret overwrite in place instead.

Bracket grammar, error and warning conditions, and how cell counts feed the across/down length checks: see `docs/CROSS_TOOL_SPEC.md` → "Rebus cells".

## Grid numbering

Numbering follows standard American crossword convention: a cell is numbered when it starts a run of **two or more** open cells in either direction — a length-1 run gets no number of its own, since it carries no information beyond whatever crosses it. The same number can open both an across and a down slot at once.

`across` and `down`'s keys must exactly match this derived numbering. The validator reports both missing and unexpected numbers by name, and rejects a non-canonical key (e.g. `"04"`) even when it coerces to the same number as the correct one.

Not every open cell necessarily has an entry in both directions — a cell whose horizontal run is length 1 has no across entry, only a down one (and vice versa). The engine auto-flips the active direction when navigation lands on such a cell, so the highlighted entry always exists there.

## Validation rules

- `kind` must be exactly `"crushword"`
- `title` must be a non-empty string
- `grid` must be a non-empty array of equal-length strings containing only `.` and `#`, with at least one open cell
- `maxCellLetters`, if given, must be a positive integer
- `across` and `down` must each be an object keyed by clue number (arrays and non-objects are rejected)
- The grid must produce at least one across slot and one down slot
- Every open cell must belong to at least one across or down entry — an open square boxed in by blocks (or the grid edge) on all four sides has no clue that could fill it
- `across`'s and `down`'s keys must exactly match the grid's derived numbering — missing and unexpected numbers are reported separately
- Each slot's cell count (from grid geometry) must match its entry's parsed answer cell count
- Non-muddled only: no rebus cell may exceed `maxCellLetters` letters
- Non-muddled only, once every earlier check is clean: at every board cell where an across and a down slot cross, the two entries' cells must be identical — a mismatch names both entries and both cell contents
- `styles`, if present on an entry, must be an object; each value must be an array of non-negative integers within the answer's cell count
- Unrecognized style names produce a warning, not an error

**Warnings:**

- A muddled puzzle (`boardHash` present) notes that answer validation was skipped
- Non-muddled only: an answer under 3 *letters* (a crossword convention, not a hard rule — this counts letters, not cells, so a short rebus entry like `[AIL]S` — 2 cells but the 4-letter word AILS — is not warned)
- The grid lacks 180-degree rotational symmetry — a convention, not a rule
- The grid's open cells are not fully connected (almost always a construction mistake)
- Non-muddled only, gated behind the same "no earlier error" condition as the cross-check above: a board cell has an across entry with no crossing down entry, or vice versa

## Hashed mode

See `docs/AUTHORING.md` → "Muddling and hashed builds" for what `--muddle` produces and why. Crushword's `boardHash` covers every **open** cell in row-major order (top-left to bottom-right, blocks skipped entirely — not an empty segment), each cell normalized and lowercased individually, then joined with a delimiter so a multi-letter rebus cell can't be mistaken for several single-letter cells. No partial correctness feedback is given until all cells are filled; the complete board is then hashed and compared to `boardHash`.

Crushword has no tool-specific CLI flags — every option comes from the shared set documented in `docs/AUTHORING.md` → "CLI usage", or run `crushword --help`.

## Example

A small 5×5 puzzle with two crossing rebus cells (cell-letter consistency between across and down is fully worked out here, unlike a length-only skeleton):

```yaml
kind: crushword
title: "Small Rebus Example"
author: "A. Setter"
date: "2026"
grid:
  - "...#."
  - "....."
  - "....."
  - "....."
  - ".#..."
across:
  1:
    clue: "First three letters, plainly"
    answer: "ABC"
  5:
    clue: "Contains a two-letter rebus cell"
    answer: "E[TH]FGH"
  7:
    clue: "Contains a three-letter rebus cell"
    answer: "IJK[ING]L"
  8:
    clue: "Five letters in a row"
    answer: "MNOPQ"
  9:
    clue: "Last three letters, plainly"
    answer: "STU"
down:
  1:
    clue: "First column, top to bottom"
    answer: "AEIMR"
  2:
    clue: "Second column, crosses the two-letter rebus cell"
    answer: "B[TH]JN"
  3:
    clue: "Third column"
    answer: "CFKOS"
  4:
    clue: "Fifth column"
    answer: "DHLQU"
  6:
    clue: "Fourth column, crosses the three-letter rebus cell"
    answer: "G[ING]PT"
```

### Notes on this example

- The block pattern (`#` at (0,3) and (4,1)) is 180-degree symmetric and fully connected
- Across[5]'s second cell (`[TH]`) and Down[2]'s second cell (also `[TH]`) are the same board square — they must, and do, bracket it identically
- Across[7]'s fourth cell (`[ING]`) and Down[6]'s second cell (also `[ING]`) are likewise the same square
- Two cells — the bottom-left corner of Down[1] and the top-right corner of Down[4] — have no crossing across entry (their horizontal runs are length 1), which the validator reports as warnings, not errors

## Notes

Multi-word/hyphenated answers and answer security are covered in
`docs/AUTHORING.md`.

- **Entry boundaries are visible**: Unlike Marching Bands, Crushword's numbering tells the solver exactly where each entry starts. Tab and Shift+Tab jump between entries (wrapping) in the current direction, and each clue is individually clickable — there is no row/band-style grouping.
