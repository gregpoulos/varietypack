# Cross-Tool Spec

Implementation contracts every puzzle tool must satisfy identically. Check this file when adding a feature to one engine — if it's listed here, the other engines need the same treatment.

---

## Engine bootstrap & structure

**Rule:** Every `engine.js` must follow this three-layer skeleton and the canonical `init()` section order below. Anyone modifying an engine can then find their place without reading the whole file.

### Skeleton

```js
import { normalize } from '../../../shared/normalize.mjs';
// … then the rest of what this engine uses from shared/ (engine-state.mjs,
// engine-chrome.mjs) and the tool's own modules (layout, grid, typing, entryMaps,
// Snake Charmer's shapes). shared/build/engineBundle.js bundles the file and everything
// it imports into the page's one script.

function init() { /* everything below */ }

document.addEventListener('DOMContentLoaded', init);
```

The file has no wrapper function: an ES module's top level is already its own scope, and `engineBundle.js` puts the strict-mode directive on the whole page script.

**The one rule that resolves scope confusion:** all mutable state and every function that touches state or the DOM lives inside `init()`. Pure helpers worth unit-testing don't live in `engine.js` at all: they go in an ES module under the tool's `src/` (Snake Charmer's `entryMaps.mjs`, Crushword's `typing.mjs`), which the engine imports and Node tests `require`. No test loads `engine.js`.

### Canonical `init()` section order

Eight sections in fixed order, each introduced with a `// ── <name> ──` banner:

| # | Banner | Contents |
|---|--------|----------|
| 1 | `Data & constants` | `const data = window.PUZZLE_DATA` + derived dimensions/counts |
| 2 | `Geometry & index maps` | Pure geometry helpers (`rowOf`, `polar`, `cellPath`, `svgEl`, …) + precomputed index maps (`inwardMap`, `bandCellsMap`, …) |
| 3 | `State` | All mutable `let`s: active cell/position, direction/mode |
| 4 | `Logic functions` | Cell storage, the composer and board checker, navigation, `focusCell` and the cursor actions built on it, `syncUI` and `activeContextCells` (the cells of the active clue), then the congrats dialog, `setupSolveTracking` and storage. Storage comes after the tracker because `makeSavePayload` needs the tracker's `timer` and `helpRecord`; the tracker is given `saveState: () => saveState()` |
| 5 | `Build SVG` | SVG element query, `viewBox`, layer groups (`cells < circles < flash < letters [< labels]`), cell elements, circle decorations, labels, any tool-specific SVG chrome (chevron, curl). Builds only: no listeners are attached here |
| 6 | `Header & clues` | `renderByline`, `renderInstructions`, then clue list DOM construction (the builder functions and their calls) |
| 7 | `Event wiring` | Lookups of the page's static elements, then every listener (`setupRebusButton`, `setupEmbedResize`, `setupKeysOverlay`, `setupKeydown`, the hidden input, `setupCellClicks`), then `resetBoard`, `makeHelpActions`, `setupControls` and last `setupPhoneLayout`, which moves the menu `setupControls` built |
| 8 | `Restore & focus` | `restoreAndSeal({ restoreState, checker, latch, composer })` (`shared/engine-state.mjs` — runs `restoreState(); latch.sealIfSolved(checker.isSolved()); checker.repaintIfSolved();` in that exact order and returns the composing cell), then `focusCell(<initial>)` where `<initial>` is that returned cell or the tool's default |

**Invariant:** `init()` declares, builds, wires, then starts — it invokes no logic function until *Restore & focus*. Function declarations in *Logic functions* may safely reference `const`s from *Build SVG* (`flashLayer`, `cellPaths`, etc.) because those functions are only *called* from *Event wiring* and *Restore & focus*, after the SVG build has run.

**Applies to:** `spiral/src/template/engine.js`, `snake-charmer/src/template/engine.js`, `marching-bands/src/template/engine.js`, `crushword/src/template/engine.js`.

---

## CLI argument convention

**Rule:** `varietypack build` accepts `<input.yaml>` as its only required positional argument and uses `-o <output.html>` (long form `--output`) for an explicit output path. When `-o` is omitted, the output path defaults to `<input-basename>.html` written next to the input file. No tool may require a positional output argument. `-f`/`--force` overwrites an existing output but never the input file itself (`buildOneFile` refuses).

**Usage line order:** `<input.yaml>` first, then `[options]` (including `-o`). Example: `Usage: varietypack build <input.yaml> [options]`.

**Applies to:** `varietypack build` (`shared/cli/buildCommand.js`) for every tool.

**How to verify:** Running `varietypack build puzzle.yaml` (no `-o`) must produce `puzzle.html` next to `puzzle.yaml`. Running with `-o out/foo.html` must write there, creating `out/` if it does not exist. Running with `-o` as the final argument must print an error and exit non-zero.

**Why `-o` over positional:** Once a tool has multiple optional flags (e.g. `--shape`, `--theme`), a bare positional output is ambiguous about ordering. Named flags scale uniformly across all tools regardless of how many options each tool has.

---

## Theme selection flag

**Rule:** `varietypack build` accepts `--theme <name>` for every tool to select a visual theme, and a puzzle YAML may carry an optional `theme:` field (validated by `validateCommonHeader`). Precedence: the flag, then the YAML field, then `broadsheet`; `buildFromObject` resolves it once. The theme allowlist is shared across all tools (`THEME_REGISTRY` in `shared/build/themeRegistry.js`), and all tools must ship at least `broadsheet` and `skeleton`. An unknown name is a validation error: the field's from `validateCommonHeader`, the flag's from `validateBuildOptions` (`shared/build/validation.js`).

**Applies to:** `varietypack build` (`shared/cli/buildCommand.js`) for every tool.

**Theme semantics:** Themes are token files over a neutral shared layer. `shared/themes/theme-base.css` defines neutral `--theme-*` defaults; each theme is a `shared/themes/<name>-tokens.css` that overrides them. `shared/themes/theme-components.css` supplies all tool-agnostic, var-driven component styles (masthead, buttons, SVG cell states, congrats card) **plus** per-tool namespaced sections for tool-specific selectors (bands, chevrons, secondary cells). Each tool's `<body>` carries a `class="tool-<name>"` hook (e.g. `tool-snake-charmer`) that scopes the per-tool sections; there is no separate per-tool CSS file. Adding a new theme requires `<name>-tokens.css` and an entry in `THEME_REGISTRY` in `shared/build/themeRegistry.js`. Both `broadsheet` and `skeleton` ship as `<name>-tokens.css` files under this model. All themes must cover the full selector vocabulary required by the engine — any class or ID added to the engine must be styled via `--theme-*` vars in `theme-components.css` (either in the shared section or in the tool's namespaced section).

**Token overrides (`themeTokens:`).** A puzzle may override individual `--theme-*` tokens with an optional `themeTokens:` map (no CLI flag; muddled files carry it unchanged). `composeThemeCss` appends them as one `:root` block immediately after `<theme>-tokens.css` and before `theme-components.css`, so they win over the theme and the components pick them up. The names are `THEME_TOKENS` in `themeRegistry.js`, which `shared/test/themeRegistry.test.js` keeps equal to what `theme-base.css` declares; `validateCommonHeader` validates names and values (no `;`, braces, brackets, `<`, `>`, `@`, backslash, `/*` or `url(`-style functions, balanced quotes and parentheses, at most 200 characters), since the values are interpolated into the page's CSS. `buildFromObject` puts them on the build options, which each tool's `buildHtml` passes through to `buildToolHtml`.

**Tool-specific optional flags** (e.g. `--shape` in Snake Charmer) are allowed and must not conflict with shared flag names, nor with another tool's flags: directory-mode `build` parses every tool's flags together, then gives each puzzle only the flags its tool takes. Tools document their own optional flags in their `docs/SPEC.md`, and `varietypack build --help` lists them.

---

## Font flag

**Rule:** `varietypack build` accepts `--font embed|link` for every tool to control font delivery for themes that use custom fonts. The flag is silently ignored for system-font themes (`fonts: null` in the registry). For custom-font themes, omitting `--font` defaults to `embed`, or to `link` when the theme declares only `fonts.cdn`. Any other value is a validation error (`validateBuildOptions`), whatever the theme.

- `--font embed` — base64-encodes font files into `@font-face` declarations; output is self-contained with no network dependencies. Font files must be committed to `shared/themes/fonts/<theme>/` and declared in the registry's `fonts.faces` array.
- `--font link` — emits a `@import url(...)` pointing at the CDN URL declared in the registry's `fonts.cdn.url`. The font loads in the solver's browser on every puzzle open; requires network access at solve time. Prefer Bunny Fonts over Google Fonts for GDPR-sensitive deployments.

**Applies to:** `varietypack build` (`shared/cli/buildCommand.js`) for every tool.

---

## Minify flag

**Rule:** `varietypack build` accepts `--minify` for every tool (boolean, default off). When set, the CLI runs the generated HTML through `shared/cli/minify.js` before writing it. Minification must be behavior-preserving — it never alters puzzle data or rendered output.

**Applies to:** `varietypack build` for every tool; `writePuzzlePage` (`shared/cli/writePuzzlePage.js`) takes it as `options.minify` and applies `minifyHtml()` to the composed HTML just before writing it. The studio never minifies.

**What it does:** terser-minifies the body of each `<script>` block (compress + mangle), clean-css-minifies the body of each `<style>` block, and trims trailing whitespace and collapses runs of blank lines in the surrounding HTML.

**Implementation gotcha:** the pass over the surrounding HTML must not strip comment-like text — see the note on `simplePass` in `shared/cli/minify.js` for why.

---

## Instructions field

**Rule:** Every tool YAML accepts an optional `instructions` string field. When present, each tool's prepare step renders it as block-level markdown (see "Markdown formatting in clue and instructions text" below) into `window.PUZZLE_DATA.instructions` — blank lines become separate `<p>` elements, matching what author-facing docs describe. The engine's shared `renderInstructions(data)` helper (`shared/engine-chrome.mjs`) just injects that HTML via `innerHTML` into `<div id="instructions" hidden>`; paragraph splitting happens at build time, not in the browser. The `hidden` attribute is removed only when the field is present and non-empty. When absent, the element stays hidden and no empty div is rendered visibly.

