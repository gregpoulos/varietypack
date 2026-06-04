# Cross-Tool Spec

Implementation contracts every puzzle tool must satisfy identically. Check this file when adding a feature to one engine — if it's listed here, the other engine(s) need the same treatment.

---

## Engine bootstrap & structure

**Rule:** Every `engine.js` must follow this three-layer skeleton and the canonical `init()` section order below. An agent modifying any engine should be able to orient instantly without reading the whole file.

### Skeleton

```js
'use strict';

// ── Pure helpers (exported for Node tests) ────────────────────────────────────
// OPTIONAL. Only present when the tool has engine-level pure logic worth
// unit-testing. Snake Charmer exports buildEntryMaps/nextRingPos/prevRingPos
// here. Spiral and Marching Bands have none — their testable logic is in
// layout.js/validator.js.

// ── DOM engine (browser only) ─────────────────────────────────────────────────
(function () {
  if (typeof document === 'undefined') return;  // keep in SC; not needed in Spiral/MB

  function init() { /* everything below */ }

  document.addEventListener('DOMContentLoaded', init);
})();

// module.exports — only if pure helpers exist above (SC only)
```

**The one rule that resolves scope confusion:** all mutable state and every function that touches state or the DOM lives inside `init()`. Pure, dependency-free, testable helpers — and only those — live at module scope above the IIFE.

### Canonical `init()` section order

Eight sections in fixed order, each introduced with a `// ── <name> ──` banner:

| # | Banner | Contents |
|---|--------|----------|
| 1 | `Data & constants` | `const data = window.PUZZLE_DATA` + derived dimensions/counts |
| 2 | `Geometry & index maps` | Pure geometry helpers (`rowOf`, `polar`, `cellPath`, `svgEl`, …) + precomputed index maps (`inwardMap`, `bandCellsMap`, …) |
| 3 | `State` | All mutable `let`s: active cell/position, direction/mode, `congratsDismissed` |
| 4 | `Logic functions` | Cell storage, navigation helpers, `focusCell`, `syncUI`, answer-checking, board-state helpers, `saveState`/`restoreState`/`clearState` declarations (via `setupStorage`) |
| 5 | `Build SVG` | SVG element query, `viewBox`, layer groups (`cells < circles < flash < letters [< labels]`), cell elements, circle decorations, labels, any tool-specific SVG chrome (chevron, curl) |
| 6 | `Header & clues` | `renderByline`, `renderInstructions`, clue list DOM construction, inline rendering calls |
| 7 | `Event wiring` | Hidden input, check/clear buttons, toggle clicks, congrats-dismiss overlay, document `keydown` |
| 8 | `Restore & focus` | `restoreState(); focusCell(<initial>)` |

**Invariant:** `init()` declares, builds, wires, then starts — it invokes no logic function until Section 8. Function declarations in Section 4 may safely reference `const`s from Section 5 (`flashLayer`, `cellPaths`, etc.) because those functions are only *called* from Sections 7–8, after the SVG build has run.

**Applies to:** `spiral/src/template/engine.js`, `snake-charmer/src/template/engine.js`, `marching-bands/src/template/engine.js`.

---

## CLI argument convention

**Rule:** Every tool CLI accepts `<input.yaml>` as its only required positional argument and uses `-o <output.html>` for an explicit output path. When `-o` is omitted, the output path defaults to `<input-basename>.html` written next to the input file. No tool may require a positional output argument.

**Usage line order:** Optional flags first, then `<input.yaml>`, then `[-o <output.html>]`. Example: `Usage: mytool [--theme broadsheet|skeleton] <input.yaml> [-o <output.html>]`.

**Applies to:** all tool `cli.js` files.

**How to verify:** Running `varietypack build puzzle.yaml` (no `-o`) must produce `puzzle.html` next to `puzzle.yaml`. Running with `-o out/foo.html` must write there, creating `out/` if it does not exist. Running with `-o` as the final argument must print an error and exit non-zero.

**Why `-o` over positional:** Once a tool has multiple optional flags (e.g. `--shape`, `--theme`), a bare positional output is ambiguous about ordering. Named flags scale uniformly across all tools regardless of how many options each tool has.

---

## Theme selection flag

**Rule:** Every tool CLI accepts `--theme <name>` to select a visual theme. The default is `broadsheet`. Each tool defines its own theme allowlist, but all tools must ship at least `broadsheet` and `skeleton`. Unknown theme names must be rejected at the CLI with a usage error.

