# Spiral — YAML Format Reference

A Spiral puzzle file is a YAML file describing a circular spiral grid filled by two sets of entries: one winding inward from the outer edge to the center, the other winding outward from the center to the outer edge. Every cell in the spiral is shared between exactly one inward entry and one outward entry.

Common header fields (`kind`, `title`, `author`, `date`, `instructions`),
common entry fields (`clue`, `answer`, `styles`), markdown syntax,
normalization, cell styles, rebus bracket grammar, muddling, and themes are
all covered in `docs/AUTHORING.md` — this file covers only what's specific
to Spiral.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"spiral"` |
| `inward` | yes | array | Entries that read from cell 1 (outer edge) toward the center, in order |
| `outward` | yes | array | Entries that read from the center outward, in order (first entry is innermost) |

## Rebus cells (multi-letter cells)

See `docs/AUTHORING.md` → "Rebus cells" for the bracket syntax, grammar,
and how to solve a rebus cell.

**Spiral's rule — outward repeats each rebus cell in forward order.** The reversal constraint reverses the *order* of the cells, never the letters inside one — a picture can't be read backwards. Inward `S[HAR]ON` pairs with outward `NO[HAR]S`, never `NO[RAH]S`.

Bracket grammar, error and warning conditions, and how cell counts feed the validation rules: see `docs/CROSS_TOOL_SPEC.md` → "Rebus cells".

## Validation rules

- `kind` must be exactly `"spiral"`
- `title` must be a non-empty string
- Both `inward` and `outward` must have at least 2 entries each
- Every entry must have a non-empty `clue` and non-empty `answer`
- Sum of inward entry cell counts must equal sum of outward entry cell counts
- The inward cells, in order, must be the reverse of the outward cells — this ensures every cell satisfies both the inward and outward entry it belongs to. For a rebus cell this is bracket-group equality (see "Rebus cells" above), not letter equality
- Total cell count must be at least 40
- `styles`, if present on an entry, must be an object; each value must be an array of non-negative integers within the answer's cell count — out-of-range positions are an error
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

Multi-word/hyphenated answers and answer security are covered in
`docs/AUTHORING.md`.

- **Outward entry order**: List outward entries from center outward — `outward[0]` is the innermost entry (closest to the center), and the last outward entry ends at the outermost cell.
- **The reversal constraint**: The inward cells (outside → center) must be the exact reverse of the outward cells (center → outside). This is what makes every cell satisfy both the inward entry it belongs to and the outward entry it belongs to. See "Rebus cells" above for how this applies when a cell holds a bracketed group.
