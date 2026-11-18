# Snake Charmer — YAML Format Reference

A Snake Charmer puzzle file is a YAML file with the following fields.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"snake-charmer"` |
| `entries` | yes | array | Ordered list of puzzle entries (index 0 = entry #1) |
| `shape`        | no  | string  | Ring shape: `circle`, `stadium`, `turn`, or `double-turn`; see Notes for constraints. When omitted, auto-selects `double-turn` if the ring size supports it, otherwise `stadium`. The `--shape` CLI flag overrides this field. |

## Rebus cells

See `docs/AUTHORING.md` → "Rebus cells" for the bracket syntax, grammar,
and how to solve a rebus cell.

**Snake Charmer's rule — every loop must bracket the same groups at the same cells.** The period constraint applies in cell space: loop 1's answers must reproduce loop 0's cells exactly — same groups, same ring positions — not merely the same letters split differently.

## Validation rules

Beyond the rules every format shares (`docs/AUTHORING.md`):

- `entries` must have at least 3 items
- The answers run round the ring twice, so the total cell count must be even, and the ring size is half of it
- Ring size must be at least 8 (at least 16 total cells)
- Ring size must be even (required for the loop to close)
- All loops must contain identical cell sequences — the full answer set, parsed into cells and split into two halves of `ringSize` cells, must have both halves identical (bracket groups included, not just their letters). This is the Snake Charmer period constraint: it ensures the path visits the same cells on every traversal of the ring
- `shape`, if present, must be one of: `circle`, `stadium`, `turn`, `double-turn`, and must be able to lay out the ring size (for example, `turn` needs a ring size divisible by 4). The `--shape` flag, when given, is checked in its place
- A circled cell must be circled on every entry that covers it (error) — in Snake Charmer, the entries from each loop that pass through the cell

## Example

```yaml
kind: snake-charmer
title: "My Snake Charmer"
author: "Your Name"
date: "2025"
entries:
  - clue: "Promenade"
    answer: "MALL"
  - clue: "Stage after metamorphosis"
    answer: "IMAGO"
  - clue: "Mislead"
    answer: "LIE TO"
```

## Notes

- **Grid layout**: The ring layout is computed automatically from entry lengths. You do not specify grid coordinates. Use the `shape` field (or the `--shape` CLI flag, which takes precedence) to choose the ring shape. When neither is set, the tool auto-selects `double-turn` if the ring size supports it, otherwise `stadium`:
  - `stadium` — horizontal discorectangle: two semicircles connected by straight sections on top and bottom
  - `circle` — pure circle with no straight sections
  - `turn` — C-shape: two horizontal arms connected on the left by a half-annulus; requires the ring size (half the total cells) to be divisible by 4
  - `double-turn` — S-shape: three horizontal arms (top opens right, bottom opens left) connected by left and right body arc systems; requires even ring size
- **Even cell count**: The ring grid requires an even total cell count. If your puzzle has an odd total, adjust an answer by one letter.
