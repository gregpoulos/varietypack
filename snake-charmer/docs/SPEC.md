# Snake Charmer — YAML Format Reference

A Snake Charmer puzzle file is a YAML file with the following fields.
Common header fields (`kind`, `title`, `author`, `date`, `instructions`),
common entry fields (`clue`, `answer`, `styles`), markdown syntax,
normalization, cell styles, rebus bracket grammar, muddling, and themes are
all covered in `docs/AUTHORING.md` — this file covers only what's specific
to Snake Charmer.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"snake-charmer"` |
| `entries` | yes | array | Ordered list of puzzle entries (index 0 = entry #1) |
| `loops`        | no  | integer | Number of times the ring is traversed. Must be `2` (the default); any other value is rejected. Multi-loop (>2) puzzles are a planned future feature. |
| `shape`        | no  | string  | Ring shape: `circle`, `stadium`, `turn`, or `double-turn`; see Notes for constraints. When omitted, auto-selects `double-turn` if the ring size supports it, otherwise `stadium`. The `--shape` CLI flag overrides this field. |

Snake Charmer places `instructions` inside `#clue-list` (above the clue
list) rather than in a full-width band between the header and the ring —
its layout has no such band. The field itself works the same as every
other tool's.

## Rebus cells (multi-letter cells)

See `docs/AUTHORING.md` → "Rebus cells" for the bracket syntax, grammar,
and how to solve a rebus cell.

**Snake Charmer's rule — every loop must bracket the same groups at the same cells.** The period constraint applies in cell space: loop 1's answers must reproduce loop 0's cells exactly — same groups, same ring positions — not merely the same letters split differently.

Bracket grammar, error and warning conditions, and how cell counts feed the ring-size and entry-length rules: see `docs/CROSS_TOOL_SPEC.md` → "Rebus cells".

## Validation rules

- `kind` must be exactly `"snake-charmer"`
- `title` must be a non-empty string
- `instructions`, if present, must be a non-empty string
- `entries` must have at least 3 items
- Every entry must have a non-empty `clue` and non-empty `answer`
- `loops`, if present, must be `2` — multi-loop (>2) puzzles are not yet supported
- Total cell count must be divisible by `loops` (i.e. must be even)
- Ring size (total cells ÷ loops) must be at least 8 — this is the binding minimum; with loops=2 it means at least 16 total cells
- Ring size must be even (required for the loop to close)
- All loops must contain identical cell sequences — the full answer set, parsed into cells and divided into `loops` equal segments of `ringSize` cells, must have every segment identical to the first (bracket groups included, not just their letters). This is the Snake Charmer period constraint: it ensures the path visits the same cells on every traversal of the ring
- `shape`, if present, must be one of: `circle`, `stadium`, `turn`, `double-turn`, and must be able to lay out the ring size (for example, `turn` needs a ring size divisible by 4). The `--shape` flag, when given, is checked in its place
- `styles`, if present, must be an object; each value must be an array of non-negative integers within the answer's cell count — out-of-range positions are an error
- A circled cell must be circled on every entry that covers it (error) — in Snake Charmer, the entries from each loop that pass through the cell
- Unrecognized style names (anything other than `circle`) produce a warning, not an error

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

Multi-word/hyphenated answers, answer security, and theme/font selection
are covered in `docs/AUTHORING.md`.

- **Grid layout**: The ring layout is computed automatically from entry lengths. You do not specify grid coordinates. Use the `shape` field (or the `--shape` CLI flag, which takes precedence) to choose the ring shape. When neither is set, the tool auto-selects `double-turn` if the ring size supports it, otherwise `stadium`:
  - `stadium` — horizontal discorectangle: two semicircles connected by straight sections on top and bottom
  - `circle` — pure circle with no straight sections
  - `turn` — C-shape: two horizontal arms connected on the left by a half-annulus; requires the ring size (total cells ÷ loops) to be divisible by 4
  - `double-turn` — S-shape: three horizontal arms (top opens right, bottom opens left) connected by left and right body arc systems; requires even ring size
- **Even cell count**: The ring grid requires an even total cell count. If your puzzle has an odd total, adjust an answer by one letter.
