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
// unit-testing (Snake Charmer, Crushword). Spiral and Marching Bands have
// none — their testable logic is in layout.js/validator.js.

// ── DOM engine (browser only) ─────────────────────────────────────────────────
(function () {
  if (typeof document === 'undefined') return;  // only needed when module.exports follows

  function init() { /* everything below */ }

  document.addEventListener('DOMContentLoaded', init);
})();

// module.exports — only if pure helpers exist above
```

**The one rule that resolves scope confusion:** all mutable state and every function that touches state or the DOM lives inside `init()`. Pure, dependency-free, testable helpers — and only those — live at module scope above the IIFE.

### Canonical `init()` section order

Eight sections in fixed order, each introduced with a `// ── <name> ──` banner:

| # | Banner | Contents |
|---|--------|----------|
| 1 | `Data & constants` | `const data = window.PUZZLE_DATA` + derived dimensions/counts |
| 2 | `Geometry & index maps` | Pure geometry helpers (`rowOf`, `polar`, `cellPath`, `svgEl`, …) + precomputed index maps (`inwardMap`, `bandCellsMap`, …) |
| 3 | `State` | All mutable `let`s: active cell/position, direction/mode |
| 4 | `Logic functions` | Cell storage, navigation helpers, `focusCell`, `syncUI`, answer-checking, board-state helpers, `saveState`/`restoreState`/`clearState` declarations (via `setupStorage`), the congrats dialog (via `setupCongratsDialog`, which builds its own DOM and wires its own listeners — which is why *Event wiring* has nothing to say about it) |
| 5 | `Build SVG` | SVG element query, `viewBox`, layer groups (`cells < circles < flash < letters [< labels]`), cell elements, circle decorations, labels, any tool-specific SVG chrome (chevron, curl) |
| 6 | `Header & clues` | `renderByline`, `renderInstructions`, clue list DOM construction, inline rendering calls |
| 7 | `Event wiring` | Hidden input, check/clear buttons, toggle clicks, document `keydown` |
| 8 | `Restore & focus` | `restoreAndSeal({ restoreState, checker, latch, composer })` (`shared/engine-state.js` — runs `restoreState(); latch.sealIfSolved(checker.isSolved()); checker.repaintIfSolved();` in that exact order and returns the composing cell), then `focusCell(<initial>)` where `<initial>` is that returned cell or the tool's default |

**Invariant:** `init()` declares, builds, wires, then starts — it invokes no logic function until *Restore & focus*. Function declarations in *Logic functions* may safely reference `const`s from *Build SVG* (`flashLayer`, `cellPaths`, etc.) because those functions are only *called* from *Event wiring* and *Restore & focus*, after the SVG build has run.

**Applies to:** `spiral/src/template/engine.js`, `snake-charmer/src/template/engine.js`, `marching-bands/src/template/engine.js`, `crushword/src/template/engine.js`.

---

## CLI argument convention

**Rule:** Every tool CLI accepts `<input.yaml>` as its only required positional argument and uses `-o <output.html>` for an explicit output path. When `-o` is omitted, the output path defaults to `<input-basename>.html` written next to the input file. No tool may require a positional output argument.

**Usage line order:** `<input.yaml>` first, then `[options]` (including `-o`). Example: `Usage: mytool <input.yaml> [options]`.

**Applies to:** all tool `cli.js` files.

**How to verify:** Running `varietypack build puzzle.yaml` (no `-o`) must produce `puzzle.html` next to `puzzle.yaml`. Running with `-o out/foo.html` must write there, creating `out/` if it does not exist. Running with `-o` as the final argument must print an error and exit non-zero.

**Why `-o` over positional:** Once a tool has multiple optional flags (e.g. `--shape`, `--theme`), a bare positional output is ambiguous about ordering. Named flags scale uniformly across all tools regardless of how many options each tool has.

---

## Theme selection flag

**Rule:** Every tool CLI accepts `--theme <name>` to select a visual theme. The default is `broadsheet`. The theme allowlist is shared across all tools (`THEME_REGISTRY` in `shared/build/themeRegistry.js`), and all tools must ship at least `broadsheet` and `skeleton`. Unknown theme names must be rejected at the CLI with a usage error.

**Applies to:** all tool `cli.js` files.

**Theme semantics:** Themes are token files over a neutral shared layer. `shared/themes/theme-base.css` defines neutral `--theme-*` defaults; each theme is a `shared/themes/<name>-tokens.css` that overrides them. `shared/themes/theme-components.css` supplies all tool-agnostic, var-driven component styles (masthead, buttons, SVG cell states, congrats card) **plus** per-tool namespaced sections for tool-specific selectors (bands, chevrons, secondary cells). Each tool's `<body>` carries a `class="tool-<name>"` hook (e.g. `tool-snake-charmer`) that scopes the per-tool sections; there is no separate per-tool CSS file. Adding a new theme requires `<name>-tokens.css` and an entry in `THEME_REGISTRY` in `shared/build/themeRegistry.js`. Both `broadsheet` and `skeleton` ship as `<name>-tokens.css` files under this model. All themes must cover the full selector vocabulary required by the engine — any class or ID added to the engine must be styled via `--theme-*` vars in `theme-components.css` (either in the shared section or in the tool's namespaced section).

**Tool-specific optional flags** (e.g. `--shape` in Snake Charmer) are allowed and must not conflict with shared flag names. Tools document their own optional flags in their `CLAUDE.md` and `docs/SPEC.md`.

---

## Font flag

**Rule:** Every tool CLI accepts `--font embed|link` to control font delivery for themes that use custom fonts. The flag is silently ignored for system-font themes (`fonts: null` in the registry). For custom-font themes, omitting `--font` is an error.

- `--font embed` — base64-encodes font files into `@font-face` declarations; output is self-contained with no network dependencies. Font files must be committed to `shared/themes/fonts/<theme>/` and declared in the registry's `fonts.faces` array.
- `--font link` — emits a `@import url(...)` pointing at the CDN URL declared in the registry's `fonts.cdn.url`. The font loads in the solver's browser on every puzzle open; requires network access at solve time. Prefer Bunny Fonts over Google Fonts for GDPR-sensitive deployments.

**Applies to:** all tool `cli.js` files.

---

## Minify flag

**Rule:** Every tool CLI accepts `--minify` (boolean, default off). When set, the builder runs the generated HTML through `shared/build/minify.js` before writing it. Minification must be behavior-preserving — it never alters puzzle data or rendered output.

**Applies to:** all tool `cli.js` files; builders take it as `options.minify` and apply `minifyHtml()` to the composed HTML just before `fs.writeFileSync`.

**What it does:** terser-minifies the body of each `<script>` block (compress + mangle), clean-css-minifies the body of each `<style>` block, and strips comments / trailing whitespace / runs of blank lines from the surrounding HTML.

**Implementation gotcha:** the comment/whitespace pass is string-unaware, so it runs *only* on the segments outside `<script>`/`<style>` blocks. Running it over `<script>`/`PUZZLE_DATA` content or a CSS string value (e.g. `content: "…"`) would delete `/* … */` or `//` sequences that appear inside string literals (author text can contain anything), corrupting data or breaking the document. terser and clean-css own comment/whitespace removal inside their own blocks, parsing the language so string tokens survive.

---

## Instructions field

**Rule:** Every tool YAML accepts an optional `instructions` string field. When present, each hasher renders it as block-level markdown (see "Markdown formatting in clue and instructions text" below) into `window.PUZZLE_DATA.instructions` — blank lines become separate `<p>` elements, matching what author-facing docs describe. The engine's shared `renderInstructions(data)` helper (`shared/engine-chrome.js`) just injects that HTML via `innerHTML` into `<div id="instructions" hidden>`; paragraph splitting happens at build time, not in the browser. The `hidden` attribute is removed only when the field is present and non-empty. When absent, the element stays hidden and no empty div is rendered visibly.

