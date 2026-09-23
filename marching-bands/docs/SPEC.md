# Marching Bands — YAML Format Reference

A Marching Bands puzzle file is a YAML file describing an N×N grid in which words march in two formations: **Rows** (left to right) and **Bands** (clockwise around concentric rectangular rings). Every cell is shared by exactly one Row word and one Band word. The dividing points between words within a row or band are unknown to the solver — finding them is part of the puzzle.

For odd N, the center cell is a black square that belongs to no entry.

Common header fields (`kind`, `title`, `author`, `date`, `instructions`),
common entry fields (`clue`, `answer`, `styles`), markdown syntax,
normalization, cell styles, rebus bracket grammar, muddling, and themes are
all covered in `docs/AUTHORING.md` — this file covers only what's specific
to Marching Bands.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"marching-bands"` |
| `size` | no | integer | Grid dimension N; validated against the row content when present |
| `rows` | yes | array | Exactly N row objects, each containing an `entries` array |
| `bands` | yes | array | Exactly ⌊N/2⌋ band objects, each containing an `entries` array |

## Rebus cells (multi-letter cells)

See `docs/AUTHORING.md` → "Rebus cells" for the bracket syntax, grammar,
and how to solve a rebus cell.

**Marching Bands' rule — a row and its crossing band must bracket a shared cell identically.** Every cell belongs to one Row word and one Band word, and the build cross-checks that they agree as cells — not merely that their letters, split some other way, happen to match.

Bracket grammar, error and warning conditions, and how cell counts feed the row/band totals: see `docs/CROSS_TOOL_SPEC.md` → "Rebus cells".

## Grid size and band count

N is derived from the `rows` array: the sum of entry cell counts (see "Rebus cells" above) in `rows[0]` gives N. The optional `size` field is validated against this derived value and must match if provided.

- `rows` must contain exactly **N** entries (one per row)
- `bands` must contain exactly **⌊N/2⌋** entries

## Row constraints

Each row's entries must have cell counts summing to N, with one exception:

- **Center row** (index `(N−1)/2`, odd N only): entries sum to N−1, because the center cell is a black square

## Band constraints

Bands are numbered outward-in: band 0 is the outermost, and higher indices are inner bands.

| Band index k | Required total cells | Description |
|---|---|---|
| 0 | `4 × (N−1)` | Outermost ring, perimeter of the full grid |
| 1 | `4 × (N−3)` | Next ring in |
| k | `4 × (N−1−2k)` | General formula |

Band k's entry lengths must sum to `4 × (N−1−2k)`.

## Validation rules

- `kind` must be exactly `"marching-bands"`
- `title` must be a non-empty string
- `rows` must be an array with at least 3 rows; `rows[0].entries` must be non-empty (N is derived from it)
- N (derived from row 0) must be at least 3
- If `size` is present it must equal the derived N
- Every row's entries must have lengths summing to N (or N−1 for the center row of an odd-N grid)
- `bands` must have exactly ⌊N/2⌋ entries
- Each band k's entries must sum to `4 × (N−1−2k)` cells
- Every entry must have a non-empty `clue` and non-empty `answer`
- Every shared cell's Row word and Band word must agree cell for cell, so a bracketed rebus group must match exactly, not just its letters read some other way — once all length checks pass, the build cross-checks the full grid and rejects the puzzle if any cell's Row word and Band word disagree
- `styles`, if present on an entry, must be an object; each value must be an array of non-negative integers within the answer's cell count
- Unrecognized style names produce a warning, not an error

## Hashed mode

See `docs/AUTHORING.md` → "Muddling and hashed builds" for what `--muddle` produces and why. Marching Bands' `boardHash` covers every cell in row-major order (center cell skipped for odd N), each cell normalized and lowercased individually, then joined with a delimiter so a multi-letter rebus cell can't be mistaken for several single-letter cells. No partial correctness feedback is given until all cells are filled; the complete board is then hashed and compared to `boardHash`.

## Example

A 5×5 puzzle skeleton (N=5, 2 bands, 5 rows). The clue/answer **lengths** are valid; cell-letter consistency between rows and bands is omitted here for brevity (see the notes below):

```yaml
kind: marching-bands
title: "Small Example"
author: "A. Setter"
date: "2026"
size: 5

rows:
  - entries:
      - clue: "Unwell"
        answer: "ILL"
      - clue: "All correct"
        answer: "OK"
  - entries:
      - clue: "Opposite of odd"
        answer: "EVEN"
      - clue: "Single"
        answer: "O"
  - entries:
      - clue: "Marsh plant"
        answer: "REED"
      # center row for N=5: entries sum to 4 (N−1), center cell is black
  - entries:
      - clue: "Historical period"
        answer: "ERA"
      - clue: "@, in an address"
        answer: "AT"
  - entries:
      - clue: "Zodiac ram"
        answer: "ARIES"

bands:
  - entries:          # Band A (index 0, outermost): 4*(5−1) = 16 cells
      - clue: "Ski hills"
        answer: "SLOPES"
      - clue: "Piece of furniture"
        answer: "DIVAN"
      - clue: "Blackboard stick"
        answer: "CHALK"
  - entries:          # Band B (index 1): 4*(5−3) = 8 cells
      - clue: "Spoke"
        answer: "SAID"
      - clue: "Prayer's end"
        answer: "AMEN"
```

### Notes on this example

- Every row's answers sum to N = 5, except the center row (row 3, 0-indexed index 2), which sums to N − 1 = 4 because the center cell is a black square
- Band A's answers sum to 6 + 5 + 5 = 16 = 4 × (N − 1); Band B's sum to 4 + 4 = 8 = 4 × (N − 3)
- This skeleton illustrates the required structure and cell-count arithmetic only. In a real puzzle every cell's content must satisfy both its Row word and its Band word simultaneously. The build enforces this: once the length checks pass, it cross-checks every cell and rejects the puzzle if a Row word and Band word disagree on any cell. (The skeleton above is **not** cell-consistent, so it would fail that cross-check — it is shown only to illustrate the cell-count arithmetic.)

## Notes

Multi-word/hyphenated answers and answer security are covered in
`docs/AUTHORING.md`.

- **Band direction**: All bands march clockwise — top edge left→right, right edge top→bottom, bottom edge right→left, left edge bottom→top.
- **Entry boundaries hidden**: The dividing points between consecutive entries within a row or band are intentionally not revealed by the puzzle interface. Tab navigation and highlighting operate at the row/band level, not the entry level.
