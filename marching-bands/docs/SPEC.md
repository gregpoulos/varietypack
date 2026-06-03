# Marching Bands — YAML Format Reference

A Marching Bands puzzle file is a YAML file describing an N×N grid in which words march in two formations: **Rows** (left to right) and **Bands** (clockwise around concentric rectangular rings). Every cell is shared by exactly one Row word and one Band word. The dividing points between words within a row or band are unknown to the solver — finding them is part of the puzzle.

For odd N, the center cell is a black square that belongs to no entry.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"marching-bands"` |
| `title` | yes | string | Displayed in the puzzle header and browser tab |
| `author` | no | string | Displayed in the puzzle header |
| `date` | no | string | Displayed in the puzzle header; also used as part of the auto-save key |
| `size` | no | integer | Grid dimension N; validated against the row content when present |
| `hashed` | no | boolean | If true, answers are checked by hash (solver never sees plaintext); default false |
| `instructions` | no | string | Shown between the header and the grid; blank lines become separate `<p>` elements |
| `rows` | yes | array | Exactly N row objects, each containing an `entries` array |
| `bands` | yes | array | Exactly ⌊N/2⌋ band objects, each containing an `entries` array |

## Entry fields

Each entry (in both `rows` and `bands`) has the following fields:

| Field | Required | Type | Description |
|---|---|---|---|
| `clue` | yes | string | The clue text shown to the solver |
| `answer` | yes | string | The answer in plain text; may include spaces, hyphens, or other punctuation |
| `styles` | no | object | Cell decorations: keys are style names, values are arrays of 0-indexed cell positions |

### Cell styles

`styles` is a map from style name to a list of positions within the answer's normalized (stripped) letter sequence.

```yaml
rows:
  - entries:
      - clue: "Say it twice"
        answer: "WAH-WAH"
        styles:
          circle: [3]    # stripped sequence is W=0 A=1 H=2 W=3 A=4 H=5; circles second W
```

Recognized style names:

| Name | Meaning |
|---|---|
| `circle` | Draw a circle around the cell |

Unrecognized style names produce a build warning but are not an error — they are reserved for future use. Positions must be non-negative integers within the stripped answer length; out-of-range positions are a validation error.

## Normalization

Answers are normalized before cell-counting and validation: strip all non-alphabetic characters (spaces, hyphens, apostrophes, punctuation), then lowercase. Only A–Z count toward cell length. Examples:

- `"WAH-WAH"` → `"wahwah"` (6 cells)
- `"LIE TO"` → `"lieto"` (5 cells)
- `"EDWARD IV"` → `"edwardiv"` (8 cells)
- `"DON'T"` → `"dont"` (4 cells)

## Grid size and band count

N is derived from the `rows` array: the sum of normalized answer lengths in `rows[0]` gives N. The optional `size` field is validated against this derived value and must match if provided.

- `rows` must contain exactly **N** entries (one per row)
- `bands` must contain exactly **⌊N/2⌋** entries

## Row constraints

Each row's entries must have normalized answer lengths summing to N, with one exception:

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
- Every shared cell's Row letter and Band letter must agree — once all length checks pass, the build cross-checks the full grid and rejects the puzzle if any cell's Row word and Band word disagree
- `styles`, if present on an entry, must be an object; each value must be an array of non-negative integers within the stripped answer length
- Unrecognized style names produce a warning, not an error

## Hashed mode

When `hashed: true`, plain-text answers are never included in the generated HTML. Only a SHA-256 hash of the entire board (all cells in row-major order, center cell skipped for odd N, lowercase) is stored as `boardHash`. The solver cannot view-source to find answers. No partial correctness feedback is given until all cells are filled; the complete board is then hashed and compared to `boardHash`.

## CLI usage

```
marching-bands [--theme broadsheet|skeleton] <input.yaml> [-o output.html]
```

- `--theme` — visual theme; default `broadsheet`
- `<input.yaml>` — required; path to the puzzle YAML file
- `-o output.html` — optional; when omitted, writes `<input-basename>.html` next to the input file

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
- This skeleton illustrates the required structure and cell-count arithmetic only. In a real puzzle every cell letter must satisfy both its Row word and its Band word simultaneously. The build enforces this: once the length checks pass, it cross-checks every cell and rejects the puzzle if a Row word and Band word disagree on any letter. (The skeleton above is **not** letter-consistent, so it would fail that cross-check — it is shown only to illustrate the cell-count arithmetic.)

## Notes

- **Multi-word and hyphenated answers**: Include spaces, hyphens, or other punctuation in `answer` for readability (`"WAH-WAH"`, `"LIE TO"`). The build step strips them when placing letters in cells and when hashing.
- **Band direction**: All bands march clockwise — top edge left→right, right edge top→bottom, bottom edge right→left, left edge bottom→top.
- **Answer security**: When `hashed: true`, plain-text answers are never included in the generated HTML. Only a single SHA-256 hash of the complete board is stored.
- **Entry boundaries hidden**: The dividing points between consecutive entries within a row or band are intentionally not revealed by the puzzle interface. Tab navigation and highlighting operate at the row/band level, not the entry level.