**Snake Charmer exception:** Snake Charmer nests `<div id="instructions">` at the top of its `#clue-list` column (above the clue `<ol>`) rather than in a full-width band between the header and the ring — its ring-plus-clue-column layout has no such band, so the instructions sit atop the clue column by design. The element id, `hidden` toggle, and paragraph rendering are identical; only the container differs.

**Validation:** `instructions` must be a non-empty string if provided (checked against the raw source text, before markdown rendering). Whitespace-only strings are rejected.

**Applies to:** all tool validators, hashers/preparers, builders, `shared/build/builderUtils.js`'s `instructionsField` (where the markdown rendering happens, called from each hasher), the shared `renderInstructions(data)` helper (called from each engine's *Header & clues* section), and HTML templates.

**Why:** Variety puzzles often require format explanations (e.g., "Answers read inward from cell 1"). Without a standard instructions field, authors have no way to include per-puzzle explanatory text in the output HTML.

---

## Markdown formatting in clue and instructions text

**Rule:** Every entry's `clue` field, and the `instructions` field, accept a small markdown subset: `**bold**`, `*italic*`, `` `code` ``, `[text](url)` links, `~~strikethrough~~`, `H~2~O`-style subscript, `29^th^`-style superscript, and `:shortcode:` emoji. Rendering happens once, at **build time**, in Node — never in the browser, so the shipped puzzle HTML gains no runtime markdown dependency. Plain text with no markdown syntax renders unchanged.

**Typographic replacements:** straight `"quotes"` and `'apostrophes'` are curled, `--`/`---` become en/em dashes, and `...` becomes `…` — all via markdown-it's `typographer` option (its `replacements`/`smartquotes` core rules, off by default under the `'zero'` preset, are explicitly enabled). Prefix a character with `\` to force the literal: `\"` stays a straight quote, `\*` stays a literal asterisk instead of opening emphasis. This is markdown-it's own `escape` rule, also explicitly enabled — without it a `\` has no special meaning and passes through as a literal backslash, doing nothing to suppress a curl or emphasis pair.

**Implementation:** `shared/build/renderMarkdown.js` wraps `markdown-it` (`'zero'` preset, so only the rules above are enabled — no block structure like headings/lists/tables/images, and no autolinking of bare URLs; this format has short single-line/short-paragraph prose, not documents, and a wider rule set would only widen the input surface for no benefit here) plus the small official `markdown-it-sub`/`markdown-it-sup`/`markdown-it-emoji` plugins (strikethrough needs no plugin — it's a core `markdown-it` rule).

- `renderClueMarkdown(text)` — inline-only (`md.renderInline`), used for `clue`. No wrapping block element, since clue text lives inside a `<span class="clue-text">`.
- `renderInstructionsMarkdown(text)` — block-level (`md.render`), used for `instructions`. Blank-line-separated paragraphs each become their own `<p>`.

Both run at **prepare time**, inside each tool's hasher, so a `prepared` object is uniformly display-ready: `processEntries` (in `shared/build/builderUtils.js`, called by every tool for every entry — a muddled entry has no plaintext answer but still has clue text, so this runs unconditionally there too) renders clues, and `instructionsField` (same file, spread into every hasher's prepared object) renders instructions. `commonPuzzleData` passes the already-rendered instructions through untouched.

**Security:** `html: false` (markdown-it's own option) escapes any literal HTML in the source rather than passing it through, so a clue can never inject a tag — this matters because a muddled/source YAML is explicitly a distributable format (see root `CLAUDE.md` → Tool CLI contract), so clue text can arrive from someone other than the person building it. markdown-it's own default `validateLink` already rejects script-executing URL schemes (`javascript:`, `vbscript:`, etc.) for the `[text](url)` rule — no custom override needed. Every engine then injects the resulting string via `innerHTML` rather than `textContent`, which is safe specifically *because* the string was already escaped/rendered at build time — an engine must never `innerHTML` a raw, unrendered YAML string.

**`PUZZLE_DATA.clue` and `PUZZLE_DATA.instructions` hold rendered HTML, not plain text.** This is a departure from the general PUZZLE_DATA convention that string fields are plain text; it's called out here because it's easy to assume otherwise when reading an engine's `entry.clue` access.

**Applies to:** `shared/build/renderMarkdown.js`, `shared/build/builderUtils.js` (`processEntries`, `instructionsField`), every tool's `src/hasher.js`, `shared/engine-chrome.js` (`renderInstructions`), every tool's `src/template/engine.js` (clue-text elements, and Snake Charmer/Spiral/Crushword's active-clue-bar text), every tool's `docs/SPEC.md`.

**How to verify:** Build a puzzle with `**bold**` in a clue and blank-line-separated paragraphs with `*italic*` in `instructions`; open the HTML and confirm the clue list shows bold text (not literal asterisks) and the instructions block shows two separate `<p>` elements with italic text rendered.

---

## Keyboard shortcuts modal

**Rule:** Every tool exposes a keyboard-shortcuts reference via a fixed `?` button and the `?` key. Both are wired by `setupKeysOverlay(shortcuts, refocus)` from `shared/engine-chrome.js` — each engine calls it with a tool-specific `[[keys, description], …]` array and its `refocus`. The return value (the `<dialog>` element) is passed to `setupKeydown` as `{ keysOverlay }`.

**Creation:** `setupKeysOverlay` appends two elements to `<body>`:
1. `#keys-btn` — a fixed bottom-right corner button labelled `?`.
2. `#keys-overlay` — a native `<dialog>` holding `#keys-modal` (the visible card listing the shortcuts as a table of `<kbd>` + description rows). The dialog supplies the dialog/modal ARIA semantics implicitly when opened with `showModal()`; its dim is the `::backdrop` pseudo-element, not a wrapper div.

**Opening and closing:**
- Clicking `#keys-btn`, or pressing `?` (without Meta/Ctrl), focuses the puzzle and then calls `dialog.showModal()`. `showModal()` moves focus to the `autofocus` `#keys-close` button, traps Tab inside the dialog, makes the rest of the page inert, and paints the `::backdrop` in the top layer — so keystrokes and Tab can't reach the grid while it is up.
- Pressing `?` again, pressing Escape (native), clicking the backdrop (a click whose `target` is the dialog itself), or clicking `#keys-close` all close the dialog. Focus returns to the puzzle via the browser's native dialog focus-restoration: because the input is focused immediately *before* `showModal()`, the dialog's recorded restore target is the grid input, so every close path lands focus there with no explicit close handler and no race against the trigger button.

**Keystroke guard:** `setupKeydown` has a `keysOverlay` option; when the dialog is open (`keysOverlay.open`), the tool's keydown handler returns immediately, so no puzzle key fires while the modal is up.

**CSS:** `#keys-btn` layout (fixed position, size, z-index) lives in `shared/base.css`, alongside the `#keys-overlay` `<dialog>` reset — transparent frame, `margin: auto` to restore the UA modal centering that the global `* { margin: 0 }` reset would otherwise defeat, and the `::backdrop` dim. All colour/font styling for `#keys-btn`, the `#keys-overlay` backdrop, `#keys-modal`, `#keys-modal-header`, `#keys-close`, and `kbd` lives in `shared/themes/theme-components.css` using the standard `--theme-*` variables (`--theme-color-overlay` for the `::backdrop`, plus `--theme-color-bg`, `--theme-color-text`, `--theme-color-soft-border`, `--theme-color-btn2-*`). No per-theme overrides are required; the neutral page-level vars give the right contrast for every theme.

**Print:** `#keys-overlay` and `#keys-btn` are both hidden in `@media print` (see `shared/themes/print-base.css`).

**Applies to:** `shared/engine-chrome.js` (`setupKeysOverlay`, `setupKeydown`), all four `src/template/engine.js` files.

---

## Options menu