**Applies to:** all tool `cli.js` files.

**Theme semantics:** Themes are token files over a neutral shared layer. `shared/themes/theme-base.css` defines neutral `--theme-*` defaults; each theme is a `shared/themes/<name>-tokens.css` that overrides them. `shared/themes/theme-components.css` supplies all tool-agnostic, var-driven component styles (masthead, buttons, SVG cell states, congrats card) — shared across all tools. Each tool may contribute a `src/template/themes/tool.css` for tool-specific selectors (bands, chevrons, secondary cells) that reference `--theme-*`. Adding a new theme requires only `<name>-tokens.css` and its name in `VALID_THEMES` — no per-tool CSS, no branch in `composeThemeCss`. Both `broadsheet` and `skeleton` ship as `<name>-tokens.css` files under this model. All themes must cover the full selector vocabulary required by the engine — any class or ID added to the engine must be styled via `--theme-*` vars in `theme-components.css` or `themes/tool.css`.

**Tool-specific optional flags** (e.g. `--shape` in Snake Charmer) are allowed and must not conflict with shared flag names. Tools document their own optional flags in their `CLAUDE.md` and `docs/SPEC.md`.

---

## Minify flag

**Rule:** Every tool CLI accepts `--minify` (boolean, default off). When set, the builder runs the generated HTML through `shared/build/minify.js` before writing it. Minification must be behavior-preserving — it never alters puzzle data or rendered output.

**Applies to:** all tool `cli.js` files; builders take it as `options.minify` and apply `minifyHtml()` to the composed HTML just before `fs.writeFileSync`.

**What it does:** terser-minifies the body of each `<script>` block (compress + mangle), and strips comments / trailing whitespace / runs of blank lines from the surrounding HTML and CSS.

**Implementation gotcha:** the comment/whitespace pass is string-unaware, so it runs *only* on the non-`<script>` segments. Running it over `<script>`/`PUZZLE_DATA` content would delete `/* … */` or `//` sequences that appear inside string literals (author text can contain anything), corrupting data or breaking the document. terser owns comment removal inside scripts. CSS rule bodies are not otherwise minified (their internal whitespace is preserved).

---

## Instructions field

**Rule:** Every tool YAML accepts an optional `instructions` string field. When present, the builder includes it verbatim in `window.PUZZLE_DATA.instructions`. The engine renders it between the header and the puzzle grid as a series of `<p>` elements inside `<div id="instructions" hidden>`, splitting on blank lines (`/(?:\r?\n){2,}/`). The `hidden` attribute is removed only when the field is present and non-empty. When absent, the element stays hidden and no empty div is rendered visibly.

**Snake Charmer exception:** Snake Charmer nests `<div id="instructions">` at the top of its `#clue-list` column (above the clue `<ol>`) rather than in a full-width band between the header and the ring — its ring-plus-clue-column layout has no such band, so the instructions sit atop the clue column by design. The element id, `hidden` toggle, and blank-line paragraph splitting are identical; only the container differs.

**Validation:** `instructions` must be a non-empty string if provided. Whitespace-only strings are rejected.

