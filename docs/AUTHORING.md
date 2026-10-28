# Authoring Guide

Rules and conventions shared by all four puzzle formats — Snake Charmer,
Spiral, Marching Bands, and Crushword. Each tool's `docs/SPEC.md` covers
that tool's own YAML fields, validation rules, and an example; read this
file first, then the tool's own SPEC for the puzzle-specific shape.

---

## Common header fields

Every puzzle YAML, regardless of tool, starts with these fields:

| Field | Required | Type | Description |
|---|---|---|---|
| `kind` | yes | string | Identifies the tool (`"snake-charmer"`, `"spiral"`, `"marching-bands"`, or `"crushword"`); must match exactly |
| `title` | yes | string | Displayed in the puzzle header and browser tab |
| `author` | no | string | Displayed in the puzzle header |
| `date` | no | string | Displayed in the puzzle header |
| `instructions` | no | string | Puzzle instructions; supports multiple paragraphs separated by blank lines. Most tools show it between the header and the grid — Snake Charmer places it at the top of the clue column instead, since its layout has no full-width band. Accepts the same markdown subset as `clue` (below). |
| `theme` | no | string | Visual theme: `broadsheet` or `skeleton`. The `--theme` flag overrides it. Default `broadsheet`. See "Themes and fonts" |

Beyond these, each tool adds its own puzzle-content fields (e.g. `entries`,
`inward`/`outward`, `rows`/`bands`, `grid`/`across`/`down`) — see that
tool's `docs/SPEC.md`.

**Common entry fields.** Every entry in every tool (however it's grouped —
a flat list, `across`/`down` maps, row/band arrays) has:

| Field | Required | Type | Description |
|---|---|---|---|
| `clue` | yes | string | The clue text shown to the solver. Accepts the markdown subset below. |
| `answer` | yes | string | The answer in plain text; may include spaces, hyphens, apostrophes, or other punctuation for readability. See "Rebus cells" for bracket notation. |
| `styles` | no | object | Cell decorations — see "Cell styles" below. |

**Unknown keys warn.** A key that isn't one of these, or one of the tool's own
fields, gets a warning such as `inward[0]: unknown key "style" (is it a typo?)`,
since a misspelled field would otherwise be silently ignored. It's only a
warning: a file may carry keys of its own, and the build ignores them.

---

## Markdown formatting in clue and instructions text

`clue` and `instructions` text accept a small markdown subset, rendered
once at build time (not in the solver's browser, so the puzzle HTML has no
markdown dependency at solve time):

| Syntax | Result |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `` `code` `` | `code` |
| `[text](url)` | a link |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `H~2~O` | subscript (`H₂O`) |
| `29^th^` | superscript (`29ᵗʰ`) |
| `:smile:` | emoji shortcode |

Plain text with no markdown syntax renders unchanged — you don't need to
escape ordinary prose.

**Typographic replacements** happen automatically: straight `"quotes"` and
`'apostrophes'` are curled, `--`/`---` become en/em dashes, and `...`
becomes `…`. Prefix a character with `\` to keep it literal — `\"` stays a
straight quote, `\*` stays a literal asterisk instead of opening emphasis.

**Instructions only:** blank lines separate paragraphs. Each blank-line-separated
block becomes its own paragraph in the rendered output.

**What isn't supported:** block structure like headings, lists, tables, or
images, and bare URLs are not auto-linked — this format is for short
single-line or short-paragraph text, not documents. Any literal HTML you
type is escaped, not rendered, so a clue can't inject markup.

Full implementation contract (for anyone extending an engine, not needed
for authoring): `docs/CROSS_TOOL_SPEC.md` → "Markdown formatting in clue
and instructions text".

---

## Normalization

Before an answer is counted into cells, validated, or hashed, it is
normalized: **accents are removed (É → E, Ñ → N), everything that isn't a
letter is stripped (spaces, hyphens, apostrophes, punctuation), and the
result is lowercased.** Only A–Z and 0–9 count toward cell length, and a
digit is a letter like any other: `R2D2` is four cells.

```
"LIE TO"    → "lieto"
"WAH-WAH"   → "wahwah"
"DON'T"     → "dont"
"EDWARD IV" → "edwardiv"
"JALAPEÑO"  → "jalapeno"
```

This means you're free to write multi-word or hyphenated answers with
natural punctuation (`"LIE TO"`, `"SELF-SERVE"`, `"DON'T"`) and accents
(`"CAFÉ"`) for readability — the build step strips them before counting
cells or hashing, so they never affect grid size or the answer's stored
form. Solvers can type accented letters too: an É typed into a cell counts
as E.

