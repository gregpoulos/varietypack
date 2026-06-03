# Spiral — YAML Format Reference

A Spiral puzzle file is a YAML file describing a circular spiral grid filled by two sets of entries: one winding inward from the outer edge to the center, the other winding outward from the center to the outer edge. Every cell in the spiral is shared between exactly one inward entry and one outward entry.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"spiral"` |
| `title` | yes | string | Displayed in the puzzle header and browser tab |
| `author` | no | string | Displayed in the puzzle header |
| `date` | no | string | Displayed in the puzzle header |
| `inward` | yes | array | Entries that read from cell 1 (outer edge) toward the center, in order |
| `outward` | yes | array | Entries that read from the center outward, in order (first entry is innermost) |
| `hashed` | no | boolean | If true, answers are checked by hash (solver never sees plaintext); default false |
| `instructions` | no | string | Puzzle instructions shown between the header and the grid; supports multiple paragraphs separated by blank lines |

## Entry fields

| Field | Required | Type | Description |
|---|---|---|---|
| `clue` | yes | string | The clue text shown to the solver |
| `answer` | yes | string | The answer in plain text; may include spaces or hyphens for multi-word answers |
| `styles` | no | object | Cell decorations: keys are style names, values are arrays of 0-indexed cell positions |

### Cell styles

`styles` is a map from style name to a list of positions within the answer's stripped (no-space) letter sequence.

```yaml
inward:
  - clue: "Indian flatbread"
    answer: "ROTI"
    styles:
      circle: [0, 3]    # circles R (position 0) and I (position 3)
  - clue: "Guitar pedal"
    answer: "WAH-WAH"
    styles:
      circle: [3]        # stripped sequence is W=0 A=1 H=2 W=3 A=4 H=5; circles second W
```

Recognized style names:

| Name | Meaning |
|---|---|
| `circle` | Draw a circle around the cell |

Unrecognized style names produce a build warning but are not an error — they are reserved for future use. Positions must be non-negative integers within the stripped answer length; out-of-range positions are a validation error.

## Normalization

Answers are normalized before cell-counting and validation: strip all non-alphabetic characters (spaces, hyphens, apostrophes, punctuation), then lowercase. Only A–Z count toward cell length. Examples:

- `"WAH-WAH"` → `"wahwah"` (6 cells)
- `"TRACEY EMIN"` → `"traceyemin"` (10 cells)
- `"EDWARD IV"` → `"edwardiv"` (8 cells)
- `"DON'T"` → `"dont"` (4 cells)

## Validation rules

- `kind` must be exactly `"spiral"`
- `title` must be a non-empty string
- Both `inward` and `outward` must have at least 2 entries each
- Every entry must have a non-empty `clue` and non-empty `answer`
- Sum of normalized inward answer lengths must equal sum of normalized outward answer lengths
- The normalized-and-concatenated inward string must be the reverse of the normalized-and-concatenated outward string — this ensures every cell letter satisfies both the inward and outward entry it belongs to
- Total cell count must be at least 40
- `styles`, if present on an entry, must be an object; each value must be an array of non-negative integers within the stripped answer length — out-of-range positions are an error
- Unrecognized style names (anything other than `circle`) produce a warning, not an error

## Grid layout

The spiral grid is computed automatically from the total cell count — you do not specify grid dimensions. The builder places cells along an Archimedean spiral that winds inward clockwise, with cells sized so that each one has approximately equal arc length throughout the spiral.

Cell 1 is at the outermost position of the spiral at 12 o'clock. Cell numbers increase clockwise and inward, ending at the innermost cell.

## Example

```yaml
kind: spiral
title: "My Spiral"
author: "Your Name"
date: "2026"
inward:
  - clue: "Flatbread"
    answer: "ROTI"
  - clue: "Guitarist Garcia"
    answer: "JERRY"
outward:
  - clue: "First entry from center"
    answer: "SOMETHING"
  - clue: "Next entry outward"
    answer: "ELSE"
```

## Notes

- **Multi-word and hyphenated answers**: Include spaces or hyphens in the `answer` field for readability (`"WAH-WAH"`, `"TRACEY EMIN"`). The build step strips them when placing letters in cells and when hashing.
- **Outward entry order**: List outward entries from center outward — `outward[0]` is the innermost entry (closest to the center), and the last outward entry ends at the outermost cell.
- **Answer security**: When `hashed: true`, plain-text answers are never included in the generated HTML. Only SHA-256 hashes are stored; solvers cannot view-source to find answers.
- **The reversal constraint**: The concatenated inward string (outside → center) must be the exact reverse of the concatenated outward string (center → outside). This is what makes every cell satisfy both the inward entry it belongs to and the outward entry it belongs to.
