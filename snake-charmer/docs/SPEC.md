# Snake Charmer — YAML Format Reference

A Snake Charmer puzzle file is a YAML file with the following fields.

## Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Must be `"snake-charmer"` |
| `title` | yes | string | Displayed in the puzzle header and browser tab |
| `author` | no | string | Displayed in the puzzle header |
| `date` | no | string | Displayed in the puzzle header |
| `entries` | yes | array | Ordered list of puzzle entries (index 0 = entry #1) |
| `loops`        | no  | integer | Number of times the ring is traversed. Must be `2` (the default); any other value is rejected. Multi-loop (>2) puzzles are a planned future feature. |
| `shape`        | no  | string  | Ring shape: `circle`, `stadium`, `turn`, or `double-turn`; see Notes for constraints. When omitted, auto-selects `double-turn` if the ring size supports it, otherwise `stadium`. The `--shape` CLI flag overrides this field. |
| `instructions` | no  | string  | Puzzle instructions shown between the header and the ring; supports multiple paragraphs separated by blank lines |

## Entry fields

| Field | Required | Type | Description |
|---|---|---|---|
| `clue` | yes | string | The clue text shown to the solver |
| `answer` | yes | string | The answer in plain text; may include spaces for multi-word answers |
| `styles` | no | object | Cell decorations: keys are style names, values are arrays of 0-indexed cell positions |

### Cell styles

`styles` is a map from style name to a list of positions within the answer's stripped (no-space) letter sequence.

```yaml
entries:
  - clue: "Promenade"
    answer: "MALL"
    styles:
      circle: [0, 3]    # circles M (position 0) and second L (position 3)
  - clue: "Mislead"
    answer: "LIE TO"
    styles:
      circle: [3]        # stripped sequence is L=0 I=1 E=2 T=3 O=4; circles T
```

Recognized style names:

| Name | Meaning |
|---|---|
| `circle` | Draw a circle around the cell |

Unrecognized style names produce a build warning but are not an error — they are reserved for future use. Positions must be non-negative integers within the stripped answer length; out-of-range positions are a validation error.

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
- All loops must contain identical letter sequences — the full answer string, when divided into `loops` equal segments of `ringSize` characters, must have every segment identical to the first. This is the Snake Charmer period constraint: it ensures the path visits the same letters on every traversal of the ring
- `shape`, if present, must be one of: `circle`, `stadium`, `turn`, `double-turn`
- `styles`, if present, must be an object; each value must be an array of non-negative integers within the stripped answer length — out-of-range positions are an error
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

- **Multi-word and hyphenated answers**: Include spaces, hyphens, apostrophes, or other punctuation in the `answer` field for readability (`"LIE TO"`, `"SELF-SERVE"`, `"DON'T"`). The build step strips all non-alphabetic characters when placing letters in grid cells and when hashing — only A–Z count toward cell length.
- **Answer security**: Build with `varietypack build --muddle` (or from a pre-muddled YAML) to produce an answer-obscured HTML. Plain-text answers are never included; only a single SHA-256 hash of the complete board is stored. Individual answers cannot be recovered by viewing source. In plain mode, individual letters are present in the page data.
- **Grid layout**: The ring layout is computed automatically from entry lengths. You do not specify grid coordinates. Use the `shape` field (or the `--shape` CLI flag, which takes precedence) to choose the ring shape. When neither is set, the tool auto-selects `double-turn` if the ring size supports it, otherwise `stadium`:
  - `stadium` — horizontal discorectangle: two semicircles connected by straight sections on top and bottom
  - `circle` — pure circle with no straight sections
  - `turn` — C-shape: two horizontal arms connected on the left by a half-annulus; requires the ring size (total cells ÷ loops) to be divisible by 4
  - `double-turn` — S-shape: three horizontal arms (top opens right, bottom opens left) connected by left and right body arc systems; requires even ring size
- **Visual theme**: The `--theme` CLI flag controls the puzzle's visual appearance. Themes affect colors, fonts, and decorative styling but not the ring layout.
  - `broadsheet` (default) — warm newsprint aesthetic: off-white background, Georgia serif, ink-on-paper feel
  - `skeleton` — dark mode: near-black background, vivid purple accents, Impact display font with monospace body text
- **Even cell count**: The ring grid requires an even total cell count. If your puzzle has an odd total, adjust an answer by one letter.