A letter that can't be typed as A–Z or 0–9 — Æ, Ø, ß, ½, or a letter from
another alphabet — is a validation error rather than being silently dropped.
Spell it out: `AE`, or `[AE]` to keep both letters in one cell.

---

## Cell styles

`styles` is a map from style name to a list of 0-indexed positions within
the answer's **cell** sequence — a bracketed rebus group (see "Rebus
cells" below) counts as one position, not one per letter.

```yaml
- clue: "Promenade"
  answer: "MALL"
  styles:
    circle: [0, 3]    # circles M (position 0) and second L (position 3)
- clue: "Mislead"
  answer: "LIE TO"
  styles:
    circle: [3]        # cell sequence is L=0 I=1 E=2 T=3 O=4; circles T
- clue: "Fictional cheerleader"
  answer: "S[HAR]ON"
  styles:
    circle: [1]        # cell sequence is s=0 [har]=1 o=2 n=3; circles the har rebus cell
- clue: "Something to mull over"      # crosses "Mislead" at its T
  answer: "THOUGHT"
  styles:
    circle: [0]        # the same cell as LIE TO's position 3 — list it here too
```

**A circled cell is circled on every entry that covers it.** A cell is
usually part of two entries (an across and a down, a row and a band, an
inward and an outward). Circle it on each; if you miss one, the build fails
with an error naming the entry and the position to add. The tools draw one
circle per cell however many entries list it.

Recognized style names:

| Name | Meaning |
|---|---|
| `circle` | Draw a circle around the cell |

Unrecognized style names produce a build warning but are not an error —
they're reserved for future use. Positions must be non-negative integers
within the answer's cell count; an out-of-range position is a validation
error.

---

## Rebus cells (multi-letter cells)

Wrap a run of letters in `[...]` to make it occupy a single cell instead of
one cell per character:

```yaml
answer: "S[HAR]ON"   # cells: s | har | o | n  (4 cells, not 6)
```

**The mental model:** a rebus cell holds a chunk of a word in one square and
is entered as one unit. Where an entry reads a cell against the direction
it's written — Spiral's outward answers, a Marching Bands band along its
bottom edge — it may spell the chunk either way: inward `S[HAR]ON` pairs
with outward `NO[HAR]S` or `NO[RAH]S`. The cell holds the forward spelling
(the inward answer's, or the row's), and that is what a solver types. An
answer with no brackets parses exactly as before, so if you never use this
notation nothing changes for you.

**Cell count, not letter count.** Everywhere a puzzle format talks about
entry length, grid size, or row/band totals, it's counting *cells*:
`S[HAR]ON` is 4 cells, the same as `MALL`, despite having 6 letters.

**Grammar:**

| Write | Result |
|---|---|
| Unclosed `[` | error |
| Unmatched `]` | error |
| `[` nested inside a group | error |
| An empty bracketed group (e.g. `[--]`, which normalizes to nothing) | error |
| A bracketed single letter (e.g. `[A]`) | legal and silent — identical to writing bare `A`; harmless if you bracket every cell for visual consistency |
| A bracketed group of 5 or more letters | warning ("is that intended?") — 4 or fewer is silent |

**Solving a rebus cell (Snake Charmer, Spiral, Marching Bands).** The
solver presses `Enter` on the cell, types its letters, then presses `Enter`
again to commit and move on. Moving the cursor off the cell by any other
means — an arrow key, Tab, Space, or clicking elsewhere — commits it too.
The **Rebus** button does the same thing for solvers without a keyboard:
tap it to open the cell (its label becomes **Done**), type the letters, tap
again to commit. It's always present and always enabled, on every square of
every puzzle, so it never hints at which squares hold a rebus. Crushword
has no separate rebus mode — see its own `docs/SPEC.md` for how it handles
multi-letter cells instead.

**On a phone or tablet,** the page fits one screen: the title, the grid, the active clue
with ‹ › to step through the clues, and a built-in keyboard (the device's own keyboard
stays closed). **Clues** swaps the grid for the clue list; tapping a clue there jumps to
it. The keyboard's bottom row holds the Rebus key (Crushword: Prev and Next cell) and a key to switch
direction. Check cell is in the life-ring help menu beside the options menu (absent in a
muddled puzzle), and the options menu has a "Wrap long rows of cells" setting on the Clues
screen (except in Marching Bands, whose clue list has no cell rows).