**Rule:** Every tool exposes rarely-used, potentially-destructive or puzzle-wide options — today just Clear — behind a fixed `☰` menu button rather than as a permanently visible control, so a stray click can't trigger them. Wired by `setupOptionsMenu(refocus)` from `shared/engine-chrome.js`, called from `setupControls` with the engine's `refocus`.

**Creation:** `setupOptionsMenu` appends two elements to `<body>`:
1. `#menu-btn` — a fixed top-right corner button labelled `☰`.
2. `#menu-panel` — a plain non-modal `<div role="menu">`, hidden by default, holding `#check-btn-toggle-label` (wrapping `#check-btn-toggle`) above `#clear-btn` (built here rather than templated in `index.html`, matching `#keys-btn`/`#keys-overlay`'s fully-JS-created pattern).

Every engine wires the menu, `#check-btn`, and the toggle below through one call, `setupControls({ checkBtn, hashed, onCheck, onClear, refocus, key })` (`shared/engine-chrome.js`).

**Why non-modal, unlike the keys overlay:** `#keys-overlay` is a `<dialog>` opened with `showModal()` because reading the shortcuts reference is a dead-end action — the solver isn't doing anything else while it's up, so making the page inert is free. The options menu is different: it's meant to house low-friction toggles a solver might want to flip while still seeing the board, so it's a plain `<div>` that never makes the page inert — the grid stays visible and clickable behind it.

**Opening and closing:**
- Clicking `#menu-btn` toggles the panel.
- Clicking anywhere outside `#menu-panel` and `#menu-btn`, or pressing Escape, closes it and calls `refocus()` — matching every other control that can steal focus from the hidden input (see "Focus management" below).
- Clicks *inside* the panel never close it on their own. This is what lets `#clear-btn`'s two-click arm/confirm sequence play out with the panel visibly open through the 3s "Are you sure?" window; the panel only closes once Clear is actually confirmed, not on the arming click.

**No keystroke guard needed:** unlike the keys overlay, `setupKeydown` needs no `{ menu }`-style option. Clicking `#menu-btn` or `#clear-btn` focuses a `BUTTON`, which `setupKeydown`'s existing focus guard (`document.activeElement.tagName === 'BUTTON'`) already skips — the same mechanism that already protects `#keys-btn`/`#rebus-btn` outside their own modal-specific cases.

**CSS:** `#menu-btn`/`#menu-panel` structural rules (fixed position, size, z-index) live in `shared/base.css`, mirroring `#keys-btn`. Colour/font styling lives in `shared/themes/theme-components.css` using the same `--theme-*` variables as `#keys-btn`/`#keys-modal`. Snake Charmer, Spiral, and Crushword override `#menu-btn`'s and `#menu-panel`'s `top` (`theme-components.css`) to sit within/below `#active-clue-bar`'s own band instead of at the plain values Marching Bands uses (it has no bar) — see the comment on those rules in `theme-components.css` for why this is pure `calc()`, not JS-computed.

**Print:** `#menu-btn` and `#menu-panel` are both hidden in `@media print` (see `shared/themes/print-base.css`).

**Check Cell button visibility toggle:** `#check-btn-toggle` (a checkbox inside `#check-btn-toggle-label`, reading "Show Check Cell button") lets a solver hide `#check-btn` if they know they won't use it. Absent entirely — not just disabled — in hashed builds, where `#check-btn` itself is hidden outright: the plain-text answer never ships there, so there is nothing to check against. The preference is display state, not board state, so it deliberately does **not** go through `setupStorage`/`resetBoard` — see "localStorage key format" below.

**Applies to:** `shared/engine-chrome.js` (`setupOptionsMenu`, `setupCheckBtnPref`, `setupControls`), `shared/base.css`, `shared/themes/theme-components.css`, `shared/themes/print-base.css`, all four `src/template/index.html` and `src/template/engine.js` files.

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
| Check-one-cell button | `#check-btn` (hidden in hashed builds) |
| Rebus (multi-letter entry) button | `#rebus-btn` (never hidden, never disabled — see "Enter / Rebus button") *(Snake Charmer, Spiral, Marching Bands — absent in Crushword, see "Crushword — explicit-commit typing")* |
| Keyboard-shortcuts trigger button | `#keys-btn` |
| Keyboard-shortcuts dialog (native `<dialog>`; dim is its `::backdrop`) | `#keys-overlay` |
| Keyboard-shortcuts modal card | `#keys-modal` |
| Keyboard-shortcuts modal header | `#keys-modal-header` |
| Keyboard-shortcuts close button | `#keys-close` |
| Options menu trigger button | `#menu-btn` |
| Options menu dropdown (plain, non-modal) | `#menu-panel` |
| Clear progress button (lives inside `#menu-panel`, not `#controls`) | `#clear-btn` |
| Check Cell visibility toggle (absent, not disabled, in hashed builds) | `#check-btn-toggle` (checkbox inside label `#check-btn-toggle-label`) |
| Toggle buttons | `.toggle-opt` (`.active` on the selected one) *(absent in Crushword — see "Crushword — explicit-commit typing")* |
| Clue list wrapper | `#clue-list` *(Snake Charmer)* |
| Clue list items | `.clue-item` |
| Clue text inside each item | `.clue-text` (child `<span>` of `.clue-item`) |
| Active clue item | `.clue-item.active-clue` *(Snake Charmer, Spiral, Crushword)* / `.clue-group.active-clue` *(Marching Bands — applied to the group wrapper, not individual items)* |
| Correct state | `.correct` (on both cell paths and clue items) |
| Solve-celebration dialog (native `<dialog>` appended to `<body>`, not to the puzzle markup) | `#congrats-dialog` |
| Solve-celebration card inside that dialog | `#congrats` |
| All-filled-but-wrong banner | `#done-wrong` |
| Per-entry circle decoration | `.style-circle` |
| Secondary-entry cells | `.cell.secondary-entry` *(Snake Charmer)* |
| Secondary-entry clue highlight | `.clue-item.secondary-entry` *(Snake Charmer, Spiral — applied to individual clue items)* / `.clue-group.secondary-entry` *(Marching Bands — applied to the group wrapper, not individual items)* |
| Inward/outward clue lists | `#inward-clues`, `#outward-clues` *(Spiral; the `.clue-section-inward` / `.clue-section-outward` wrappers hold them)* |
| Direction-tracking chevron | `#direction-chevron` *(Spiral)* |
| Center-curl spiral decoration | `#center-curl` *(Spiral)* |
| Fixed active-clue bar | `#active-clue-bar` *(Snake Charmer, Spiral, Crushword — absent in Marching Bands, see "Active-clue banner")* |
| Primary clue row in bar | `#active-clue-primary` (`.active-clue-row`) |
| Secondary clue row in bar | `#active-clue-secondary` (`.active-clue-row`) — *always shown (Snake Charmer, Spiral); `hidden` when the active cell has no crossing entry (Crushword)* |
| Clue number/range in bar | `.active-clue-num` |
| Clue text in bar | `.active-clue-text` |
| Direction label in bar | `.active-clue-dir` *(Spiral, Crushword — Snake Charmer's single loop needs no disambiguation)* |
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
| Cell composing a multi-letter entry | `.cell.composing` (styled as `.cell.active-cell.composing`) |
| Two-letter cell content | `.cell-letter.len-2` |
| Three-letter cell content | `.cell-letter.len-3` |
| Four-or-more-letter cell content | `.cell-letter.len-long` |
| Input caret (next-keystroke marker) | `.cell-caret` *(Crushword only — see "Crushword — explicit-commit typing")* |

**Structural note on `.clue-text`:** Each clue `<li class="clue-item">` must contain a `<span class="clue-text">` holding the clue string. This is required for the theme rule `.clue-item.correct .clue-text` (color + strikethrough on the text only). Tools whose clue items have additional spans (e.g. a `.clue-range` label) place `.clue-text` after them; tools with text-only items still wrap the text in the span.

**Theme requirement:** Every theme CSS file must define `.style-circle` with at minimum `fill` and `stroke`. Without it, circles render as black-filled shapes, which is visually destructive. The canonical definition is `fill: none; stroke: <color>; stroke-width: <value>;`. The structural rule `pointer-events: none` lives in `base.css` and does not need to be repeated in theme files.

**Multi-letter sizing is `transform`, never `font-size`.** Spiral writes its per-puzzle
letter size as an SVG presentation attribute, which any CSS `font-size` rule outranks —
`e2e/spiral.spec.js` asserts this. The `.cell-letter.len-*` rules therefore scale with
`transform`, which composes with each tool's base size. `transform-box: fill-box` is
required: SVG's default `view-box` origin would drag the text toward the viewport origin
instead of scaling it in place. The classes are computed from the **typed** content's
length, never the answer's capacity.

**Crushword overrides the shared `len-*` scale with a measured, per-cell `transform`,**
applied as an inline style after the shared class (kept as the semantic "this cell holds
N characters" marker) — still `transform`, never `font-size`, so the rule above is not
violated. See `crushword/CLAUDE.md` → "Dynamic per-cell letter sizing" and the
`fitLetterToCell` comment in its `engine.js` for why (the other tools' fixed scale
over/under-shrinks once cell width scales with `maxCellLetters`) and for the bug that
requires it to never be cleared to `''`.

---

## PUZZLE_DATA conventions

**`PUZZLE_DATA.cells` content:** `cells` holds per-cell *geometry* only, never entry-mapping data. Spiral stores its per-cell spiral geometry (`theta_start`, `r_inner_start`, …) in `data.cells`. Snake Charmer and Marching Bands carry no geometry in `data.cells`: Snake Charmer omits the array entirely (its ring geometry lives in `data.ring`, derived from `ring.N` by the shape renderers), and Marching Bands derives all geometry from the grid size `N`. Crushword likewise carries no `cells` array — its geometry (cell pixel coordinates, which cells are numbered) is cheap enough to derive at engine init from `data.grid` via the inlined `layout.js`/`grid.js` (see `crushword/CLAUDE.md` → "Build pipeline"), unlike Spiral's polar math, which is expensive enough to precompute once in the builder instead.

**Entry→cell mapping is always computed at engine init, never stored in PUZZLE_DATA.** It is fully derivable from entry lengths plus the tool's traversal rule, so carrying it in the HTML payload is redundant. Spiral builds `inwardMap`/`outwardMap`/`inwardEntryCells`/`outwardEntryCells` at init from `data.inward`/`data.outward`; Snake Charmer builds `entryAtCell`/`ringPosByEntry`/`canonicalStart` at init via `buildEntryMaps(data.entries, data.loops)`; Marching Bands computes its mapping from `N`.

**SVG element IDs:** All four tools assign `id="cell-{n}"` to SVG cell path elements and `id="letter-{n}"` to letter text elements. Marching Bands, Spiral, and Crushword use 1-indexed `n`; Snake Charmer uses 0-indexed `n` (matching its 0-indexed internal ring position). Crushword's `n` is row-major over the whole grid including blocked positions (`row*cols + col + 1`), the same scheme Marching Bands uses for its own skipped center cell. These IDs exist for debugging and cross-tool consistency; engines still keep parallel `cellPaths[]`/`letterTexts[]` (or, for Crushword, `cellRects{}`/`letterTexts{}` keyed by `n`) for O(1) access and use those internally rather than `getElementById`.

---

## `syncUI()` contract

**Rule:** `syncUI()` is the single function responsible for translating game state into DOM. It is called after every state change. Event handlers never update visual state directly — they mutate state (cell letters, cursor position, direction) and then call `syncUI()` or `focusCell()` (which calls `syncUI()`).

**Minimum responsibilities:** active-entry and active-cell cell classes, active-clue highlight, done-wrong banner visibility, and Check Cell button disabled state (non-hashed mode). The active-entry highlight covers every cell of the entry regardless of correctness — it shows where the cursor is, not what is left to solve — and `.correct` is a separate, independently-set class on the same element. The solve celebration is *not* among them — `syncUI()` passes solved-ness to `latch.check()`, and the latch decides whether to open the dialog. Tool-specific additions (e.g. direction chevron, secondary-entry highlight) are allowed but must follow the same pattern.

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

`#rebus-btn` is the one control that *prevents* the focus loss instead of repairing it — it cancels `mousedown`, whose default action is the focus change, so on touch and mouse focus never moves and the soft keyboard never closes. It still supplies a `refocus`, which covers the keyboard path (Tab to the button, activate with Space/Enter), where focus really does land on the button. See "Enter / Rebus button — rebus entry" for why this must not be `pointerdown`.

**Single-assignment invariant:** the active cell (`activeRingPos` / `activeCell` /
`activeN`) is assigned only inside `focusCell`, never at any other site. `focusCell` is
therefore the one place that needs `composer.commitIfMoved`. Any change that assigns the
active cell elsewhere breaks rebus commit coverage silently.

**How to verify:** Click anywhere on the page outside the puzzle grid, then press an arrow key. Navigation must work without clicking the puzzle again.

**Scroll key forwarding:** Because the hidden input holds focus, the browser suppresses native page-scrolling for keys that aren't puzzle actions — even without an explicit `preventDefault()`. The keydown handler must therefore explicitly forward scroll keys that the puzzle does not use to `window.scrollBy()`. Currently that means `ArrowUp`, `ArrowDown`, `PageUp`, and `PageDown`. Do not capture any key that has no puzzle action.

---

## Active-clue banner

**Rule:** A tool gets a fixed `#active-clue-bar` showing the active cell's clue(s) **when,
and only when, those clues are known from the cell alone.** Snake Charmer, Spiral, and
Crushword qualify. Marching Bands does not: working out where one clue ends and the next
begins is part of its solve, so a banner would have to guess, or list every still-possible
clue — up to eight or nine for an early cell. `#active-clue-bar` is absent from its markup
entirely, not merely hidden.

**Structure:** `#active-clue-primary` and `#active-clue-secondary` (both
`.active-clue-row`), each holding `.active-clue-num` and `.active-clue-text` (rendered
markdown set via `innerHTML` — see "Markdown formatting in clue and instructions text").
Tools whose two rows could be confused add a leading `.active-clue-dir` (Spiral's In/Out,
Crushword's Across/Down). Crushword `hidden`s the secondary row on a cell with no crossing
entry; the other two tools always have one.

**Layout:** `shared/base.css` reserves the bar's two-row height as `body` padding and
exposes it as `--active-clue-bar-space`; the bar's `min-height` fills that space so no
unpainted strip sits below it, and — because its clue text can never wrap (forced
`nowrap` + ellipsis) — pins its rendered height to exactly that reserved value always, not
just approximately. `#menu-btn` sits *within* the bar's own band, vertically centered
against that height, and `#menu-panel` opens directly below the bar's bottom edge
(`theme-components.css`, pure `calc()` against `--active-clue-bar-space` for both) — not
below the bar as a separate row, which would cost an entire extra row of vertical space on
mobile. See the comment on those rules in `theme-components.css` for why this is pure CSS
rather than JS-measured. The bar reserves right-side padding for the button so its own
clue text truncates before running under it.
Crushword's sticky grid instead reads `--active-clue-bar-space` directly
(`crushword/CLAUDE.md` → Page layout), since it must sit *below* the bar entirely, not
inside it. `print-base.css` hides the bar and drops the padding.

**Applies to:** `index.html`/`engine.js` for Snake Charmer, Spiral, and Crushword;
`shared/base.css`, `shared/themes/theme-components.css`, `shared/engine-chrome.js`.

---

## Backspace semantics

**Rule:** Backspace clears the current cell if it contains a letter (cursor stays). If the cell is already empty, it retreats to the previous cell and clears that one. Never both-clear-and-move from a filled cell.

**How to verify:** Type a letter, press Backspace — letter clears, cursor stays. Press Backspace again — cursor moves back one cell and that cell clears.

**Composing carve-out:** while a cell is composing, Backspace deletes its last character
and the cursor stays. On an empty composing cell it falls through to the rule above,
retreating and clearing — which commits the composing cell on the way.

**Crushword carve-out:** Backspace deletes the one letter before the cursor, never a whole
cell. From a cell's front it steps back and deletes the previous cell's last letter. See
"Crushword — explicit-commit typing".

---

## Space semantics

**Rule:** Space clears the current cell and advances to the next cell in the current direction. It does not advance without clearing.

**How to verify:** Type a letter, press Space — letter clears and cursor moves forward one cell.

**Composing:** Space behaves identically — it clears and advances, and the advance
commits the composing cell.

**Crushword carve-out:** Space keeps what's before the cursor, drops only what's after
it, then advances to the front of the next cell. With the cursor at the end — where typing
leaves it — nothing is dropped. See "Crushword — explicit-commit typing".

---

## Period key — direction/mode toggle

**Rule:** Pressing `.` (period) toggles between the two directions of input without moving the cursor:

| Tool | Behavior |
|---|---|
| **Marching Bands** | Toggles between row mode and band mode |
| **Snake Charmer** | Cycles to the next loop (wraps from the last loop back to loop 0) |
| **Spiral** | Toggles between inward and outward |
| **Crushword** | Toggles between across and down; does nothing on a cell with no entry in the other direction |

The period key mirrors the effect of clicking the already-active cell or clicking the corresponding toggle button. `focusCell()` is called after mutating the direction/mode state so `syncUI()` fires and keyboard navigation continues without requiring a re-click.

**Applies to:** each tool's `src/template/engine.js` document-level `keydown` handler.

**How to verify:** While solving, press `.` — the active direction should switch, the clue highlight should update, and subsequent letter input should advance in the new direction.

---

## Enter / Rebus button — rebus entry

**Applies to Snake Charmer, Spiral, and Marching Bands only.** Crushword has no separate
rebus mode and no `#rebus-btn` — see "Crushword — explicit-commit typing" below.

**Rule:** `Enter` **and** the `#rebus-btn` control open multi-letter (rebus) entry on the
active cell. While a cell is composing, letters append to it and the cursor holds; a
second activation commits, and the cursor stays on the cell — committing never advances
it. Any action that moves the cursor off the cell also commits it.

Existing content is **kept** when composition begins, so a cell holding `H` grows into
`HAR` without retyping and no input is ever destroyed.

**The spoiler rule:** nothing in the UI may vary as a function of a cell's capacity.
`Enter` is bound in every tool unconditionally and `#rebus-btn` is never disabled, never
hidden, and identical in hashed and non-hashed builds, so neither reveals whether a
puzzle contains a rebus cell — or which square is one. **Cell capacity never triggers
auto-advance** for the same reason; advancing the moment a cell fills would reveal which
squares are rebus. That is a spoiler in every tool, and would be fatal in a format where
the segmentation itself is the puzzle. `#check-btn` sits beside `#rebus-btn` in
`#controls` and *is* toggled per-cell and hidden when hashed — do not copy it.

**Implementation:** `makeComposer` in `shared/engine-state.js`; `setupRebusButton` in `shared/engine-chrome.js`.
Each engine calls `composer.commitIfMoved(n)` as the first statement of `focusCell`;
because the active cell is assigned nowhere else, that single call site covers arrows,
Tab, Space, cell clicks, clue clicks and toggles. A same-cell focus (a direction or mode
toggle) is a no-op, so composition survives `.`.

Both entry points route through one per-engine `toggleRebus()`, so the composer call
cannot drift. Their *guards* are separate code and have to be kept in step by hand: the
click handler repeats `setupKeydown`'s meta/ctrl early return, so a modified click is
ignored exactly as `Cmd+Enter` is. The engine's `syncUI()` calls `rebusBtn.sync()`, which
is what restores the label when composition ends by a cursor move rather than by the
button.

`const rebusBtn` is declared **above** `syncUI` in the three engines that have one (Snake
Charmer, Spiral, Marching Bands — Crushword has no `#rebus-btn`), because `syncUI` calls
`rebusBtn.sync()`. The other ids `syncUI` reads are declared further down and are safe
only because `syncUI` first *runs* in Restore & focus — a temporal-dead-zone trap one
reordering away. Do not "fix" a future TDZ error with `rebusBtn?.sync()`: that silently
stops updating the label instead of throwing.

**Why the button binds `mousedown` and `click` separately:** focus-on-click is a
`mousedown` default action, so cancelling `mousedown` keeps focus on `#hidden-input` and
a phone's soft keyboard stays up, while `click` still fires and keeps the button
reachable by keyboard. `refocus` covers that keyboard path, where focus *does* land on
the button and letters would otherwise go nowhere; it runs even on a solved board, since
the focus-management rule above admits no exceptions.

**It must be `mousedown`, never `pointerdown`.** See `shared/engine-chrome.js`
(`setupRebusButton`) for why. That distinction is why `playwright.config.js` runs a
`webkit` project and `e2e/snake-charmer.spec.js` has a `hasTouch` tap test — a
Chromium-only suite once reported green while the button was inert on iOS.

**Why the button needs its own `latch.solved` guard:** every engine's `if (latch.solved)
return;` lives inside the callback passed to `setupKeydown`, and a click never passes
through it. Without the guard in `setupRebusButton`, composition could open on a sealed
board. Pinned by `shared/test/engine-chrome.rebus-button.test.js` and by the
`#rebus-btn` click appended to each tool's "a solved board restores…" e2e.

**Composition is saved state, not live UI state.** See `shared/engine-state.js`
(`makeComposer`'s `getComposing`/`restore`) for why the composing cell id is part of every
tool's autosave payload (`composing:`) and what breaks without it. Each engine's Restore &
focus epilogue resumes the cursor on the restored composing cell explicitly — comparing
with `=== null`, not `??` (a cell id of `0` is valid and falsy) — because `focusCell`'s
`commitIfMoved` would otherwise commit the cell on the way to the default cell and
re-save with `composing: null`.

**Known limitation (touch):** letter entry *into* a composing cell still routes through
the IME. `makeComposer`'s composing path appends the whole input value, so an IME that
re-delivers its full composition buffer on each `input` event (rather than a delta) would
accumulate prefixes. Unverified — it needs a real device, not Playwright's device
emulation, which supplies touch and a viewport but still uses a desktop browser's input
stack.

**How to verify:** press `Enter`, type two letters — both appear in one cell and the
cursor does not move. Press `Enter` again — composition closes and the cursor stays on
the cell. Repeat using the **Rebus** button; its label reads **Done** while composing.

---

## Crushword — explicit-commit typing

**Applies to Crushword only.** The other three tools follow "Enter / Rebus button" above.

**Rule:** Crushword has no rebus mode and no `#rebus-btn`. Every cell composes from its
first keystroke, and a letter keystroke never advances the cursor, except when it brings
the cursor to `maxCellLetters`. That bound is puzzle-wide, so reaching it reveals nothing
about any one cell. Everything else that leaves a cell — Tab, Space, Enter, a click, an
arrow crossing a cell edge — commits it through `focusCell`'s `commitIfMoved`, as in the
other tools.

Within the active cell, a cursor position decides where edits land: typing inserts there
(overwriting once the cell is full), Backspace deletes before it, and ←/→ step through a
cell's letters before crossing into the next. The shared dashed composing outline is
suppressed, since it would be on for nearly every cell; a `.cell-caret` marks the cursor
instead.

**Why no mode:** with auto-advance, a plain keystroke on a cell holding one letter can't
mean both "extend this cell" and "retype it", so an explicit rebus gesture has to exist.
Without auto-advance the ambiguity is gone, and with it the need for a mode.

**Known limitation:** the last cell typed stays composing, so a board finished in a cell
short of `maxCellLetters` isn't counted complete until something commits it (Enter, Tab,
Space, a click). Accepted as a cost of the model.

Per-key behavior and implementation notes: `crushword/CLAUDE.md` → "Typing and the
cursor". Solver-facing summary: `crushword/docs/SPEC.md`.

**How to verify:** type two letters into an empty cell — both land in it and the cursor
holds. Press ← and type — the letter is inserted between them. Keep typing to
`maxCellLetters` — the cursor advances on its own.

---

## Tab / Shift+Tab entry navigation

**Rule:** Tab jumps to the first cell of the next entry in the current direction. Shift+Tab jumps to the first cell of the previous entry in the current direction. Both wrap. Direction switching is a separate action (toggle button or cell click), not a Tab side effect.

**Multi-loop puzzles (Snake Charmer):** Entries are indexed globally across all loops — loop 0 entries come first, then loop 1, and so on. Tab always advances to the globally next entry regardless of which loop it belongs to. Wrapping past the last entry of the last loop returns to entry 0 of loop 0. This means Tab will cross loop boundaries naturally; there is no separate "next entry in current loop" concept.

**Marching Bands:** Tab jumps to the first cell of the next row (row mode) or next band (band mode), not to the next individual entry. Marching Bands rows and bands each contain multiple entries whose boundaries are unknown to the solver — revealing entry divisions via Tab navigation would spoil the puzzle. This is an intentional tool-specific carve-out from the "jump by entry" rule.

**How to verify:** While in direction A, Tab repeatedly — should cycle through all entries in direction A without switching to direction B. In a multi-loop puzzle, Tab should visit all entries across all loops before wrapping back to entry 1.

---

## Clue click navigation

**Rule:** Clicking a clue item navigates to the first cell of the corresponding entry (or row/band) and focuses the puzzle.

**Snake Charmer / Spiral / Crushword:** Each `<li class="clue-item">` is individually clickable. Clicking it sets the active entry direction (inward/outward for Spiral, across/down for Crushword; no direction change needed for Snake Charmer) and calls `focusCell(firstCellOfEntry)`.

**Marching Bands:** Because entry boundaries are hidden from the solver, individual entries are not independently clickable. Instead, all entries for a single row or band are grouped under a `<li class="clue-group">` wrapper. Clicking anywhere in the group switches to the appropriate mode (`row` or `band`) and calls `focusCell(firstCellOfRow/Band)`. Individual `.clue-item` elements inside the group are non-interactive.

**Links inside a clue:** a click whose target is inside an `<a>` (see "Markdown formatting in clue and instructions text") returns early in every engine's clue/group click handler, so following the link never also moves the cursor.

**How to verify:** Click any clue — the active cell should jump to the start of that entry (or row/band). For Spiral/Snake Charmer, direction should also update.

---

## Rebus cells (multi-letter cells)

**Author-facing grammar, mental model, and per-tool authoring rules live in
`docs/AUTHORING.md` → "Rebus cells" — read that first if you're just
writing a puzzle YAML.** This section is the implementation contract: what
the code does with a bracket group, for anyone extending an engine or
validator.

**Rule:** In an `answer:`, every character normally occupies its own cell. A run wrapped in `[...]` occupies exactly one cell instead:

```yaml
answer: "S[HAR]ON"   # cells: s | har | o | n  (4 cells, not 6)
```

**Cell count, not letter count.** Bracket contents are normalized like the rest of the answer (letters only, lowercased). `entryLength` and every validation rule built on it — entry lengths, ring size, row/band totals — count *cells*: `S[HAR]ON` is 4 cells, the same as `MALL`, despite having 6 letters. `length:` in a muddled file is likewise a cell count. An answer with no brackets parses exactly as before, so existing puzzles and authors who never use the notation are unaffected.

**Grammar errors** (each reported with the entry's label):

| Condition | Result |
|---|---|
| Unclosed `[` | error |
| Unmatched `]` | error |
| Nested `[` inside a group | error |
| Bracketed group with no letters (e.g. `[--]`) | error |
| Bracketed group of exactly one letter (e.g. `[A]`) | legal and silent — identical to a bare `A` |
| Bracketed group of 5+ letters | warning ("is that intended?") — 4 or fewer is silent |

**Why `[A]` is allowed rather than warned:** it produces the same cell as a bare `A`, so it is redundant but never wrong. In a dense rebus grid an author may reasonably bracket every cell for uniformity (`[S][HAR][O][N]`), and warning on each would fire many times per puzzle — training authors to ignore warnings, which costs more than the redundancy.

**Per-tool cross-check rules,** each enforced by that tool's validator:

| Tool | Rule |
|---|---|
| **Spiral** | Outward answers repeat each rebus cell in **forward** order. The reversal constraint reverses the *order of the cells*, never the letters inside one. Inward `S[HAR]ON` pairs with outward `NO[HAR]S`, never `NO[RAH]S`. |
| **Snake Charmer** | Every loop must bracket the same groups at the same cells. The period constraint applies in cell space: loop 1 must reproduce loop 0's cells exactly, not merely the same letters split differently. |
| **Marching Bands** | A row and its crossing band must bracket a shared cell identically. Every cell belongs to one Row word and one Band word, and the build cross-checks that they agree as *cells*, not as letters. |
| **Crushword** | A crossing Across and Down entry must bracket their shared square identically — the validator cross-checks them as *cells*, not as letters. Crushword also bounds rebus width per puzzle with `maxCellLetters` (default 3), the only tool-level cap on how many letters one cell may hold. |

**Applies to:** `shared/build/builderUtils.js` (`parseAnswerCells`, `entryCells`, `entryLength`), `shared/build/validateEntry.js`, `shared/build/muddleUtils.js`, all four tool validators, and the per-tool `docs/SPEC.md` files (which carry the tool's own rule and a pointer here and to `docs/AUTHORING.md`).

---

## Muddled YAML format version

**Rule:** Every muddled YAML (the output of `varietypack muddle`) carries a top-level `format: 2`. Full statement — including why it's a version field rather than silent reinterpretation — in root `CLAUDE.md` → "Muddled YAML format".

**Applies to:** `shared/build/builderUtils.js` (`validateCommonHeader`), `shared/build/muddleUtils.js` (`buildMuddledYaml`), every tool's validator (which calls `validateCommonHeader`).

---

## Answer checking

**Both modes:** There are two parallel checking paths — non-hashed and hashed. Keep them symmetric: any behavior visible to the solver (when feedback appears, what gets marked, what banner shows) must be consistent between the two modes.

**Non-hashed:** A "Check Cell" button (disabled when the active cell is not filled — empty or composing — or already marked correct) calls `isCellCorrect()` and marks the active cell `.correct`. On every `input` event, `checkIfFilled()` (from `makeBoardChecker`, see below) also runs: when all cells are filled it checks all and calls `syncUI()`, opening the congrats dialog (via the latch) if every cell is correct, or showing the done-wrong banner if not.

**Hashed:** No Check Cell button. On every `input` event, the same `checkIfFilled()` guards until all cells are filled, then hashes the board and compares to `boardHash`. If it matches, all cells, and clue items in the tools that mark them, are marked `.correct` and `syncUI()` is called.

**Cell-at-a-time comparison, and why hashed mode needs a delimiter:** `isCellCorrect(typed, letter)` compares one cell's typed content against that cell's full stored content (which may be a multi-letter rebus group) — never a single character against a single character. Non-hashed mode is therefore already "per cell" by construction. Hashed mode has no per-cell stored letters to compare against — it has one hash of the whole board — so it must reconstruct that same cell boundary information some other way: joining normalized cells with `CELL_DELIM` before hashing (see "`solution` — canonical board string per tool" below) is what makes the hashed path symmetric with the non-hashed one instead of accepting any board whose cells concatenate to the same letters.

**Editing removes correctness:** `setCellLetter()` (or equivalent) always strips `.correct` from a cell whenever a letter is set or cleared, so an overwritten cell reverts to unchecked state.

**"Filled" excludes composing cells.** A cell counts as filled when it holds content and
is not composing (`composer.isCellFilled(n)` — the single predicate that replaced every
per-engine emptiness check). **Every path that applies `.correct` to a cell has itself
checked `isCellFilled` on that cell**: `makeBoardChecker`'s `checkIfFilled` via its
all-filled guard, and the Check Cell handler via an explicit guard inside the function —
not via the button's `disabled` state, which is UX only. `applyState` satisfies the rule
vacuously: nothing is composing at restore time.

Without this, a mid-composition prefix can be a *correct* board — if the last cell should
hold `HA` and the solver is part-way through typing `HAR`, an unsuppressed check sees a
solved board and seals the one-way completion latch, so `varietypack:complete` fires for a
half-entered board and never fires again when the solver actually finishes.

**`syncUI()`'s latch call carries no composing exclusion — and is safe structurally, not
by construction.** `syncUI()` calls `latch.check(checker.isSolved())`, and `isSolved()`
reads each cell's `.correct` marker, not its fill state. Unlike `checkIfFilled`, it
therefore cannot suppress a mid-composition board on its own: nothing in that call path
consults `isCellFilled`. What makes it safe is that the dangerous state is unreachable.
Reaching all-cells-marked while a cell is composing would mean composing on a board that
is *already* solved — and once it is, `latch.solved` is true on **both** routes into
composition: every engine's keydown handler returns at its first statement, before the
`Enter` branch is ever read, and `setupRebusButton`'s click handler returns before
`onToggle`. Composition cannot start on either, so `isSolved()` can never observe one in
progress. A guard on only one route would not do — a click never passes through
`setupKeydown`, so the keydown guard alone leaves `#rebus-btn` an open door.
**This is load-bearing, and both guards are tested** — the "a solved board restores …"
e2e in Snake Charmer/Spiral/Marching Bands' `e2e/*.spec.js` presses `Enter` *and* clicks
`#rebus-btn` on the restored solved board, asserting no cell goes composing either way.
Crushword's equivalent presses `Enter` and types a letter instead, since typing is its
only route into composing; its `input` handler carries the same `latch.solved` guard. (It lives there because a post-`reload()` page has a sealed latch without
having opened a dialog; appending it to "board is locked after solve" would put key
injection immediately after a native-dialog Escape, where it is unreliable — see root
`CLAUDE.md` → e2e letter input.) What remains untested is the *reachability* half of the
argument: a refactor that marks cells `.correct` without going through `checkIfFilled`
could produce a solved board while a cell composes, by a route no test covers. Such a
change must give `latch.check` its own composing exclusion rather than relying on this.

**One function serves both modes.** `makeBoardChecker` (in `shared/engine-state.js`) is
the board-state and answer-checking core shared by every tool. The guard,
the `syncUI()` calls and the solved-board marking are shared; `hashed` selects only how
correctness is evidenced — a per-cell `isCellCorrect` comparison against `data.letters`,
or one SHA-256 of the delimited board string against `boardHash`. The two modes are
therefore symmetric by construction rather than by two copies kept in step by hand. The
engines supply only what genuinely differs: the cell enumeration and what "solved"
paints (Snake Charmer, Spiral and Crushword mark clue items; Marching Bands marks none, since its
clue groups deliberately hide entry boundaries).

---

## Hashed-mode feedback timing

**Rule:** No correctness feedback is given until every cell on the board is filled (`isCellFilled` — a composing cell does not count as filled). When all cells are filled, the entire board is hashed as a single string and compared to the stored `boardHash`. If it matches, all cells, and clue items in the tools that mark them, are marked correct and the congrats dialog opens. If it does not match, only the done-wrong banner appears — no partial credit shown.

**Implementation pattern:** On each keystroke, advance the cursor via `focusCell()` (which always calls `syncUI()`), then call the hash check function synchronously. The hash check guards on all-cells-filled and calls `syncUI()` only when it has a result to report. This means two `syncUI()` calls on the winning keystroke — that is intentional and correct. Do not defer or skip the `focusCell` `syncUI()` call to coalesce them; doing so leaves the cell highlight stale on every non-final keystroke.

**How to verify:** In hashed mode, fill all cells of one entry correctly and leave the rest blank — no green should appear. Fill the entire board correctly — congrats dialog opens.

---

## Print-mode state erasure

**Rule:** Printing a puzzle must produce a clean, unsolved appearance regardless of solve state. All cell fill colors (active, highlighted, correct) must reset to white. All clue styling (active highlight, correct strikethrough) must reset to unstyled.

**Applies to:** `shared/themes/print-base.css` (the cross-tool resets) followed by each tool's `template/print.css` (tool-specific layout rules) — both concatenated *after* the theme CSS by `composeThemeCss`. `print-base.css` is the final override layer: its declarations are `!important`, so the resets win over any theme rule regardless of selector specificity or source order (without it, a theme highlight rule that ties or exceeds the reset's specificity could silently survive in print). A tool's `print.css` that needs to override a base reset must also use `!important`. The shared base covers all cell-state selectors (`.cell`, `.cell.active-entry`, `.cell.active-cell`, `.cell.correct`, `.cell.secondary-entry`) and clue-state selectors (`.clue-item.active-clue`, `.clue-item.secondary-entry`, `.clue-item.correct .clue-text`). A tool's `print.css` handles only tool-specific non-cell overrides — e.g. MB's `.clue-group.active-clue` (MB uses `.clue-group` not `.clue-item` for clue highlights) and layout adjustments. Do not add per-tool cell-state selectors to a tool's `print.css` — the shared `!important` reset already covers every cell class.

**How to verify:** Mark some cells correct, then print (or use browser print preview) — no green fills, no struck-through clues.

---

## Solve celebration / done-wrong banner

**Rule:** The done-wrong banner (`#done-wrong`) appears when all cells are filled but not every cell carries `.correct`. It is driven exclusively by `syncUI()` — event handlers never set its visibility directly.

The solve celebration is **not** a banner and is not `syncUI()`-driven. `syncUI()` reports solved-ness to `latch.check()`; the latch fires `onComplete` on the first false→true transition only, which opens the `#congrats-dialog` modal. The difference is observable: the done-wrong banner is re-derived on every `syncUI()` and so reappears whenever the board is in that state, while the celebration fires once per page load and does not reopen on a reload of a solved board (see "Emission guarantee").

---

## localStorage key format

**Rule:** Auto-save keys must include a tool discriminator to prevent cross-tool collisions. An author who publishes both a Snake Charmer and a Spiral puzzle with the same title and date would otherwise have them clobber each other's save.

| Tool | Key format |
|---|---|
| Snake Charmer | `vp:sc:<title>\|<date>` |
| Spiral | `vp:sp:<title>\|<date>` |
| Marching Bands | `vp:mb:<title>\|<date>` |
| Crushword | `vp:cw:<title>\|<date>` |

**Save format:** every tool's payload shares this field set: `{ v: 1, cellCount, letters, correct, activeMs, composing }`. `letters` and `correct` are shaped per tool (array vs. object, keyed how the tool addresses cells) — see each tool's own `CLAUDE.md` → its save-format section for its exact shape (Marching Bands, for instance, uses `cellCount: N²−1` for odd N or `N²` for even N, where N is the grid size). `v` is a schema version; restore code must reject saves where `v !== 1` (enables clean future upgrades without leaking old-format data into new code). `activeMs` is the accumulated active-solve time in ms. `composing` is the id of the cell left mid-composition, or null — see "Composition is saved state" above.

**`correct` carries cells only, deliberately.** Everything else a solved board shows is derivable, so it is re-derived at restore rather than persisted — `checker.repaintIfSolved()` re-runs `markSolved()` when every restored cell is marked, which is what puts the clue-item `.correct` marks back in the tools that paint them. Do not add a clue array to the payload; that would be a schema change for state the marks already imply.

**Guards:** Both `saveState()` and `restoreState()` return early if `title` or `date` is absent — a degenerate key like `vp:sc:|` would be a collision magnet across all untitled/undated puzzles of that type. Puzzles without dates do not get auto-save.

**Timing contract:** `saveState()` is called only at state-mutation sites — the backspace block, space block, input event handler, and the answer-check handler's **correct branch only**. A wrong guess from Check Cell marks nothing and must not write (pinned by the Check Cell pair in each tool's `e2e/*.spec.js`); the elapsed time its write used to flush reaches storage at the next mutation site instead, or on `visibilitychange→hidden` (pinned by `shared/test/engine-state.timer.test.js`). It is NOT called from `syncUI()`, which fires on every focus movement and would write identical data on every keystroke. Restore runs through `restoreAndSeal` (the "Restore & focus" row of "Engine bootstrap & structure") just before the first `focusCell()`, so `.correct` classes are applied before `syncUI()` runs and the restored solved state is visible immediately. `clearState()` removes the key; it is called by the Clear button after the two-click arm sequence.

**Applies to:** each tool's `src/template/engine.js`.

**Clear button (`#clear-btn`):** Lives inside the options menu (`#menu-panel`, see "Options menu" above), not `#controls` — moving the board-reset action out of the always-visible controls row and behind a deliberate open-the-menu step is what keeps a stray click from resetting real solving progress. Labeled "Clear Puzzle". Uses a two-click arm pattern: first click changes the label to "Are you sure?" and adds class `.armed` for 3 seconds; second click runs the engine's `resetBoard` (see the contract below) and closes the menu. The button carries `type="button"` to avoid accidental form submission. Since `#clear-btn` is `width: 100%` of the panel (`theme-components.css`), it's `#menu-panel` itself whose shrink-to-fit width would otherwise change with the label — stabilised by a `base.css` rule `#clear-btn::after { content: 'Are you sure?'; display: block; height: 0; overflow: hidden; visibility: hidden; }` reserving the wider of the two labels (measured — "Are you sure?" beats "Clear Puzzle" despite having fewer wide characters), so the panel doesn't visibly narrow while armed.

**Check Cell button visibility preference — its own key, deliberately outside the board save.** `setupCheckBtnPref(key)` persists under `<the puzzle's own key>:showCheckBtn`, not a field inside the `setupStorage` blob `resetBoard()`'s `clearState()` erases. It is a display preference the solver set for this puzzle, not board state, so Clear Puzzle must leave it alone — pinned by an e2e test asserting the toggle and `#check-btn`'s hidden state both survive a full Clear cycle. Absent (first load, or a puzzle saved before this feature existed) defaults to visible, matching the checkbox starting checked. Not built on `setupStorage` itself: that helper's `v`/`cellCount` schema-version guard is board-shaped and meaningless for a lone boolean.

**`resetBoard()` contract:** Each engine's `resetBoard()` (Clear and Play again) calls `resetAndRefocus` (`shared/engine-state.js`), which fixes the order: `composer.reset()` first, then the engine's `clearBoard`, `clearState()`, `timer.reset()`, `latch.reset()`, and the engine's `focusInitial` last — the function's comment says why the ends are pinned. `clearBoard` must return the board to its freshly-loaded state:

- Zero all letter state, clearing each letter's text through `setLetterText` (never a raw `textContent` write, which leaves a stale `len-*` class).
- Remove `.correct` from all cells and letters, and from clue items in the tools that mark them (Snake Charmer, Spiral, Crushword — Marching Bands marks none).
- Empty `flashLayer`.
- Reset the navigation sub-mode to its initial value (`mode = 'row'` for Marching Bands, `direction = 'inward'` for Spiral, `direction = 'across'` for Crushword; Snake Charmer's loop resets through `focusInitial`).

No page reload occurs — the board resets entirely in memory.

---

## Completion event — `varietypack:complete`

**Rule:** On the first false→true transition of "board solved" during a page load, every engine emits `varietypack:complete` on `.puzzle-main` and posts to `window.parent`. Implemented via `makeCompletionLatch` in `shared/engine-state.js`.

### CustomEvent

```js
new CustomEvent('varietypack:complete', {
  bubbles: true,
  composed: true,
  detail: { boardHash, kind, title, date, timeMs, solution },
})
```

**Target:** `.puzzle-main` — the shared outer puzzle container present in all four tools.

**`detail` fields:**

| Field | Type | Description |
|---|---|---|
| `boardHash` | string (64-char hex) | SHA-256 of the canonical board string. Always present in both hashed and non-hashed builds. |
| `kind` | string | `"snake-charmer"`, `"spiral"`, `"marching-bands"`, or `"crushword"` |
| `title` | string | Puzzle title from YAML |
| `date` | string | Puzzle date from YAML (may be `undefined` for puzzles without a `date` field) |
| `timeMs` | number | Active solve time in ms — see Timing semantics below |
| `solution` | string | Normalized board string (SHA-256 preimage) — `sha256hex(solution) === boardHash` |

### postMessage (iframe embedding)

```js
window.parent?.postMessage(
  { type: 'varietypack:complete', boardHash, kind, title, date, timeMs },
  '*'
)
```

**`solution` is intentionally absent from `postMessage`.** The `'*'` targetOrigin broadcasts to any parent host. In hashed builds, `solution` is proof-of-knowledge and must not be broadcast to unknown origins. In non-hashed builds the answers are in the HTML anyway, so this is a belt-and-suspenders exclusion.

### `solution` — canonical board string per tool

| Tool | String |
|---|---|
| Snake Charmer | Ring cells in traversal order (loop 0), each normalized (lowercased), joined with `CELL_DELIM` |
| Spiral | Inward cells 1 → N, each normalized (lowercased), joined with `CELL_DELIM` |
| Marching Bands | Row-major order (1 → N²), skipping the center cell, each normalized (lowercased), joined with `CELL_DELIM` |
| Crushword | Row-major cell order (top-left to bottom-right), skipping blocked cells entirely (not an empty segment), each normalized (lowercased), joined with `CELL_DELIM` |

**Cells, not letters.** A cell may hold a multi-letter rebus group (bracket notation, see each tool's `docs/SPEC.md`), so the board string is not a plain letter concatenation. `joinCells` (in `shared/boardString.js`) joins normalized per-cell strings with `CELL_DELIM` (`.`) — a non-alphabetic character, so it can never collide with normalized cell content (`[a-z]` only). Without the delimiter, a solver's `["ha", "ro"]` would hash identically to the correct `["har", "o"]` and a wrong board would report as solved. The join is over cells that **exist** in traversal order — never over grid positions: Marching Bands' center square (odd N) contributes nothing to the string, not an empty segment.

This is the same string `makeBoardChecker`'s `getSolution()` builds and `checkIfFilled()` passes to `sha256hex()` for every tool.

### Timing semantics — `timeMs`

`timeMs` is **active solve time**: total duration the puzzle was open and visible, from the first letter input to completion, accumulated across sessions. The clock starts on first letter-mutation (not page load), pauses when the tab is hidden, resumes when visible. Open-but-idle time counts; no idle detection.

**Persistence:** The accumulator is saved in the auto-save localStorage payload under `activeMs`. On `visibilitychange→hidden`, the `setupTimer` function (in `shared/engine-state.js`) folds the running interval and calls the engine's `saveState` so the accumulated time survives tab-close.

### Emission guarantee

Fires exactly once per page load, on the first false→true solved transition. Restoring a previously-solved puzzle from localStorage does not re-emit — the latch is sealed immediately after `restoreState()`.

### Implementation

`makeCompletionLatch` and `setupTimer` live in `shared/engine-state.js`; every engine builds the pair through `setupSolveTracking`, passing its congrats dialog's `open` as `onComplete` so `engine-state.js` never calls into `engine-chrome.js`.

**Applies to:** `shared/engine-state.js`, all four `src/template/engine.js` files, all four hashers.