**Applies to:** all tool validators, hashers/preparers, builders, the shared `renderInstructions(data)` helper (called from each engine's *Header & clues* section), and HTML templates.

**Why:** Variety puzzles often require format explanations (e.g., "Answers read inward from cell 1"). Without a standard instructions field, authors have no way to include per-puzzle explanatory text in the output HTML.

---

## Shared element naming conventions

All tools use these element names for equivalent concepts — use them exactly as listed. Elements marked *(tool-specific)* are only present in the named tool and do not need to be styled in other tools' theme files.

| Element | Name |
|---|---|
| Outer puzzle container | `.puzzle-main` |
| Header block | `.puzzle-header` |
| Puzzle title | `h1.title` |
| Author / date byline | `.byline` |
| SVG cell path | `.cell` |
| SVG letter text | `.cell-letter` |
| SVG cell-number text | `.cell-num` |
| Active entry's cells | `.cell.active-entry` |
| Focused/cursor cell | `.cell.active-cell` |
| Controls wrapper | `#controls` |
| Clear progress button | `#clear-btn` |
| Toggle buttons | `.toggle-opt` (`.active` on the selected one) |
| Clue list wrapper | `#clue-list` *(Snake Charmer)* |
| Clue list items | `.clue-item` |
| Clue text inside each item | `.clue-text` (child `<span>` of `.clue-item`) |
| Active clue item | `.clue-item.active-clue` *(Snake Charmer, Spiral)* / `.clue-group.active-clue` *(Marching Bands — applied to the group wrapper, not individual items)* |
| Correct state | `.correct` (on both cell paths and clue items) |
| Congratulations banner | `#congrats` |
| All-filled-but-wrong banner | `#done-wrong` |
| Per-entry circle decoration | `.style-circle` |
| Secondary-entry cells | `.cell.secondary-entry` *(Snake Charmer)* |
| Secondary-entry clue highlight | `.clue-item.secondary-entry` *(class-based across all tools)* |
| Inward/outward clue lists | `#inward-clues`, `#outward-clues` *(Spiral; the `.clue-section-inward` / `.clue-section-outward` wrappers hold them)* |
| Direction-tracking chevron | `#direction-chevron` *(Spiral)* |
| Center-curl spiral decoration | `#center-curl` *(Spiral)* |
| Fixed active-clue bar | `#active-clue-bar` *(absent in Marching Bands — three-column layout makes it unnecessary)* |
| Primary clue row in bar | `#active-clue-primary` (`.active-clue-row`) |
| Secondary clue row in bar | `#active-clue-secondary` (`.active-clue-row`) |
| Clue number/range in bar | `.active-clue-num` |
| Clue text in bar | `.active-clue-text` |
| Direction label in bar | `.active-clue-dir` *(Spiral only)* |
| Row number labels container | `#row-labels` *(Marching Bands)* |
| Individual row number label | `.row-label` *(Marching Bands)* |
| Grid + row-labels wrapper | `#grid-wrap` *(Marching Bands)* |
| Row clues list | `#rows-clues` *(Marching Bands)* |
| Band clues list | `#bands-clues` *(Marching Bands)* |
| Mode toggle (row/band) | `#mode-toggle` *(Marching Bands)* |
| Band letter in SVG | `.band-label` *(Marching Bands)* |
| Clue group (row/band cluster) | `.clue-group` *(Marching Bands — outer `<li>` wrapping all entries for one row or band; receives `active-clue`; clickable, see Clue click navigation)* |
| Clue number+letter label | `.clue-label` *(Marching Bands)* |
| Parent number/letter | `.clue-parent` (child of `.clue-label`) *(Marching Bands)* |
| Sub-letter within group | `.clue-letter` (child of `.clue-label`) *(Marching Bands)* |

**Structural note on `.clue-text`:** Each clue `<li class="clue-item">` must contain a `<span class="clue-text">` holding the clue string. This is required for the theme rule `.clue-item.correct .clue-text` (color + strikethrough on the text only). Tools whose clue items have additional spans (e.g. a `.clue-range` label) place `.clue-text` after them; tools with text-only items still wrap the text in the span.

**Theme requirement:** Every theme CSS file must define `.style-circle` with at minimum `fill` and `stroke`. Without it, circles render as black-filled shapes, which is visually destructive. The canonical definition is `fill: none; stroke: <color>; stroke-width: <value>;`. The structural rule `pointer-events: none` lives in `base.css` and does not need to be repeated in theme files.

---

## PUZZLE_DATA conventions

**`PUZZLE_DATA.cells` content:** `cells` holds per-cell *geometry* only, never entry-mapping data. Spiral stores its per-cell spiral geometry (`theta_start`, `r_inner_start`, …) in `data.cells`. Snake Charmer and Marching Bands carry no geometry in `data.cells`: Snake Charmer omits the array entirely (its ring geometry lives in `data.ring`, derived from `ring.N` by the shape renderers), and Marching Bands derives all geometry from the grid size `N`.

**Entry→cell mapping is always computed at engine init, never stored in PUZZLE_DATA.** It is fully derivable from entry lengths plus the tool's traversal rule, so carrying it in the HTML payload is redundant. Spiral builds `inwardMap`/`outwardMap`/`inwardEntryCells`/`outwardEntryCells` at init from `data.inward`/`data.outward`; Snake Charmer builds `entryAtCell`/`ringPosByEntry`/`canonicalStart` at init via `buildEntryMaps(data.entries, data.loops)`; Marching Bands computes its mapping from `N`.

**SVG element IDs:** All three tools assign `id="cell-{n}"` to SVG cell path elements and `id="letter-{n}"` to letter text elements. Marching Bands and Spiral use 1-indexed `n`; Snake Charmer uses 0-indexed `n` (matching its 0-indexed internal ring position). These IDs exist for debugging and cross-tool consistency; engines still keep parallel `cellPaths[]`/`letterTexts[]` arrays for O(1) access and use those internally rather than `getElementById`.

---

## `syncUI()` contract

**Rule:** `syncUI()` is the single function responsible for translating game state into DOM. It is called after every state change. Event handlers never update visual state directly — they mutate state (cell letters, cursor position, direction) and then call `syncUI()` or `focusCell()` (which calls `syncUI()`).

**Minimum responsibilities:** active-entry and active-cell cell classes, active-clue highlight, congrats banner visibility, done-wrong banner visibility, and Check Cell button disabled state (non-hashed mode). Tool-specific additions (e.g. direction chevron, secondary-entry highlight) are allowed but must follow the same pattern.

**Applies to:** each tool's `src/template/engine.js`.

---

## Focus management

**Rule:** Navigation keys (arrows, Backspace, Tab, Space) are handled by a `document`-level `keydown` listener, so they work even when the hidden input has lost focus (e.g. after clicking the page background or a heading).

The listener must guard against two cases:
- `!document.hasFocus()` — browser chrome (URL bar, devtools) has focus; don't swallow system shortcuts.
- `document.activeElement.tagName === 'BUTTON'` — a button has focus; skip so toggle-click events don't double-fire navigation.

Letter input still routes through `<input id="hidden-input">`. `focusCell()` restores hidden-input focus after every navigation action, so letter input continues to work after any keypress.

**CSS requirement:** `#hidden-input` must use `position: fixed; left: -9999px` (not `position: absolute`). `position: fixed` keeps the element permanently within the viewport, so browser focus-scroll is never triggered. `position: absolute` will cause the page to jump when the input is focused.

Every control that would otherwise steal focus from the hidden input (direction/loop toggle, Check Cell button, any future controls) must call `focusCell()` (or equivalent) so that the hidden input is refocused and the BUTTON guard is cleared before the next keystroke.

**How to verify:** Click anywhere on the page outside the puzzle grid, then press an arrow key. Navigation must work without clicking the puzzle again.

**Scroll key forwarding:** Because the hidden input holds focus, the browser suppresses native page-scrolling for keys that aren't puzzle actions — even without an explicit `preventDefault()`. The keydown handler must therefore explicitly forward scroll keys that the puzzle does not use to `window.scrollBy()`. Currently that means `ArrowUp`, `ArrowDown`, `PageUp`, and `PageDown`. Do not capture any key that has no puzzle action.

**History:** Spiral originally attached its `keydown` listener to the hidden input directly, making the puzzle deaf to keyboard input after any click outside the SVG. Spiral's direction toggle also called `syncUI()` directly instead of `focusCell()`, silently breaking keyboard navigation after a toggle click. Both issues were resolved by adopting the document-level listener pattern from Snake Charmer.

---

## Backspace semantics

**Rule:** Backspace clears the current cell if it contains a letter (cursor stays). If the cell is already empty, it retreats to the previous cell and clears that one. Never both-clear-and-move from a filled cell.

**How to verify:** Type a letter, press Backspace — letter clears, cursor stays. Press Backspace again — cursor moves back one cell and that cell clears.

---

## Space semantics

**Rule:** Space clears the current cell and advances to the next cell in the current direction. It does not advance without clearing.

**How to verify:** Type a letter, press Space — letter clears and cursor moves forward one cell.

---

## Period key — direction/mode toggle

**Rule:** Pressing `.` (period) toggles between the two directions of input without moving the cursor:

| Tool | Behavior |
|---|---|
| **Marching Bands** | Toggles between row mode and band mode |
| **Snake Charmer** | Cycles to the next loop (wraps from the last loop back to loop 0) |
| **Spiral** | Toggles between inward and outward |

The period key mirrors the effect of clicking the already-active cell or clicking the corresponding toggle button. `focusCell()` is called after mutating the direction/mode state so `syncUI()` fires and keyboard navigation continues without requiring a re-click.

**Applies to:** each tool's `src/template/engine.js` document-level `keydown` handler.

**How to verify:** While solving, press `.` — the active direction should switch, the clue highlight should update, and subsequent letter input should advance in the new direction.

---

## Tab / Shift+Tab entry navigation

**Rule:** Tab jumps to the first cell of the next entry in the current direction. Shift+Tab jumps to the first cell of the previous entry in the current direction. Both wrap. Direction switching is a separate action (toggle button or cell click), not a Tab side effect.

**Multi-loop puzzles (Snake Charmer):** Entries are indexed globally across all loops — loop 0 entries come first, then loop 1, and so on. Tab always advances to the globally next entry regardless of which loop it belongs to. Wrapping past the last entry of the last loop returns to entry 0 of loop 0. This means Tab will cross loop boundaries naturally; there is no separate "next entry in current loop" concept.

**Marching Bands:** Tab jumps to the first cell of the next row (row mode) or next band (band mode), not to the next individual entry. Marching Bands rows and bands each contain multiple entries whose boundaries are unknown to the solver — revealing entry divisions via Tab navigation would spoil the puzzle. This is an intentional tool-specific carve-out from the "jump by entry" rule.

**How to verify:** While in direction A, Tab repeatedly — should cycle through all entries in direction A without switching to direction B. In a multi-loop puzzle, Tab should visit all entries across all loops before wrapping back to entry 1.

---

## Clue click navigation

**Rule:** Clicking a clue item navigates to the first cell of the corresponding entry (or row/band) and focuses the puzzle.

**Snake Charmer / Spiral:** Each `<li class="clue-item">` is individually clickable. Clicking it sets the active entry direction (inward/outward for Spiral; no direction change needed for Snake Charmer) and calls `focusCell(firstCellOfEntry)`.

**Marching Bands:** Because entry boundaries are hidden from the solver, individual entries are not independently clickable. Instead, all entries for a single row or band are grouped under a `<li class="clue-group">` wrapper. Clicking anywhere in the group switches to the appropriate mode (`row` or `band`) and calls `focusCell(firstCellOfRow/Band)`. Individual `.clue-item` elements inside the group are non-interactive.

**How to verify:** Click any clue — the active cell should jump to the start of that entry (or row/band). For Spiral/Snake Charmer, direction should also update.

---

## Answer checking

**Both modes:** There are two parallel checking paths — non-hashed and hashed. Keep them symmetric: any behavior visible to the solver (when feedback appears, what gets marked, what banner shows) must be consistent between the two modes.

**Non-hashed:** A "Check Cell" button (disabled when the active cell is empty or already marked correct) calls `isCellCorrect()` and marks the active cell `.correct`. On every `input` event, `checkAllCellsIfFilled()` also runs: when all cells are filled it checks all and calls `syncUI()`, showing the congrats banner if every cell is correct, or the done-wrong banner if not.

**Hashed:** No Check Cell button. On every `input` event, `checkBoardIfFilled()` guards until all cells are filled, then hashes the board and compares to `boardHash`. If it matches, all cells and clue items are marked `.correct` and `syncUI()` is called.

**Editing removes correctness:** `setCellLetter()` (or equivalent) always strips `.correct` from a cell whenever a letter is set or cleared, so an overwritten cell reverts to unchecked state.

---

## Hashed-mode feedback timing

**Rule:** No correctness feedback is given until every cell on the board is filled. When all cells are filled, the entire board is hashed as a single string and compared to the stored `boardHash`. If it matches, all cells and clue items are marked correct and the congrats banner appears. If it does not match, only the done-wrong banner appears — no partial credit shown.

**Implementation pattern:** On each keystroke, advance the cursor via `focusCell()` (which always calls `syncUI()`), then call the hash check function synchronously. The hash check guards on all-cells-filled and calls `syncUI()` only when it has a result to report. This means two `syncUI()` calls on the winning keystroke — that is intentional and correct. Do not defer or skip the `focusCell` `syncUI()` call to coalesce them; doing so leaves the cell highlight stale on every non-final keystroke.

**How to verify:** In hashed mode, fill all cells of one entry correctly and leave the rest blank — no green should appear. Fill the entire board correctly — congrats banner appears.

---

## Print-mode state erasure

**Rule:** Printing a puzzle must produce a clean, unsolved appearance regardless of solve state. All cell fill colors (active, highlighted, correct) must reset to white. All clue styling (active highlight, correct strikethrough) must reset to unstyled.

**Applies to:** `shared/themes/print-base.css` (the cross-tool resets) followed by each tool's `template/print.css` (tool-specific layout and any extra cell-state selectors) — both concatenated *after* the theme CSS by `composeThemeCss`. `print-base.css` is the final override layer: its declarations are `!important`, so the resets win over any theme rule regardless of selector specificity or source order (without it, a theme highlight rule that ties or exceeds the reset's specificity could silently survive in print). A tool's `print.css` that needs to override a base reset must also use `!important`. The shared base covers the common selectors (`.cell`, `.cell.active-entry`, `.cell.active-cell`, `.cell.correct`, `.clue-item.active-clue`, `.clue-item.secondary-entry`, `.clue-item.correct .clue-text`); a tool's `print.css` adds only selectors the base doesn't list (e.g. snake's `.secondary-entry` cell variants, marching-bands' `.band-even`/`.band-odd`, marching-bands' `.clue-group.active-clue` which replaces the shared `.clue-item.active-clue` for that tool).