**Snake Charmer exception:** Snake Charmer nests `<div id="instructions">` at the top of its `#clue-list` column (above the clue `<ol>`) rather than in a full-width band between the header and the ring — its ring-plus-clue-column layout has no such band, so the instructions sit atop the clue column by design. The element id, `hidden` toggle, and paragraph rendering are identical; only the container differs.

**Validation:** `instructions` must be a non-empty string if provided (checked against the raw source text, before markdown rendering). Whitespace-only strings are rejected.

**Applies to:** all tool validators, prepare steps, builders, `shared/build/prepare.js`'s `prepareCommon` (where the markdown rendering happens, called from each prepare step), the shared `renderInstructions(data)` helper (called from each engine's *Header & clues* section), and HTML templates.

**Why:** Variety puzzles often require format explanations (e.g., "Answers read inward from cell 1"). Without a standard instructions field, authors have no way to include per-puzzle explanatory text in the output HTML.

---

## Markdown formatting in clue and instructions text

**Rule:** Every entry's `clue` field, and the `instructions` field, accept a small markdown subset: `**bold**`, `*italic*`, `` `code` ``, `[text](url)` links, `~~strikethrough~~`, `H~2~O`-style subscript, `29^th^`-style superscript, and `:shortcode:` emoji. Rendering happens once, at **build time** — never in the puzzle page, so the shipped puzzle HTML gains no runtime markdown dependency. Plain text with no markdown syntax renders unchanged.

**Typographic replacements:** straight quotes are curled, `--`/`---` become en/em dashes, and `...` becomes `…`. Prefix a character with `\` to force the literal: `\"` stays a straight quote, `\*` stays a literal asterisk. Which markdown-it rules are enabled, and why `escape` is one of them, is in `shared/build/renderMarkdown.js`.

**Implementation:** `shared/build/renderMarkdown.js` wraps `markdown-it` with a deliberately narrow rule set — no block structure and no autolinking (rationale beside the code) — plus the `-sub`/`-sup`/`-emoji` plugins.

- `renderClueMarkdown(text)` — inline-only (`md.renderInline`), used for `clue`. No wrapping block element, since clue text lives inside a `<span class="clue-text">`.
- `renderInstructionsMarkdown(text)` — block-level (`md.render`), used for `instructions`. Blank-line-separated paragraphs each become their own `<p>`.

Both run at **prepare time**, inside each tool's prepare step (`src/prepare.js`), so a `prepared` object is uniformly display-ready: `processEntries` (in `shared/build/prepare.js`, called by every tool for every entry — a muddled entry has no plaintext answer but still has clue text, so this runs unconditionally there too) renders clues, and `prepareCommon` (same file, which every prepare step calls for its header fields) renders instructions. `commonPuzzleData` passes the already-rendered instructions through untouched.

**Security:** raw HTML in the source is escaped at build time (rationale in `shared/build/renderMarkdown.js`), so a clue — which can arrive from someone other than the person building it, since a muddled/source YAML is a distributable format — can never inject a tag. Every engine injects the rendered string via `innerHTML` rather than `textContent`, which is safe specifically *because* it was rendered at build time: an engine must never `innerHTML` a raw, unrendered YAML string.

**`PUZZLE_DATA.clue` and `PUZZLE_DATA.instructions` hold rendered HTML, not plain text.** This is a departure from the general PUZZLE_DATA convention that string fields are plain text; it's called out here because it's easy to assume otherwise when reading an engine's `entry.clue` access.