**Each tool adds its own rule for how a rebus cell's *cells* (not letters)
must agree across the two entries that share it** — see that tool's own
`docs/SPEC.md` → "Rebus cells" for the specific rule (Snake Charmer's loop
period, Spiral's reversal, Marching Bands' row/band cross-check,
Crushword's across/down cross-check plus its `maxCellLetters` cap).

Implementation contract (grammar enforcement, cell-count plumbing) for
anyone extending an engine: `docs/CROSS_TOOL_SPEC.md` → "Rebus cells".

---

## Muddling and hashed builds

**Answer security.** Build with `varietypack build --muddle` (or from a
pre-muddled YAML) to produce an answer-obscured HTML. Plain-text answers
are never included in a hashed build; only a single SHA-256 hash of the
complete board is stored. A solver can't recover individual answers by
viewing the page source. In a plain (non-muddled) build, letters are
present in the page data, since the puzzle isn't meant to hide them.

**Muddling for distribution.** `varietypack muddle <file.yaml>` produces a
**muddled YAML**: structurally the same as your source file, except every
entry's `answer:` becomes `length:` (a cell count) and the top level gains
`hashed: true`, `format: 2`, and `boardHash:`. Everything else — `author`,
`date`, `title`, `instructions`, `styles`, and any tool-specific shape
fields — carries through unchanged. Share the muddled YAML with
collaborators, playtesters, or test-solvers who need to build the HTML
themselves without ever seeing the answers. Your source YAML must pass
`varietypack validate` with zero errors before it can be muddled.

Building a muddled YAML always produces a hashed HTML, with no extra flags
needed — the builder detects `boardHash:` in the input and switches modes
automatically.

Each tool's own `docs/SPEC.md` → "Hashed mode" documents exactly which
cells feed that tool's board hash and in what order. Algorithmic detail
(the hash preimage construction, delimiter choice) lives in
`docs/CROSS_TOOL_SPEC.md` and root `CLAUDE.md`, not here.

---

## Themes and fonts

Select a visual theme with the YAML's `theme:` field or the `--theme <name>`
flag, which overrides it (default `broadsheet`). Themes
control colors, fonts, and decorative styling — never layout — and are
shared across all four tools:

- **`broadsheet`** (default) — warm newsprint aesthetic: off-white
  background, Georgia serif, ink-on-paper feel. Uses only system fonts.
- **`skeleton`** — dark mode: near-black background, vivid purple accents,
  and a custom display typeface that can be delivered two ways (below).

Some themes dim a clue once all its cells are filled (`broadsheet` does) — a visual
progress cue only; it says nothing about whether the entry is right.

**Custom fonts.** A theme that uses a non-system font (currently
`skeleton`) is delivered by one of two `--font` modes, `embed` by default:

- `--font embed` — inlines the font as base64 so the output HTML stays
  self-contained, at the cost of the font's bytes in every file.
- `--font link` — emits an `@import` pointing at a CDN; smaller HTML, but
  it loads in the solver's browser on every open and so needs network
  access at solve time.

Without the flag, a custom-font theme uses `embed` (or `link` when it has no
local font files). The flag is silently ignored for system-font themes like
`broadsheet`.

### Theme overrides

To make a puzzle match another site, override individual theme tokens with `themeTokens:`, a map from token name to CSS value, applied on top of the chosen theme:

```yaml
theme: broadsheet
themeTokens:
  color-bg: "#fdf6e3"
  color-btn-bg: "#1e5799"
  font-body: "Georgia, serif"
```

Token names are the `--theme-*` custom properties declared in `shared/themes/theme-base.css`, written without the `--theme-` prefix. An unknown name is an error. Values are plain CSS values of at most 200 characters; anything that could end the declaration, open a comment or string that outlives it, or load something (`;`, `{`, `}`, `[`, `]`, `<`, `>`, `@`, `\`, `/*`, `url(`, unbalanced quotes or parentheses) is rejected. The studio edits the same map under Puzzle settings → Theme overrides.

See root `CLAUDE.md` → "Shared library pattern" for how to add a new theme
(a project-level, not puzzle-authoring, task).

---

## CLI usage

If you'd rather not use a command line, the studio (`npm run build:studio`, then open `studio/build/index.html`) edits, previews and exports puzzles in the browser with the same validators and build; see `README.md` → "Studio".

Every tool's CLI takes the same shape:

```
<tool> <input.yaml> [options]
```

or, more commonly, go through the repo-wide dispatcher:

```
varietypack build <input.yaml> [options]
```

Shared options, accepted by every tool, are documented in the root
`README.md` → "Global options" (`--muddle`, `--theme`, `--font`,
`--minify`, `-o`/`--output`, `-f`/`--force`, `-h`/`--help`). A few tools also accept
their own extra flags (e.g. Snake Charmer's `--shape`) — see that tool's
`docs/SPEC.md` and `CLAUDE.md`, or run `<tool> --help`.