**How to verify:** Mark some cells correct, then print (or use browser print preview) — no green fills, no struck-through clues.

**History:** Spiral's print block reset active/highlighted cells but not `.correct` cells, so solved cells printed green. Snake Charmer's print block reset `.correct` clue strikethrough but not `.active-clue` background, so the focused clue printed highlighted. Both print blocks were originally in `base.css`, which is concatenated *before* the theme — theme rules at equal specificity silently defeated the print overrides. Fixed by moving print styles to `print.css` and appending it last.

---

## Congrats / done-wrong banners

**Rule:** The congrats banner (`#congrats`) appears when and only when every cell path carries `.correct`. The done-wrong banner (`#done-wrong`) appears when all cells are filled but congrats is not showing. Both are driven exclusively by `syncUI()` — event handlers never set banner visibility directly.

**`congratsDismissed` latch:** Each engine holds a `let congratsDismissed = false` flag. The congrats-dismiss overlay click sets it to `true`, hiding the banner and revealing the board. This flag is intentionally a one-way latch: once the solver dismisses the banner it never reappears, even if they subsequently erase a correct cell and re-solve. Resetting `congratsDismissed` on every board-state change would cause the banner to flash back unexpectedly during casual post-solve browsing.

---

## localStorage key format

**Rule:** Auto-save keys must include a tool discriminator to prevent cross-tool collisions. An author who publishes both a Snake Charmer and a Spiral puzzle with the same title and date would otherwise have them clobber each other's save.