**Applies to:** `shared/build/renderMarkdown.js`, `shared/build/prepare.js` (`processEntries`, `prepareCommon`), every tool's `src/prepare.js`, `shared/engine-chrome.mjs` (`renderInstructions`), every tool's `src/template/engine.js` (clue-text elements, and Snake Charmer/Spiral/Crushword's active-clue-bar text), every tool's `docs/SPEC.md`.

**How to verify:** Build a puzzle with `**bold**` in a clue and blank-line-separated paragraphs with `*italic*` in `instructions`; open the HTML and confirm the clue list shows bold text (not literal asterisks) and the instructions block shows two separate `<p>` elements with italic text rendered.

---

## Keyboard shortcuts modal

**Rule:** Every tool exposes a keyboard-shortcuts reference via a fixed `?` button and the `?` key. Both are wired by `setupKeysOverlay(shortcuts, refocus)` from `shared/engine-chrome.mjs` — each engine calls it with a tool-specific `[[keys, description], …]` array and its `refocus`. The return value (the `<dialog>` element) is passed to `setupKeydown` as `{ keysOverlay }`.

**Creation:** `setupKeysOverlay` appends two elements to `<body>`:
1. `#keys-btn` — a fixed bottom-right corner button labeled `?`.
2. `#keys-overlay` — a native `<dialog>` holding `#keys-modal` (the visible card listing the shortcuts as a table of `<kbd>` + description rows). The dialog supplies the dialog/modal ARIA semantics implicitly when opened with `showModal()`; its dim is the `::backdrop` pseudo-element, not a wrapper div.

**Opening and closing:** button click or `?` opens it via `showModal()`; `?` again, Escape, a backdrop click or `#keys-close` closes it, and focus returns to the grid input. How each of those works — including why no explicit close handler is needed — is in the comment on `setupKeysOverlay` (`shared/engine-chrome.mjs`).

**Keystroke guard:** `setupKeydown` has a `keysOverlay` option; when the dialog is open (`keysOverlay.open`), the tool's keydown handler returns immediately, so no puzzle key fires while the modal is up.

**CSS:** structural rules (position, size, the `<dialog>` reset) live in `shared/base.css`; color and font styling in `shared/themes/theme-components.css` via the standard `--theme-*` variables, with no per-theme overrides required.

**Print:** `#keys-overlay` and `#keys-btn` are both hidden in `@media print` (see `shared/themes/print-base.css`).

**Applies to:** `shared/engine-chrome.mjs` (`setupKeysOverlay`, `setupKeydown`), all four `src/template/engine.js` files.

---

## Options menu

**Rule:** Every tool exposes rarely-used, potentially-destructive or puzzle-wide options — today just Clear — behind a fixed `☰` menu button rather than as a permanently visible control, so a stray click can't trigger them. Wired by `setupOptionsMenu(refocus)` from `shared/engine-chrome.mjs`, called from `setupControls` with the engine's `refocus`.

**Creation:** `setupOptionsMenu` appends two elements to `<body>`:
1. `#menu-btn` — a fixed top-right corner button labeled `☰`.
2. `#menu-panel` — a plain non-modal `<div role="menu">`, hidden by default, holding `#clear-btn` (built here rather than templated in `index.html`, matching `#keys-btn`/`#keys-overlay`'s fully-JS-created pattern). A checkbox row is a `.menu-toggle` label (`menuToggle`); in the phone layout `setupListWrapPref` adds `#list-wrap-toggle-label` and `setupPhoneLayout` adds `#keyboard-left-toggle-label` above `#clear-btn` (see "Phone layout and drawn keyboard").

Every engine wires the options menu and the help menu ("Help menu and help record" below) through one call, `setupControls` (`shared/engine-chrome.mjs`, whose comment lists its parameters), which returns the `syncHelp()` that `syncUI()` calls and the `helpMenu` for `setupPhoneLayout`. It builds the six rows itself from `helpActions` (`makeHelpActions`), the active cell and the active clue's cells.

**Why non-modal, unlike the keys overlay:** it houses low-friction settings a solver may change while still looking at the board, so it never makes the page inert.

**Opening and closing:** `#menu-btn` toggles the panel, and opening it calls `refocus()` too: the menu isn't modal, so keys keep reaching the puzzle. A click outside it, Escape, or any other key the puzzle takes (not a bare modifier or a ⌘/Ctrl shortcut) closes it and calls `refocus()` (see "Focus management"), so a key pressed with the menu open reaches the puzzle and closes the menu, whatever was clicked in it first. Clicks *inside* never close it — see the comment on `setupOptionsMenu` (`shared/engine-chrome.mjs`) for how that carries `#clear-btn`'s two-click confirm.

**No keystroke guard needed:** unlike the keys overlay, which blocks keys while it's open, `setupKeydown` needs no `{ menu }`-style option, because no control in the menu keeps focus: opening it, each checkbox toggle (phone) and Clear's arming click all call `refocus()`, and Clear's confirming click resets the board, which refocuses too. So `setupKeydown`'s focus guard (`document.activeElement.tagName === 'BUTTON'`) never meets a menu control, and keys reach the puzzle while the menu closes itself. In the phone layout no tap inside `#solve-view` moves focus at all (the `mousedown` cancel).

**CSS:** structural rules live in `shared/base.css`, color and font styling in `shared/themes/theme-components.css`. The three `has-clue-bar` tools position the button and panel against `#active-clue-bar` (see "Active-clue banner"); Marching Bands, with no bar, keeps the plain defaults.

**Phone layout:** `setupPhoneLayout` moves both into the solving view's top bar, where `#menu-btn` is in flow and `#menu-panel` opens absolutely below the bar (see "Phone layout and drawn keyboard").

**Print:** `#menu-btn` and `#menu-panel` are both hidden in `@media print` (see `shared/themes/print-base.css`).

**Applies to:** `shared/engine-chrome.mjs` (`setupOptionsMenu`, `setupControls`), `shared/base.css`, `shared/themes/theme-components.css`, `shared/themes/print-base.css`, all four `src/template/index.html` and `src/template/engine.js` files.

---

## Help menu and help record

**Rule:** Check and reveal actions live in one menu, the life-ring `#help-btn` and the `#help-panel` it opens, on desktop and phone alike. None is a key on the phone's drawn keyboard; the reason is the comment on `setupHelpMenu`. Built by `setupHelpMenu` and wired by `setupControls` (`shared/engine-chrome.mjs`), which hands the finished `helpMenu` ({ `btn`, `panel` }) to `setupPhoneLayout`.

**Rows (plain builds only):** `#check-btn` ("Check cell"), `#reveal-btn` ("Reveal cell"), and the clue and puzzle rows below. Check cell asks `checker.checkCell(n)`; Reveal cell fills the active cell with its answer and marks it `.correct` through `revealCells` (`shared/engine-state.mjs`), without locking the cell, so a solver can type over it as over a checked cell. Reveal works on a wrong, empty or composing cell and on a rebus cell (it writes the whole group); it is disabled only when the cell is already `.correct` (`checker.canReveal`). Every row is one of two calls over a set of cells, `checkSet(ids)` or `revealSet(ids)`, from `makeHelpActions` (`shared/engine-state.mjs`), which also holds why a reveal saves only after its completion path. Each engine supplies how it flashes a wrong cell and, for Crushword, how it commits a typed cell and lands its cursor. A click on a row closes the panel, and each returns focus to the puzzle. `syncHelp()` from `syncUI()` sets every row's disabled state.

**Clue rows:** `#check-clue-btn` ("Check clue") and `#reveal-clue-btn` ("Reveal clue") act on the active clue's cells (`clueCells()` in `setupControls`): `checker.checkCells` checks every checkable cell of it in one pass, marking the right ones `.correct` and flashing the wrong ones, and `revealCells` reveals every cell of it that is not already correct. Each counts one check or one reveal, and only if something ran (Check clue is disabled while no cell of the clue is checkable, Reveal clue while every cell is correct). Crushword commits a half-typed cell before checking, as Check cell does. Marching Bands never names a single entry, because its entry boundaries are hidden from the solver (see "Active-clue banner"): its rows act on the active row or band and read "Check row" / "Reveal row" or "Check band" / "Reveal band", following the mode (`clueNoun()`), since a whole row or band gives away no boundary.

**Puzzle rows:** `#check-puzzle-btn` ("Check puzzle") and `#reveal-puzzle-btn` ("Reveal puzzle") do the same over every cell (`checker.cellIds`), through the same `checkCells` and `revealCells`, and count one check or one reveal each. Check puzzle is disabled while no cell is checkable, Reveal puzzle while every cell is correct. **Reveal puzzle confirms first,** because it discards the solver's effort: its first click arms it (`setupArmedButton`, the Clear button's arm-then-confirm pattern: the label reads "Are you sure?" and lapses after 3s) and the second acts. The arming click keeps the panel open so the label is seen: the row is passed to `setupHelpMenu` as self-closing, so it gets no close listener and closes the panel itself once confirmed. Closing the panel by any route disarms it (`onClosed`), so a click on reopening never runs the action; `base.css` reserves the armed label's width so the panel does not resize.

**Hashed builds:** no help menu, no rows: a hashed page carries no answers to check or reveal against.

**Desktop placement:** `#help-btn` sits immediately left of `#menu-btn` in the same band (`position: fixed`, `right: 60px`), and `#help-panel` opens below it. In the three clue-bar tools both buttons sit inside the bar's band, and the bar's right gutter is widened to clear them only on a page that has the help button (`setupHelpMenu` puts `has-help-btn` on `<body>`; `shared/themes/theme-components.css`); Marching Bands, with no bar, keeps the plain `top` row. Both are hidden in `@media print`. The two menus close each other (`setupPopupMenu`). Crushword has no `#controls`.

**Help record:** `makeHelpRecord` (`shared/engine-state.mjs`) counts checks and reveals separately: `help.checks` and `help.reveals`. Check cell counts one check whenever it actually ran (the cell was checkable), right or wrong; a disabled button counts nothing. Check clue and Check puzzle count one check if any cell of the set was checkable, even when nothing turns out wrong. Reveal cell, Reveal clue and Reveal puzzle each count one reveal. The record is part of one attempt's progress: it is saved under `help` in the auto-save payload (a save without it restores as zero counts), zeroed with the board by `resetAndRefocus` (Clear puzzle and Play again), and reported as `checks` and `reveals` on `varietypack:complete`. It never enters the board string, so it cannot touch `boardHash`. A revealed finish still fires the event and shows the congratulations card.

**Applies to:** `shared/engine-chrome.mjs`, `shared/engine-state.mjs`, `shared/engine-phone.mjs`, `shared/base.css`, `shared/themes/theme-components.css`, `shared/themes/print-base.css`, each engine's `helpActions`.

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
| Controls wrapper | `#controls` *(absent in Crushword, whose only control was Check cell)* |
| Rebus (multi-letter entry) button | `#rebus-btn` (never hidden, never disabled — see "Enter / Rebus button") *(Snake Charmer, Spiral, Marching Bands — absent in Crushword, see "Crushword — explicit-commit typing")* |
| Keyboard-shortcuts trigger button | `#keys-btn` |
| Keyboard-shortcuts dialog (native `<dialog>`; dim is its `::backdrop`) | `#keys-overlay` |
| Keyboard-shortcuts modal card | `#keys-modal` |
| Keyboard-shortcuts modal header | `#keys-modal-header` |
| Keyboard-shortcuts close button | `#keys-close` |
| Options menu trigger button | `#menu-btn` |
| Help menu trigger button and dropdown (absent in hashed builds) | `#help-btn`, `#help-panel` |
| Check cell and Reveal cell rows of the help dropdown (absent in hashed builds) | `#check-btn`, `#reveal-btn` |
| Check clue and Reveal clue rows of the help dropdown (absent in hashed builds; "row" or "band" for "clue" in Marching Bands) | `#check-clue-btn`, `#reveal-clue-btn` |
| Check puzzle and Reveal puzzle rows of the help dropdown (absent in hashed builds; Reveal puzzle arms on the first click) | `#check-puzzle-btn`, `#reveal-puzzle-btn` |
| Options menu dropdown (plain, non-modal) | `#menu-panel` |
| Clear progress button (lives inside `#menu-panel`, not `#controls`) | `#clear-btn` |
| Wrap-cells toggle (phone layout's fill-in list only; shown only on the Clues screen) | `#list-wrap-toggle` (checkbox inside label `#list-wrap-toggle-label`) |
| Toggle buttons | `.toggle-opt` (`.active` on the selected one) *(absent in Crushword — see "Crushword — explicit-commit typing")* |
| Clue list wrapper | `#clue-list` *(Snake Charmer)* |
| Clue list items | `.clue-item` |
| Clue text inside each item | `.clue-text` (child `<span>` of `.clue-item`) |
| Active clue item | `.clue-item.active-clue` *(Snake Charmer, Spiral, Crushword)* / `.clue-group.active-clue` *(Marching Bands — applied to the group wrapper, not individual items)* |
| Correct state | `.correct` (on both cell paths and clue items) |
| Filled clue (every owned cell has content, right or wrong) | `.clue-item.filled` *(Snake Charmer, Spiral, Crushword)* — see "Filled clues" |
| Solve-celebration dialog (native `<dialog>` appended to `<body>`, not to the puzzle markup) | `#congrats-dialog` |
| Solve-celebration card inside that dialog | `#congrats` |
| All-filled-but-wrong banner | `#done-wrong` |
| Per-entry circle decoration | `.style-circle` |
| Secondary-entry cells | `.cell.secondary-entry` *(Snake Charmer)* |
| Secondary-entry clue highlight | `.clue-item.secondary-entry` *(Snake Charmer, Spiral — applied to individual clue items)* / `.clue-group.secondary-entry` *(Marching Bands — applied to the group wrapper, not individual items)* |
| Inward/outward clue lists | `#inward-clues`, `#outward-clues` *(Spiral; the `.clue-section-inward` / `.clue-section-outward` wrappers hold them)* |
| Direction-tracking chevron | `#direction-chevron` *(Spiral, Marching Bands)* |
| Center-curl spiral decoration | `#center-curl` *(Spiral)* |
| Fixed active-clue bar | `#active-clue-bar` *(Snake Charmer, Spiral, Crushword — absent in Marching Bands, see "Active-clue banner")* |
| Primary clue row in bar | `#active-clue-primary` (`.active-clue-row`) |
| Secondary clue row in bar | `#active-clue-secondary` (`.active-clue-row`) — *always shown (Snake Charmer, Spiral); `hidden` when the active cell has no crossing entry (Crushword)* |
| Clue number/range in bar | `.active-clue-num` |
| Clue text in bar | `.active-clue-text` |
| Direction label in bar | `.active-clue-dir` *(Spiral, Crushword — Snake Charmer's single loop needs no disambiguation)* |
| Individual row number label | `.row-label` *(Marching Bands)* |
| Grid wrapper | `#grid-wrap` *(Marching Bands)* |
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

**Structural note on `.clue-text`:** Each clue `<li class="clue-item">` must contain a `<span class="clue-text">` holding the clue string. This is required for the theme rule `.clue-item.filled .clue-text` (see "Filled clues"). Tools whose clue items have additional spans (e.g. a `.clue-range` label) place `.clue-text` after them; tools with text-only items still wrap the text in the span.

**Multi-letter sizing is `transform`, never `font-size`** — a CSS `font-size` rule would outrank Spiral's per-puzzle letter size, which is an SVG presentation attribute. The `.cell-letter.len-*` classes are computed from the **typed** content's length, never the answer's capacity; why they scale with `transform` is beside the rules in `shared/themes/theme-components.css`. Crushword overrides that scale with a measured per-cell inline `transform` (still never `font-size`) — see the comment on `fitLetterToCell` in its `engine.js`.

---

## PUZZLE_DATA conventions

**`PUZZLE_DATA.cells` content:** `cells` holds per-cell *geometry* only, never entry-mapping data. Spiral stores its per-cell spiral geometry (`theta_start`, `r_inner_start`, …) in `data.cells`, precomputed by the builder; its engine also imports `spiral/src/layout.mjs` for the drawing helpers (`cellPath`, `letterCenter`, …). Snake Charmer and Marching Bands carry no geometry in `data.cells`: Snake Charmer omits the array entirely (its ring geometry lives in `data.ring`, derived from `ring.N` by the shape renderers), and Marching Bands derives all geometry from the grid size `N`. Crushword likewise carries no `cells` array — its geometry (cell pixel coordinates, which cells are numbered) is cheap enough to derive at engine init from `data.grid` via the `layout.mjs`/`grid.mjs` its engine imports (`crushword/src/grid.mjs` and `layout.mjs`), unlike Spiral's polar math, which is expensive enough to precompute once in the builder instead.

**Entry→cell mapping is always computed at engine init, never stored in PUZZLE_DATA.** It is fully derivable from entry lengths plus the tool's traversal rule, so carrying it in the HTML payload is redundant. Spiral builds `inwardMap`/`outwardMap`/`inwardEntryCells`/`outwardEntryCells` at init from `data.inward`/`data.outward`; Snake Charmer builds `entryAtCell`/`ringPosByEntry`/`canonicalStart` at init via `buildEntryMaps(data.entries, data.loops)`; Marching Bands computes its mapping from `N`.

**SVG element IDs:** All four tools assign `id="cell-{n}"` to SVG cell path elements and `id="letter-{n}"` to letter text elements. Marching Bands, Spiral, and Crushword use 1-indexed `n`; Snake Charmer uses 0-indexed `n` (matching its 0-indexed internal ring position). Crushword's `n` is row-major over the whole grid including blocked positions (`row*cols + col + 1`), the same scheme Marching Bands uses for its own skipped center cell. The cell ids are load-bearing: `setupCellClicks` (`shared/engine-chrome.mjs`) reads a clicked cell's `n` back from its id. Engines still keep parallel `cellPaths[]`/`letterTexts[]` (or, for Crushword, `cellRects{}`/`letterTexts{}` keyed by `n`) for O(1) access and use those internally rather than `getElementById`.

---

## `syncUI()` contract

**Rule:** `syncUI()` is the single function responsible for translating game state into DOM. It is called after every state change. Event handlers never update visual state directly — they mutate state (cell letters, cursor position, direction) and then call `syncUI()` or `focusCell()` (which calls `syncUI()`).

**Minimum responsibilities:** active-entry, active-cell and composing cell classes (`.composing` from `composer.isComposing`; the composer holds only the state), the active cell moved last in its cells layer (why: the comment above that line in each engine), active-clue highlight, the help rows' disabled state (`syncHelp`, from `setupControls`), and the solve state (`syncSolveState` in `shared/engine-state.mjs`: done-wrong banner visibility, and solved-ness reported to `latch.check()`). The active-entry highlight covers every cell of the entry regardless of correctness — it shows where the cursor is, not what is left to solve — and `.correct` is a separate, independently-set class on the same element. The solve celebration is *not* among them — `syncUI()` passes solved-ness to `latch.check()`, and the latch decides whether to open the dialog. Tool-specific additions (e.g. direction chevron, secondary-entry highlight) are allowed but must follow the same pattern.

**Clue-list scrolling:** Marching Bands and Crushword scroll the active clue (Marching Bands: its row or band group) into view, but only when it changes — not on every `syncUI()` — so typing and moving within the active clue never move the page. Both scroll it clear of their sticky grid where the grid sits over the clues (`scrollIntoViewBelow` in `shared/engine-chrome.mjs`). Spiral and Snake Charmer don't scroll their clue lists on the desktop. In the phone layout the page never scrolls itself: `scrollIntoViewBelow` returns at once, and the list view scrolls only inside its own pane (`scrollWithin`) — on opening, to the active clue, and in the fill-in list (Crushword, Spiral, Snake Charmer) again whenever the active clue changes, by the same only-when-it-changes rule (see "Phone layout and drawn keyboard"). Covered by "the clue list scrolls only when the active clue changes" in `e2e/shared.spec.js`.

**Applies to:** each tool's `src/template/engine.js`.

---

## Focus management

**Rule:** Navigation keys (arrows, Backspace, Tab, Space) are handled by a `document`-level `keydown` listener, so they work even when the hidden input has lost focus (e.g. after clicking the page background or a heading). When nothing has focus, `setupKeydown` refocuses the hidden input first, so a typed letter lands too (why beside it in `shared/engine-chrome.mjs`).

The listener must guard against two cases:
- `!document.hasFocus()` — browser chrome (URL bar, devtools) has focus; don't swallow system shortcuts.
- `document.activeElement.tagName === 'BUTTON'` — a button has focus; skip so toggle-click events don't double-fire navigation.

Letter input still routes through `<input id="hidden-input">`. `focusCell()` restores hidden-input focus after every navigation action, so letter input continues to work after any keypress.

The options menu's checkbox toggle ("Wrap long rows of cells", phone layout) calls `refocus()` on each change, since a click on a toggle's label focuses its checkbox.

**Phone-layout exception:** in the phone layout `#hidden-input` carries `inputmode="none"`, so holding focus never opens the phone's own keyboard while a hardware keyboard still types; and no tap inside `#solve-view` moves focus at all (see "Phone layout and drawn keyboard").

**CSS requirement:** `#hidden-input` must use `position: fixed; left: -9999px` (not `position: absolute`). `position: fixed` keeps the element permanently within the viewport, so browser focus-scroll is never triggered. `position: absolute` will cause the page to jump when the input is focused.

Every control that would otherwise steal focus from the hidden input (direction/loop toggle, Check cell button, any future controls) must call `focusCell()` (or equivalent) so that the hidden input is refocused and the BUTTON guard is cleared before the next keystroke.

`#rebus-btn` is the one control that *prevents* the focus loss instead of repairing it — it cancels `mousedown`, whose default action is the focus change, so on touch and mouse focus never moves and the soft keyboard never closes. It still supplies a `refocus` for any path where focus does land on the button. Tab is not one: inside the page it is captured as next entry, so no page button is reachable by Tab today. See "Enter / Rebus button — rebus entry" for why this must not be `pointerdown`.

**Single-assignment invariant:** the active cell (`activeCell`, or `activeRingPos` in
Snake Charmer) is assigned only inside `focusCell`, never at any other site. `focusCell` is
therefore the one place that needs `composer.commitIfMoved`. Any change that assigns the
active cell elsewhere breaks rebus commit coverage silently.

**How to verify:** Click anywhere on the page outside the puzzle grid, then press an arrow key. Navigation must work without clicking the puzzle again.

**Scroll key forwarding:** Because the hidden input holds focus, the browser suppresses native page-scrolling for keys that aren't puzzle actions — even without an explicit `preventDefault()`. The keydown handler must therefore explicitly forward scroll keys that the puzzle does not use to `window.scrollBy()`. Currently that means `ArrowUp`, `ArrowDown`, `PageUp`, and `PageDown`. Do not capture any key that has no puzzle action.

---

## Active-clue banner

**Rule:** A tool gets a fixed `#active-clue-bar` showing the active cell's clue(s) **when,
and only when, those clues are known from the cell alone.** This is one face of a wider
condition — entry boundaries are *given*, not solved for — which also gates per-clue state
such as `.filled` (next section), where the lookup runs the other way (clue → its cells).
Snake Charmer, Spiral, and
Crushword qualify. Marching Bands does not: working out where one clue ends and the next
begins is part of its solve, so a banner would have to guess, or list every still-possible
clue — up to eight or nine for an early cell. `#active-clue-bar` is absent from its markup
entirely, not merely hidden.

**Structure:** `#active-clue-primary` and `#active-clue-secondary` (both
`.active-clue-row`), each holding `.active-clue-num` and `.active-clue-text` (rendered
markdown set via `innerHTML` — see "Markdown formatting in clue and instructions text").
Tools whose two rows could be confused add a leading `.active-clue-dir` (Spiral's In/Out,
Crushword's Across/Down). Every engine fills the bar through `setupClueBar`
(`shared/engine-chrome.mjs`), which `hidden`s the secondary row when there's no other entry
to show — Crushword on a cell with no crossing entry, Snake Charmer where both loops are the
same entry; Spiral always has one.

**Marching Bands on a phone:** it gets a clue navigator (`#clue-navigator`) in the bar row,
built only on a touch-first device. It shows `Row 3` or `Band C`, `clue 2 of 3`, and one
clue of that row or band, with ‹ › that cycle through them. It reveals nothing because it
never moves on its own: it shows the first clue (index 0) whenever the active row or band
changes, and moves only on ‹ › or on a tap on a clue in the list. Where one clue ends and
the next begins stays the solver's to find. A tap on its text shows a cut-off clue in full
(`#clue-full`, see "Phone layout and drawn keyboard") and otherwise does nothing; the
bottom row's switch key or a tap on the active cell changes the mode. Desktop is unchanged.

**Phone layout:** the bar sits in the solving view's bar row and shows one clue in every tool — `#active-clue-secondary` is hidden, and the primary clue is clamped to two lines in a fixed-height row (see "Phone layout and drawn keyboard"). In landscape the bar takes the height the keyboard leaves and the clamp grows with it, a line for each step of the bar's height (container queries in `base.css`).

**Layout:** the three tools carry `has-clue-bar` on `<body>`. `shared/base.css` reserves the bar's height as `body` padding and exposes it as `--active-clue-bar-space`; `#menu-btn` sits *within* the bar's band and `#menu-panel` opens directly below it (`theme-components.css`, pure `calc()` against that variable — the reasoning is beside those rules). Crushword's sticky grid reads the variable directly (`crushword/src/template/base.css`). `print-base.css` hides the bar and drops the padding.

**Applies to:** `index.html`/`engine.js` for Snake Charmer, Spiral, and Crushword;
`shared/base.css`, `shared/themes/theme-components.css`, `shared/engine-chrome.mjs`.

---

## Phone layout and drawn keyboard

**Rule:** on a touch-first device — `matchMedia('(hover: none) and (pointer: coarse)')`, tablets included — every tool gets the phone solving view; anywhere else the page is unchanged. `setupPhoneLayout` (`shared/engine-phone.mjs`) builds it from each engine's Event wiring, after `setupControls`, and returns `null` on any other device.

**Structure:** `<html>` gets `phone`, and `#solve-view` is appended as the last child of `.puzzle-main`, below the header (title, byline, then `#instructions`, moved there in every tool). On screen the header and instructions are hidden, so the view is the whole page; they still print. The top bar shows the title and byline, and the Clues screen the instructions, as copies. On a first visit (`firstVisit`: no save `restoreState` would apply, `setupStorage`'s `hasSave()`), a puzzle with instructions opens with them in `#intro`, a card over the whole view that a tap anywhere on it closes. It is one `100svh` high (in a frame, the frame's height: see "Embedding — auto-sizing"), in normal page flow, with nothing sticky or fixed in it. Top to bottom:
- `.solve-top`: the title (up to two lines; one in landscape) over the byline, `#clues-btn` (Clues / Grid) the help menu's `#help-btn` (below) and the options menu moved in. In the stacked layout it takes its height from them once, at load, and its bottom border is the header's rule; in landscape (below) it has no box of its own, and its children sit on the view's grid. `#done-wrong` lies over the title and byline while it shows, so it covers no cell and no clue, in the grid view and the list view alike, and the bar keeps its height.
- `#solve-stage`: `#grid-pane` holding the tool's grid element, or `#list-pane` holding its clue lists in its place, headed by `.list-instructions` when the puzzle has instructions.
- `#solve-bar`: `#active-clue-bar` between `#clue-prev` / `#clue-next` (Shift+Tab / Tab), where a tap on the clue switches as `.` does — unless the clue is cut off at its two lines: then the tap shows it in full in `#clue-full`, over the bar row and the foot of the grid so nothing moves, until the next tap anywhere or a change of clue (`setupClueExpand`, given the `text` of each tool's `clueBar`: `setupClueBar`'s, or Marching Bands' navigator; wherever an engine writes the bar it reports the entry shown through `showingClue`, so a move to another clue with the same text closes it too); a tool whose bar brings its own steps (`ownSteps`: Marching Bands' navigator) gets the bar alone. Without a fill-in list (below), the drawn keyboard is hidden while the list is open.
- `#drawn-kb`: letter and digit layers above the tool's bottom row.

The grid and the lists are moved as they are, never wrapped, so the desktop and print layouts keep their template structure; `.puzzle-body`, emptied of what the view shows, is not displayed.

**Landscape phones:** on a short landscape screen the same DOM is rearranged by CSS alone into a strip (title, buttons) over the stage at the left and, at the right, the keyboard with the clue bar above it. Taller landscape screens (tablets) keep the stacked layout. `#clue-full` opens from the strip down, over the clue bar and the top of the keys. The Clues screen keeps the arrangement, a plain list (Marching Bands) taking the full width. Engines hold no orientation logic, so rotating switches live. A solver may put the keyboard at the left instead (the options menu's "Keyboard on the left" row, a preference for every puzzle, offered only in landscape): the stage and the keyboard column (clue bar included) swap places under the same strip, through `kb-left` on `<html>`. The trigger, the sizes and their reasons are the comment on the landscape block in `shared/base.css`; the tests are `e2e/landscape-phone.spec.js`.

**The page never scrolls itself** — no scroll-snap, no scrolling the page into place. The solver scrolls past the header once. The list view scrolls only inside `#list-pane`, through `scrollWithin`, which shows an item's top when the item is taller than the pane. Panning the grid's `viewBox` (below) isn't page scrolling.

**Zoom and pan** (`attachSvgZoom`, `shared/svg-zoom.mjs`, attached by `setupPhoneLayout` to the grid's SVG in every tool): two fingers pinch the grid, one finger drags it once zoomed, and a double-tap anywhere on it toggles between the whole grid and a closer view. Zoom is a rewrite of the SVG's `viewBox`, so unzoomed the attribute is the engine's own string. The view opens on the whole grid and stops at the grid's edges; an axis on which the grid fits the pane stays centered. There is no animation. A pinch or drag swallows the click a browser may fire when it ends, and so does the second tap of a double-tap. The first tap of a double-tap acts as a single tap does, at once, so a double-tap on the cursor's cell switches the direction and zooms; a second tap on a different cell only zooms, and never selects it. `touch-action: none` covers the grid pane at every zoom, so a swipe on the grid never scrolls the page. Switching to the Clues screen and back keeps the view, and printing shows the whole grid.

**Following the cursor:** each engine's `syncUI` calls `phone.follow(entryCells, cursorCell, cursorContent)` with the active entry's cells in entry order (Marching Bands: the active row or band; Snake Charmer: the active entry only, never its `.secondary-entry`), the cursor's cell and what it holds. While the grid is zoomed, a change in any of the three pans (never zooms) by the least distance that shows the entry with about a cell of margin; an entry too big for the view shows its start and the cursor, or failing that the cursor. A tap on a grid cell pans too. A pan the solver made by hand stays until one of the three changes, so a `syncUI` that changes none of them (a focus event, a menu) never moves the view. A change made on the Clues screen is followed when the grid returns. At the whole grid nothing moves.

**Fill-in list view** (Crushword, Spiral, Snake Charmer; `setupPhoneLayout`'s `fillList`, built by `setupFillList`): each clue item gets a `.list-cells` row of `.list-cell`s, one per cell of its entry, below the clue (whose text wraps beside its number), showing what the solver has typed (a board cell sits in two rows — two directions or two loops — and shows in both, as does its `.correct` mark once Check cell has confirmed it, and a wrong check's flash (`flash` on `setupFillList`'s return, since the grid's own flash is hidden while the list shows); a Snake Charmer entry longer than the ring holds some ring positions twice in its own row, once per loop). The drawn keyboard stays, the bar row hides. While a rebus composes (Snake Charmer, Spiral), the cursor's cell also carries `.composing`, which dashes its outline as the grid's does; not in Crushword (why: `setupFillList`'s `isComposing`). Crushword also draws its caret (`.list-caret`) in that cell, between the letters the cursor sits among, as its grid does. The cursor's cell carries `.list-cursor`, only within the active item (and, in a Snake Charmer row that holds a ring position twice, only on the copy in the active loop); the active row is styled through its item's `.active-clue`, and neither reuses `.active-cell`/`.active-entry`. Tapping a cell makes its item's direction (Snake Charmer: the loop that cell of the entry lies in) active and puts the cursor there; tapping anywhere else on the item, including its row past a short entry's last cell, keeps the "Clue click navigation" behavior, and the list stays open. The list scrolls the active clue into view when it changes, and the cursor's cell when the cursor moves or the clue's letters change, so typing after scrolling away brings it back; anything else leaves the list where the solver scrolled it. Rows wrap a long entry onto more lines; the options menu's "Wrap long rows of cells" (`setupListWrapPref`, on by default; off sets `html.list-nowrap`) shrinks the cells to one line instead, stored for all puzzles under `vp:pref:listWrap`, and its row shows only while the Clues screen is open (see "localStorage key format"). Marching Bands' list is plain: cell rows would reveal its entry boundaries.

**Keyboard rows:** `Q W E R T Y U I O P`; `A S D F G H J K L`; `123 Z X C V B N M ⌫`; the tool's bottom row. `123` swaps in the digit layer — `1 2 3 4 5 6 7 8 9 0`, an empty row, `ABC ⌫` — and every row keeps its height, so switching layers never resizes the grid. Bottom rows, with the switch key widest:

| Tool | Bottom row |
|---|---|
| Snake Charmer | Prev cell · Rebus · Loop ⇄ · Next cell |
| Spiral | Prev cell · Rebus · In ⇄ Out · Next cell |
| Marching Bands | Prev cell · Rebus · Row ⇄ Band · Next cell |
| Crushword | Prev cell · ◂ · ▾ · ▴ · ▸ · Next cell |

"Rebus" is `#rebus-btn`, moved in with its wiring intact. The switch key is `.`; Crushword has none (see below). Crushword's Next cell is Enter and its Prev cell is Shift+Enter, a bottom-row item with `shift: true`; both commit the cell and move one cell on. Every Prev / Next cell label breaks over two lines.

**Help menu:** see "Help menu and help record". On a phone `setupPhoneLayout` moves `#help-btn` into the top bar beside `#menu-btn`, and `#help-panel` opens under it (`html.phone` rules in `shared/base.css`), its rows at the 44px tap minimum. A tap on a row closes the panel.

**Prev cell / Next cell** (Snake Charmer, Spiral, Marching Bands) step one cell back or forward along the active entry, row or band. They are worded rather than drawn as arrows because the grid's geography doesn't match left and right: a ring or spiral curves, and a band turns corners. In Snake Charmer and Spiral they are ArrowLeft / ArrowRight, which already do that. Marching Bands' arrows are spatial, so its keys call the engine's `prevCell` / `nextCell` directly (a bottom-row `onTap` item). Crushword's grid is spatial, so its Prev / Next cell flank four arrows, ◂ ▴ ▾ ▸ (ArrowLeft / Up / Down / Right), that act exactly as the hardware arrows do: ◂ ▸ also step through a cell's letters and cross a cell's edge, and each arrow sets the direction to its own axis (◂ ▸ Across, ▴ ▾ Down). That is why Crushword has no Across ⇄ Down key: a tap on the active cell or on the clue bar switches the direction without moving, as on the desktop. The other three tools keep their switch key, since their arrows are not two-dimensional.

**One input path:** a drawn letter enters as the hidden input's `input` event and every other key a hardware keyboard also has as a synthetic `keydown` on `document`, so no tool's typing rules have a second copy; an `onTap` key exists only for an action no real key has. Why: the comment above `typeChar` in `shared/engine-phone.mjs`.

**Focus:** one `mousedown` listener on `#solve-view` cancels every tap's focus change (why beside it), never `pointerdown` (see "Enter / Rebus button — rebus entry"). See "Focus management" for `inputmode="none"`.

**Tap targets:** keys are at least 44px tall, their width exempt — except on a landscape screen too short to leave the clue bar its own 44px above four such rows, where the rows shrink, to 32px at the least (`--key-h` in `shared/base.css`); `#menu-btn`, `#help-btn`, `#clues-btn`, the bar's steps and the menus' rows are at least 44px square (`e2e/mobile.spec.js`).

**CSS:** structure under `html.phone` in `shared/base.css`, colors in `shared/themes/theme-components.css`.

**Print:** `print-base.css` hides the top bar, bar row, keyboard and `.list-cells` (which repeat the entered letters).

**Applies to:** `shared/engine-phone.mjs`, `shared/svg-zoom.mjs`, `shared/svg-zoom-geometry.mjs`, `shared/svg-zoom-gestures.mjs`, `shared/base.css`, `shared/themes/theme-components.css`, `shared/themes/print-base.css`, all four `src/template/engine.js`. Covered by `e2e/phone.spec.js`, `e2e/mobile.spec.js` and `e2e/zoom-phone.spec.js` under the mobile projects.

---

## Filled clues

**Rule:** A clue-list item carries `.filled` while every cell its entry owns holds content —
right or wrong, like a solver crossing a clue off by hand. It is **not** `.correct`, which
still means "whole board verified" and is set only by `markSolved`. Snake Charmer, Spiral,
and Crushword mark it; Marching Bands does not, for the reason given under "Active-clue
banner" (its clues own no known cells).

**Derived, never persisted:** each engine's `syncUI()` recomputes `.filled` on every clue
item from cell content via the board checker's `isEntryFilled(cells)`
(`shared/engine-state.mjs`), so restore, Clear, Play again and edits need no extra paths. A
cell mid-composition is not filled, matching the board checker — a finished clue therefore
loses `.filled` while its rebus cell is being re-edited, and regains it on commit. In
Crushword every cell composes on its own keystrokes, so there a clue gains `.filled` only
when its last cell commits (Enter, Space, or moving the cursor away), not as the letter is
typed. That lag is a decision, pinned in `e2e/crushword.spec.js`; Snake Charmer and Spiral
commit a plain letter at once. The
class lives on clue-list items only; `#active-clue-bar` does not reflect it.

**Theme hook:** `--theme-clue-filled-decoration` (default `none`) and
`--theme-clue-filled-opacity` (default `1`), consumed by `.clue-item.filled .clue-text` in
`theme-components.css`. Defaults are no-ops; a theme opts in from its tokens file
(`broadsheet` sets opacity `0.5`). A solved board's clues are `.filled` too and carry `.correct`,
which no rule styles: nothing strikes a clue through or colors it. `print-base.css` resets
`.filled` — a printout is the blank puzzle (see "Print-mode state erasure").

**Applies to:** `engine.js` for Snake Charmer, Spiral, and Crushword; `shared/engine-state.mjs`,
`shared/themes/theme-base.css`, `shared/themes/theme-components.css`,
`shared/themes/print-base.css`, `shared/themes/broadsheet-tokens.css`.

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
the segmentation itself is the puzzle. `#check-btn`, in the help menu, *is* toggled per-cell and
absent when hashed — do not copy it.

**Implementation:** `makeComposer` in `shared/engine-state.mjs`; `setupRebusButton` in `shared/engine-chrome.mjs`.
Each engine calls `composer.commitIfMoved(n)` as the first statement of `focusCell`;
because the active cell is assigned nowhere else, that single call site covers arrows,
Tab, Space, cell clicks, clue clicks and toggles. A same-cell focus (a direction or mode
toggle) is a no-op, so composition survives `.`.

Both entry points route through one per-engine `toggleRebus()`, so the composer call
cannot drift. One guard is still kept in step by hand: the click handler repeats
`setupKeydown`'s meta/ctrl early return, so a modified click is ignored exactly as
`Cmd+Enter` is. The solved-board guard needs no copy, since `composer.toggle` itself refuses
composition once the board is solved. The engine's `syncUI()` calls `rebusBtn.sync()`, which
is what restores the label when composition ends by a cursor move rather than by the
button.

`const rebusBtn` is created in Event wiring with the other controls, below `syncUI`, which
calls `rebusBtn.sync()`. That is safe for the reason every later `const` a logic function
reads is safe: those functions first *run* in Restore & focus (the `init()` invariant under
"Engine bootstrap & structure"), so only a call moved earlier would hit the temporal dead
zone. Do not "fix" such a TDZ error with `rebusBtn?.sync()`: that silently stops updating
the label instead of throwing.

**Why the button binds `mousedown` and `click` separately:** focus-on-click is a
`mousedown` default action, so canceling `mousedown` keeps focus on `#hidden-input` and
a phone's soft keyboard stays up, while `click` still fires and keeps the button
reachable by keyboard. `refocus` covers that keyboard path, where focus *does* land on
the button and letters would otherwise go nowhere; it runs even on a solved board, since
the focus-management rule above admits no exceptions.

**It must be `mousedown`, never `pointerdown`.** See `shared/engine-chrome.mjs`
(`setupRebusButton`) for why. That distinction is why `playwright.config.js` runs a
`webkit` project and `e2e/snake-charmer.spec.js` has a `hasTouch` tap test — a
Chromium-only suite once reported green while the button was inert on iOS.

**A solved board never opens composition, whichever route reaches it.** `composer.toggle` refuses it (the `isSolved` accessor every engine passes to `makeComposer`), so the button, which never passes through the keydown handler's `latch.solved` return, needs no guard of its own. Pinned by `shared/test/engine-state.composer.test.js` and by the `#rebus-btn` click appended to each tool's "a solved board restores…" e2e.

**Composition is saved state, not live UI state.** See `shared/engine-state.mjs`
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
other tools. So does Check cell, which is enabled on a composing cell (`setupControls`'
`canCheck`, which in the other tools refuses one) and commits it before checking, so a
just-typed letter can be checked without moving off it.

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

Per-key behavior and implementation notes: the comments in `crushword/src/typing.mjs`
and `crushword/src/template/engine.js`. Solver-facing summary: `crushword/docs/SPEC.md`.

**How to verify:** type two letters into an empty cell — both land in it and the cursor
holds. Press ← and type — the letter is inserted between them. Keep typing to
`maxCellLetters` — the cursor advances on its own.

---

## Tab / Shift+Tab entry navigation

**Rule:** Tab jumps to the next entry in the current direction that still has an empty cell, landing on that entry's first empty cell. Shift+Tab does the same toward the previous entry. Both wrap, and both skip complete entries, as crossword apps do; the phone's ‹ › press these keys. Direction switching is a separate action (toggle button or cell click), not a Tab side effect, except in Crushword (below).

`stepToUnfilled` (`shared/engine-state.mjs`) owns the rule, and each engine supplies its entry order, an entry's cells and `composer.isCellFilled`, so a cell mid-composition counts as empty. The starting entry is tried last, so when it is the only incomplete one the cursor stays in it, on its first empty cell. When every entry is complete there is nothing to skip to, so Tab steps plainly to the neighbor's first cell.

**A solved board still takes Tab and Shift+Tab** (so a solver can read through the clues after View puzzle); every other key is ignored there.

**Crushword:** the across entries followed by the down entries form one loop. Tab from the last across entry goes to the first down entry, changing the direction to down; from the last down entry it goes to the first across entry. Shift+Tab runs the loop backward, and skipping complete entries works across the seam.

**Spiral:** Tab wraps within the current direction and never switches between inward and outward. This is a decision, not a gap: unlike across and down, the two directions read the same cells in opposite orders, so hopping from one to the other would feel like a jump rather than a next clue.

**Multi-loop puzzles (Snake Charmer):** Entries are indexed globally across all loops — loop 0 entries come first, then loop 1, and so on. Tab always advances to the globally next entry regardless of which loop it belongs to. Wrapping past the last entry of the last loop returns to entry 0 of loop 0. This means Tab will cross loop boundaries naturally; there is no separate "next entry in current loop" concept.

**Marching Bands:** Tab jumps to the first cell of the next row (row mode) or next band (band mode), not to the next individual entry. Marching Bands rows and bands each contain multiple entries whose boundaries are unknown to the solver — revealing entry divisions via Tab navigation would spoil the puzzle. This is an intentional tool-specific carve-out from the "jump by entry" rule. The skipping rule applies to rows and bands: a row or band is complete when all its cells hold content, which says nothing about where its entries break.

**How to verify:** While in direction A, Tab repeatedly — should cycle through all entries in direction A without switching to direction B (Crushword: after the last across entry it continues into the down entries, and after the last down entry wraps back to across). Fill one entry completely and part of the one after it, go to the entry before them, and Tab: the cursor passes the complete entry and lands on the next empty cell of the partly filled one. On a solved board, close the dialog and Tab: the cursor still steps between entries, and typing still does nothing. In a multi-loop puzzle, Tab should visit all entries across all loops before wrapping back to entry 1.

---

## Clue click navigation

**Rule:** Clicking a clue item navigates to the first cell of the corresponding entry (or row/band) and focuses the puzzle.

**Snake Charmer / Spiral / Crushword:** Each `<li class="clue-item">` is individually clickable. Clicking it sets the active entry direction (inward/outward for Spiral, across/down for Crushword; no direction change needed for Snake Charmer) and calls `focusCell(firstCellOfEntry)`.

**Marching Bands:** Because entry boundaries are hidden from the solver, individual entries are not independently clickable. Instead, all entries for a single row or band are grouped under a `<li class="clue-group">` wrapper. Clicking anywhere in the group switches to the appropriate mode (`row` or `band`) and calls `focusCell(firstCellOfRow/Band)`. Individual `.clue-item` elements inside the group are non-interactive on desktop.

**Fill-in list on a phone** (Snake Charmer, Spiral, Crushword): a tap on a cell in a clue's `.list-cells` row puts the cursor on that cell instead (`onClueClick` ignores it), in that clue's direction or loop; see "Phone layout and drawn keyboard".

**Marching Bands on a phone:** the list is plain (no drawn keyboard while it is open), and a tap on an individual `.clue-item` does what a tap on its group does, then closes the list and opens the navigator on the tapped clue (see "Active-clue banner").

**Links inside a clue:** a click whose target is inside an `<a>` (see "Markdown formatting in clue and instructions text") is ignored by every engine's clue/group click handler and by the phone layout's bar, full-clue and Marching Bands list handlers, all through `onClueClick` in `shared/engine-chrome.mjs`, so following the link never also moves the cursor.

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

**Cell count, not letter count.** Bracket contents are normalized like the rest of the answer (letters only, lowercased). `entryCellCount` and every validation rule built on it — entry lengths, ring size, row/band totals — count *cells*: `S[HAR]ON` is 4 cells, the same as `MALL`, despite having 6 letters. `length:` in a muddled file is likewise a cell count. An answer with no brackets parses exactly as before, so existing puzzles and authors who never use the notation are unaffected.

**Grammar errors** (each reported with the entry's label) and the deliberate leniency toward a bracketed single letter: see `docs/AUTHORING.md` → "Rebus cells", which owns the grammar table.

**Per-tool cross-check rules,** each enforced by that tool's validator:

| Tool | Rule |
|---|---|
| **Spiral** | Outward reads the cells in reverse order and each cell backward, so an outward rebus may be spelled forward or reversed (`sameCell`): inward `S[HAR]ON` pairs with outward `NO[HAR]S` or `NO[RAH]S`, never `NO[HRA]S`. The cell holds the inward spelling. |
| **Snake Charmer** | Every loop must bracket the same groups at the same cells. The period constraint applies in cell space: loop 1 must reproduce loop 0's cells exactly, not merely the same letters split differently. |
| **Marching Bands** | Every cell belongs to one Row word and one Band word, and the build cross-checks that they agree as *cells*, not as letters. Along a band's bottom edge, corners included, the band reads its row right to left, so a rebus there may be spelled reversed (`sameCell`, `onBandBottomEdge`); elsewhere it must match exactly. The cell holds the row's spelling. |
| **Crushword** | A crossing Across and Down entry must bracket their shared square identically — the validator cross-checks them as *cells*, not as letters. Crushword also bounds rebus width per puzzle with `maxCellLetters` (default 3), the only tool-level cap on how many letters one cell may hold. |

**Why only some crossings may reverse a rebus.** A cell holds one string, and the solver types it as written. An entry that reads the cell *against* that direction — Spiral's outward pass, a band's bottom edge — naturally meets its letters backward, so `[CAT]` and `[TAC]` name the same cell. Snake Charmer's loops, Crushword's Across and Down, and the other band edges read a cell forward or crosswise, so two different spellings there would be two different contents for one cell, and the page could accept only one.

**Applies to:** `shared/build/cells.js` (`parseAnswerCells`, `entryCellCount`), `shared/build/prepare.js` (`processEntries`), `shared/build/validateEntry.js`, `shared/build/muddleUtils.js`, all four tool validators, and the per-tool `docs/SPEC.md` files (which carry the tool's own rule and a pointer here and to `docs/AUTHORING.md`).

---

## Cell styles

**Rule:** A cell-scoped style (`STYLE_SCOPES` in `shared/build/validateEntry.js`; today only `circle`) describes a board cell, not an entry, so it is listed on every entry that covers the cell. `checkCellStyles` (`shared/build/validateEntry.js`) reports a missing listing as an error naming the entry and the position to add. A cell covered by one entry needs only that entry's listing.

**Engine contract:** every engine draws at most one decoration per cell and style. The listings are deliberately redundant (each entry's `styles` stays complete on its own), so two entries mark the same cell and the engine must not paint it twice — a doubled circle would paint bolder than a single one.

**Applies to:** the four validators (each builds its own cell coverage and calls `checkCellStyles` last, for source and muddled puzzles alike) and the four engines' circle passes.

**How to verify:** `e2e/shared.spec.js` → "no cell carries two circles (doubled styles draw once)".

---

## Muddled YAML format version

**Rule:** Every muddled YAML (the output of `varietypack muddle`) carries a top-level `format: 2`. Full statement — including why it's a version field rather than silent reinterpretation — in `docs/ARCHITECTURE.md` → "Muddled YAML".

**Applies to:** `shared/build/validation.js` (`validateCommonHeader`), `shared/build/muddleUtils.js` (`buildMuddledYaml`), every tool's validator (which calls `validateCommonHeader`).

---

## Answer checking

**Both modes:** There are two parallel checking paths — non-hashed and hashed. Keep them symmetric: any behavior visible to the solver (when feedback appears, what gets marked, what banner shows) must be consistent between the two modes.

**Non-hashed:** A "Check cell" row of the help menu (disabled when the active cell is not filled — empty or composing — or already marked correct) asks `checker.checkCell(n)` (`makeBoardChecker`) and marks the active cell `.correct` when it answers `true`; `checker.canCheck(n)` drives the disabled state. On every `input` event, `checkIfFilled()` (from `makeBoardChecker`, see below) also runs: when all cells are filled it checks all and calls `syncUI()`, opening the congrats dialog (via the latch) if every cell is correct, or showing the done-wrong banner if not.

**Hashed:** No Check cell button. On every `input` event, the same `checkIfFilled()` guards until all cells are filled, then hashes the board and compares to `boardHash`. If it matches, all cells, and clue items in the tools that mark them, are marked `.correct` and `syncUI()` is called.

**Cell-at-a-time comparison, and why hashed mode needs a delimiter:** `makeBoardChecker` compares one cell's typed content against that cell's full stored content (which may be a multi-letter rebus group) — never a single character against a single character. Non-hashed mode is therefore already "per cell" by construction. Hashed mode has no per-cell stored letters to compare against — it has one hash of the whole board — so it must reconstruct that same cell boundary information some other way: joining normalized cells with `CELL_DELIM` before hashing (see "`solution` — canonical board string per tool" below) is what makes the hashed path symmetric with the non-hashed one instead of accepting any board whose cells concatenate to the same letters.

**Editing removes correctness:** `setCellLetter()` (or equivalent) always strips `.correct` from a cell whenever a letter is set or cleared, so an overwritten cell reverts to unchecked state.

**"Filled" excludes composing cells.** A cell counts as filled when it holds content and
is not composing (`composer.isCellFilled(n)` — the single predicate that replaced every
per-engine emptiness check). **Every path that applies `.correct` applies it only to a
filled, non-composing cell.** Check does so after checking `isCellFilled` on that cell:
`makeBoardChecker`'s `checkIfFilled` via its all-filled guard, and `checker.checkCell`,
whose `canCheck` guard sits inside the function — not in the button's `disabled` state,
which is UX only. Reveal does so by making the cell filled first: `revealCells` ends the
composition without committing it (its comment says why), writes the answer, then marks the
cell, and it must run in that order. Its caller, `makeHelpActions`, then counts the reveal,
runs the completion path and only then saves; its comment says why. All of this is pinned
by `shared/test/engine-state.checker.test.js` and `engine-state.reveal.test.js`.
`applyState` satisfies the rule vacuously: nothing is composing at restore time.

Without this, a mid-composition prefix can be a *correct* board — if the last cell should
hold `HA` and the solver is part-way through typing `HAR`, an unsuppressed check sees a
solved board and seals the one-way completion latch, so `varietypack:complete` fires for a
half-entered board and never fires again when the solver actually finishes.

**`syncUI()`'s latch call carries no composing exclusion — it is safe because a composing
cell never coexists with a solved board.** `latch.check(checker.isSolved())` reads
`.correct` markers, not fill state, so nothing on that path consults `isCellFilled`. Three
routes could otherwise mark every cell while one composes, and each is closed. Reveal ends
the composition before it marks, so it cannot mark a cell that is still composing. The help
actions (`makeHelpActions` in `shared/engine-state.mjs`) end composition when their marks
complete the board; that function holds the reason. And composing on an already-solved
board is refused: once solved, `composer.toggle` refuses composition whichever route
reaches it (the keydown handler also returns first). The last route is pinned by the "a
solved board restores …" e2e in each tool (Crushword presses `Enter` and types a letter,
since typing is its only route in); the first two by the "Reveal puzzle ends a composition
left open on a correct cell" e2e and the `makeHelpActions` unit tests. **Not covered:**
*reachability* — a refactor that marks cells `.correct` without going through
`checkIfFilled` or a help action could yield a solved board while a cell composes, by a
route no test exercises; such a change must give `latch.check` its own composing exclusion.

**One function serves both modes.** `makeBoardChecker` (in `shared/engine-state.mjs`) is
the board-state and answer-checking core shared by every tool. The guard,
the `syncUI()` calls and the solved-board marking are shared; `hashed` selects only how
correctness is evidenced — a per-cell comparison against `data.letters`,
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

**Rule:** Printing a puzzle always produces the blank, unsolved puzzle regardless of solve state — never the solver's progress. Entered letters (`.cell-letter`) are hidden. All cell fill colors (active, highlighted, correct) must reset to white. All clue styling (active highlight, correct strikethrough, filled dimming) must reset to unstyled. A half-way state (letters without their correctness, or the reverse) is never printed.

**Applies to:** `shared/themes/print-base.css` (the cross-tool resets) followed by each tool's `template/print.css` (tool-specific layout rules) — both concatenated *after* the theme CSS by `composeThemeCss`. `print-base.css` is the final override layer, `!important` by design (rationale in its header comment); a tool's `print.css` that needs to override a base reset must also use `!important`. The shared base hides `.cell-letter` and covers all cell-state selectors (`.cell`, `.cell.active-entry`, `.cell.active-cell`, `.cell.correct`, `.cell.secondary-entry`) and clue-state selectors (`.clue-item.active-clue`, `.clue-item.secondary-entry`, `.clue-item.correct .clue-text`, `.clue-item.filled .clue-text`). A tool's `print.css` handles only tool-specific non-cell overrides — e.g. MB's `.clue-group.active-clue` (MB uses `.clue-group` not `.clue-item` for clue highlights) and layout adjustments. Do not add per-tool cell-state selectors to a tool's `print.css` — the shared `!important` reset already covers every cell class.

**How to verify:** Fill some cells and mark some correct, then print (or use browser print preview) — no letters, no green fills, no struck-through clues.

---

## Solve celebration / done-wrong banner

**Rule:** The done-wrong banner (`#done-wrong`) appears when all cells are filled but not every cell carries `.correct`. It is driven exclusively by `syncUI()`, through `syncSolveState` — event handlers never set its visibility directly.

The solve celebration is **not** a banner and is not `syncUI()`-driven. `syncUI()` reports solved-ness to `latch.check()`; the latch fires `onComplete` on a false→true transition only, which opens the `#congrats-dialog` modal. The difference is observable: the done-wrong banner is re-derived on every `syncUI()` and so reappears whenever the board is in that state, while the celebration fires once per solve and does not reopen on a reload of a solved board (see "Emission guarantee").

The dialog offers Copy result (the title, date and time, to the clipboard, which a browser grants only a secure page: https, `localhost` or a file), View puzzle (closes it on the solved board, as a backdrop click does) and Play again (`resetBoard()`).

---

## localStorage key format

**Rule:** The auto-save key is `vp:<tool>:<boardHash>` (`storageKey` in `shared/engine-chrome.mjs`; why the board hash is beside it). The tool discriminator keeps two tools apart, since the same answers in two formats make the same board string and so the same hash.

| Tool | Key format |
|---|---|
| Snake Charmer | `vp:sc:<boardHash>` |
| Spiral | `vp:sp:<boardHash>` |
| Marching Bands | `vp:mb:<boardHash>` |
| Crushword | `vp:cw:<boardHash>` |

**Save format:** every tool's payload shares this field set: `{ v: 1, letters, correct, activeMs, composing, help }`. `help` is `{ checks, reveals }`, the help record ("Help menu and help record"; the saved field keeps the name `help` while the engines call the record `helpRecord`), and a save without it restores as zero counts, so adding it needed no `v` bump. `makeSavePayload` (`shared/engine-state.mjs`) builds the payload and its restore order for every engine; the composer restores last. `letters` is an object from cell id to the cell's letters and `correct` an array of cell ids, in every tool — both come from `makeCellStore` (`shared/engine-state.mjs`). `v` is the schema version, `SAVE_VERSION` in `shared/engine-chrome.mjs`: restore ignores a save whose `v` differs, and the rule for when to bump it is beside the constant. Restore also ignores a save that names a cell the board lacks (`makeCellStore`'s `fitsSave`, which each engine passes to `setupStorage` as `fits`), since two boards can share a key (why beside `storageKey`). `activeMs` is the accumulated active-solve time in ms. `composing` is the id of the cell left mid-composition, or null — see "Composition is saved state" above.

**`correct` carries cells only, deliberately.** Everything else a solved board shows is derivable, so it is re-derived at restore rather than persisted — `checker.repaintIfSolved()` re-runs `markSolved()` when every restored cell is marked, which is what puts the clue-item `.correct` marks back in the tools that paint them. Do not add a clue array to the payload; that would be a schema change for state the marks already imply.

**Timing contract:** `saveState()` is called only at state-mutation sites — the backspace block, space block, input event handler, Check cell, Check clue and Check puzzle whenever a check ran (some cell was checkable), right or wrong, and Reveal cell, Reveal clue and Reveal puzzle after their completion path (see "Help menu and help record"). A wrong check marks nothing and writes only the help count (`help.checks`, see "Help menu and help record"); a Check cell that could not run counts and writes nothing (pinned by the Check cell tests in `e2e/shared.spec.js`); the elapsed time reaches storage at the next mutation site, or on `visibilitychange→hidden` (pinned by `shared/test/engine-state.timer.test.js`). It is NOT called from `syncUI()`, which fires on every focus movement and would write identical data on every keystroke. Restore runs through `restoreAndSeal` (the "Restore & focus" row of "Engine bootstrap & structure") just before the first `focusCell()`, so `.correct` classes are applied before `syncUI()` runs and the restored solved state is visible immediately. `clearState()` removes the key; it is called by the Clear button after the two-click arm sequence.

**Applies to:** each tool's `src/template/engine.js`.

**Clear button (`#clear-btn`):** Lives inside the options menu (`#menu-panel`, see "Options menu" above), not `#controls` — moving the board-reset action out of the always-visible controls row and behind a deliberate open-the-menu step is what keeps a stray click from resetting real solving progress. Labeled "Clear puzzle". Uses a two-click arm pattern: first click changes the label to "Are you sure?" and adds class `.armed` for 3 seconds; second click runs the engine's `resetBoard` (see the contract below) and closes the menu. The button carries `type="button"` to avoid accidental form submission. The panel doesn't narrow while armed because `base.css` reserves the wider label's width (rationale beside that rule).

**Solver preferences — `vp:pref:listWrap` and `vp:pref:keyboardLeft`, one key each for every puzzle.** The phone list view's "Wrap long rows of cells" and the landscape layout's "Keyboard on the left" are a solver's preferences, not a puzzle's, so their keys name no tool or puzzle and Clear puzzle leaves them alone. They load and save through `boolPref` (`shared/engine-chrome.mjs`).

**`resetBoard()` contract:** Each engine's `resetBoard()` (Clear and Play again) calls `resetAndRefocus` (`shared/engine-state.mjs`), which fixes the order: `composer.reset()` first, then the engine's `clearBoard`, `clearState()`, `timer.reset()`, `latch.reset()`, `helpRecord.reset()`, and the engine's `focusInitial` last — the function's comment says why the ends are pinned. `clearBoard` must return the board to its freshly-loaded state:

- Zero all letter state through the engine's `setCellLetter`, the one writer of a cell's letter, so the engine's record, the displayed text and its `len-*` class are cleared together (never a raw `textContent` write).
- Remove `.correct` from all cells and letters, and from clue items in the tools that mark them (Snake Charmer, Spiral, Crushword — Marching Bands marks none).
- Empty `flashLayer`.
- Reset the navigation sub-mode to its initial value (`mode = 'row'` for Marching Bands, `direction = 'inward'` for Spiral, `direction = 'across'` for Crushword; Snake Charmer's loop resets through `focusInitial`).

No page reload occurs — the board resets entirely in memory.

---

## Completion event — `varietypack:complete`

**Rule:** On each false→true transition of "board solved", every engine emits `varietypack:complete` on `.puzzle-main` and posts to `window.parent`. Implemented via `makeCompletionLatch` in `shared/engine-state.mjs`.

### CustomEvent

```js
new CustomEvent('varietypack:complete', {
  bubbles: true,
  composed: true,
  detail: { boardHash, kind, title, date, timeMs, solution, checks, reveals },
})
```

**Target:** `.puzzle-main` — the shared outer puzzle container present in all four tools.

**`detail` fields:**

| Field | Type | Description |
|---|---|---|
| `boardHash` | string (64-char hex) | SHA-256 of the canonical board string. Always present in both hashed and non-hashed builds. |
| `kind` | string | `"snake-charmer"`, `"spiral"`, `"marching-bands"`, or `"crushword"` |
| `title` | string | Puzzle title from YAML |
| `date` | string or number | Puzzle date from YAML (may be `undefined` for puzzles without a `date` field) |
| `timeMs` | number | Active solve time in ms — see Timing semantics below |
| `solution` | string | Normalized board string (SHA-256 preimage) — `sha256hex(solution) === boardHash` |
| `checks` | number | How many times the solver used Check (the help record; a hashed page never adds to it, but reports counts restored from a save it shares with the plain build) |
| `reveals` | number | How many times the solver used Reveal (the help record; a hashed page never adds to it, but reports counts restored from a save it shares with the plain build) |

### postMessage (iframe embedding)

```js
window.parent?.postMessage(
  { type: 'varietypack:complete', boardHash, kind, title, date, timeMs, checks, reveals },
  '*'
)
```

`checks` and `reveals` are not sensitive, so they go on every message, whichever origin it names.

**By default `solution` is absent from `postMessage`.** The `'*'` targetOrigin broadcasts to any parent host. In hashed builds, `solution` is proof-of-knowledge and must not be broadcast to unknown origins. In non-hashed builds the answers are in the HTML anyway, so this is a belt-and-suspenders exclusion.

**`embedOrigin` variant.** A build with `embedOrigin` (the `--embed-origin` flag, carried in `PUZZLE_DATA`) posts the same message **with `solution`** to that one origin instead of `'*'`: `postMessage({ ...message, solution }, embedOrigin)`. Exactly one message is posted either way, so a host never counts a solve twice, and a parent on any other origin receives nothing. The origin is checked as part of build validation (`validateEmbedOrigin`: http(s), no path, no trailing slash, and written as a browser serializes it, so lowercase with no default port). A bad one is a validation error that names the form to use; it is never rewritten, since the string ships as written.

Verification is meaningful only for **hashed** builds: the host checks `e.origin`, then `sha256hex(solution) === boardHash`, using the `boardHash` from the muddled YAML, so it never needs plaintext answers. A plain build ships its letters, so its posted solution proves nothing (the build says so in a note).

### `solution` — canonical board string per tool

| Tool | String |
|---|---|
| Snake Charmer | Ring cells in traversal order (loop 0), each normalized (lowercased), joined with `CELL_DELIM` |
| Spiral | Inward cells 1 → N, each normalized (lowercased), joined with `CELL_DELIM` |
| Marching Bands | Row-major order (1 → N²), skipping the center cell, each normalized (lowercased), joined with `CELL_DELIM` |
| Crushword | Row-major cell order (top-left to bottom-right), skipping blocked cells entirely (not an empty segment), each normalized (lowercased), joined with `CELL_DELIM` |

**Cells, not letters.** A cell may hold a multi-letter rebus group (bracket notation, see each tool's `docs/SPEC.md`), so the board string is not a plain letter concatenation. `joinCells` (in `shared/boardString.mjs`) joins normalized per-cell strings with `CELL_DELIM` (`.`) — neither a letter nor a digit, so it can never collide with normalized cell content (`[a-z0-9]` only). Without the delimiter, a solver's `["ha", "ro"]` would hash identically to the correct `["har", "o"]` and a wrong board would report as solved. The join is over cells that **exist** in traversal order — never over grid positions: Marching Bands' center square (odd N) contributes nothing to the string, not an empty segment.

This is the same string `makeBoardChecker`'s `getSolution()` builds and `checkIfFilled()` passes to `sha256hex()` for every tool.

### Timing semantics — `timeMs`

`timeMs` is **active solve time**: total duration the puzzle was open and visible, from the first letter input to completion, accumulated across sessions. The clock starts on first letter-mutation (not page load), pauses when the tab is hidden, resumes when visible, and stops at completion, so the saved `activeMs` of a solved puzzle is its solve time. Open-but-idle time counts; no idle detection.

**Persistence:** The accumulator is saved in the auto-save localStorage payload under `activeMs`. On `visibilitychange→hidden`, the `setupTimer` function (in `shared/engine-state.mjs`) folds the running interval and calls the engine's `saveState` so the accumulated time survives tab-close.

### Emission guarantee

Fires once per solve: on the false→true solved transition, after which the latch stays sealed until Clear or Play again re-arms it (`resetAndRefocus`), so solving again in the same page load fires again. Restoring a previously-solved puzzle from localStorage does not re-emit — the latch is sealed immediately after `restoreState()`.

### Implementation

`makeCompletionLatch` and `setupTimer` live in `shared/engine-state.mjs`; every engine builds the pair through `setupSolveTracking`, passing its congrats dialog's `open` as `onComplete` so `engine-state.mjs` never calls into `engine-chrome.mjs`.

**Applies to:** `shared/engine-state.mjs`, all four `src/template/engine.js` files, all four `src/prepare.js` files.

## Embedding — auto-sizing

Every engine calls `setupEmbedResize()` (`shared/engine-chrome.mjs`) once, at the start of its *Event wiring*. When the page is framed (`window.parent !== window`) and `ResizeObserver` exists, it posts `{ type: 'varietypack:resize', height }` to the parent with targetOrigin `'*'` (a page height isn't sensitive), where `height` is `ceil(document.documentElement.getBoundingClientRect().height)`: the page's own box, not `scrollHeight`, which is never below the iframe's viewport and so could not shrink. It posts when the height first becomes known and again only when it changes, so a host can set its iframe's height directly. An unframed page posts nothing. A page in the phone layout adds `fill: true` (`setupEmbedResize` says why), and the host makes the frame `100svh` high instead of `height` px; the solving view's own `100svh` is then the frame's height, so it fits the visible screen exactly.

