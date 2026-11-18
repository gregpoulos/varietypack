# Spiral — YAML Format Reference

A Spiral puzzle file is a YAML file describing a circular spiral grid filled by two sets of entries: one winding inward from the outer edge to the center, the other winding outward from the center to the outer edge. Every cell in the spiral is shared between exactly one inward entry and one outward entry.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"spiral"` |
| `inward` | yes | array | Entries that read from cell 1 (outer edge) toward the center, in order |
| `outward` | yes | array | Entries that read from the center outward, in order (first entry is innermost) |

## Rebus cells

See `docs/AUTHORING.md` → "Rebus cells" for the bracket syntax, grammar,
and how to solve a rebus cell.

**Spiral's rule — outward may spell a rebus cell either way.** The reversal constraint reverses the *order* of the cells, and an outward answer reads each cell backward too, so within a rebus cell it may keep the letters forward or reverse them: inward `S[HAR]ON` pairs with outward `NO[HAR]S` or `NO[RAH]S`, but not `NO[HRA]S`. The cell holds the inward spelling, which is what a solver types.

## Validation rules

Beyond the rules every format shares (`docs/AUTHORING.md`):

- Both `inward` and `outward` must have at least 2 entries each
- Sum of inward entry cell counts must equal sum of outward entry cell counts
- The inward cells, in order, must be the reverse of the outward cells — this ensures every cell satisfies both the inward and outward entry it belongs to. For a rebus cell this is bracket-group equality (see "Rebus cells" above), not letter equality
- Total cell count must be at least 40
- A circled cell must be circled on every entry that covers it (error) — its inward entry and its outward entry

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

- **Outward entry order**: List outward entries from center outward — `outward[0]` is the innermost entry (closest to the center), and the last outward entry ends at the outermost cell.
- **The reversal constraint**: The inward cells (outside → center) must be the exact reverse of the outward cells (center → outside). This is what makes every cell satisfy both the inward entry it belongs to and the outward entry it belongs to. See "Rebus cells" above for how this applies when a cell holds a bracketed group.