| Tool | Key format |
|---|---|
| Snake Charmer | `vp:sc:<title>\|<date>` |
| Spiral | `vp:sp:<title>\|<date>` |
| Marching Bands | `vp:mb:<title>\|<date>` |

**Save format:** `{ v: 1, cellCount, letters, correct }` (Marching Bands uses `cellCount: N²−1` for odd N or `N²` for even N, where N is the grid size). The `v` field is a schema version; restore code must reject saves where `v !== 1` (enables clean future upgrades without leaking old-format data into new code).

**Guards:** Both `saveState()` and `restoreState()` return early if `title` or `date` is absent — a degenerate key like `vp:sc:|` would be a collision magnet across all untitled/undated puzzles of that type. Puzzles without dates do not get auto-save.

**Timing contract:** `saveState()` is called only at state-mutation sites — the backspace block, space block, input event handler, and answer-check handler. It is NOT called from `syncUI()`, which fires on every focus movement and would write identical data on every keystroke. `restoreState()` is called in `init()` just before the first `focusCell()`, so `.correct` classes are applied before `syncUI()` runs and the restored solved state is visible immediately. `clearState()` removes the key; it is called by the Clear button after the two-click arm sequence.

**Applies to:** each tool's `src/template/engine.js`.

**Clear button (`#clear-btn`):** A muted secondary button in `#controls`. Uses a two-click arm pattern: first click changes the label to "Sure?" and adds class `.armed` for 3 seconds; second click calls `clearState()` (removes the localStorage key) then `location.reload()`. The button carries `type="button"` to avoid accidental form submission. Its `min-width` is stabilised by a `base.css` rule `#clear-btn::after { content: 'Sure?'; display: block; height: 0; overflow: hidden; visibility: hidden; }` so the layout does not shift when the label changes.
