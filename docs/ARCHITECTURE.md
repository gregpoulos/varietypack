# Architecture

How the build pipeline and the shared library fit together. Format-specific
material lives in each tool's own docs; author-facing rules live in
[AUTHORING.md](AUTHORING.md); interactive contracts between the engines live in
[CROSS_TOOL_SPEC.md](CROSS_TOOL_SPEC.md). Every function is documented at its
definition site, so this file covers only what the code can't say for itself:
how the pieces divide the work, and why.

## Shape of the repo

Each tool has its own top-level directory holding its validator, prepare step,
builder, template and tests. The tools share one `package.json`, one
`node_modules` and `shared/` (cross-tool code referenced by relative path), with
no workspace manager and no package hoisting.
`studio/` is the one exception to "no build step": it is bundled by esbuild and
uses Preact for its UI. esbuild is also a runtime dependency of the CLI, which
bundles each puzzle page's script at build time. Output is one self-contained
HTML file per puzzle, with no runtime dependencies.

## CLI and build pipeline

The `varietypack` dispatcher (`cli.js` at the repo root) has four subcommands:
`build`, `watch`, `validate` and `muddle`. Usage is in the README and in each
tool's `docs/SPEC.md`. `build` treats a single file as a directory of one
puzzle: it parses flags once, loads each file once with `loadKnownPuzzle`, then
builds it in-process through `buildOneFile` (output-path resolution and
overwrite protection) and `writePuzzlePage`, whose `buildKnownPuzzle` pairs a
loaded puzzle with its tool's hooks.

**The tool registry.** `shared/build/tools.js` is the one list of tools: `KINDS`,
`isKnownKind`, `kindError` (the message for a missing or unknown `kind`) and
`hooksFor(kind)`, which returns that tool's `HOOKS` and requires its builder on
first use. It is on the build path, so the studio bundles it too; the engine
bundler (`engineBundle.js`), `studio/build.js` and the studio core read their
tool list from it. `shared/cli/cliTools.js` holds only what the CLI adds:
loading a puzzle file whose kind is known, a tool's directory (for `watch`),
`validatorFor(kind)` (a tool's `validate`, read from its validator module alone, so
`validate` never loads the page builder) and `extraOptionsFor(kind)`, a tool's own
flags beside the global ones. Snake Charmer's `--shape` is the only one, defined in
`snake-charmer/src/cliOptions.js`;
`varietypack build --help` lists each tool's options from there. No tool has a
command-line entry point of its own. Flag parsing is Node's
`util.parseArgs`, and options are written in its format (plus `arg` and
`description` for `--help`); `parseCliArgs` only adds a positional cap. Flag
values aren't allowlisted at parse time: the build path reports a bad
`--theme`, `--font` or `--embed-origin` (`validateBuildOptions`, which
`buildFromObject` runs) or `--shape` (Snake Charmer's validator) as a
validation error, which also covers the studio.

Every tool takes its output path through `-o <output.html>`, never a
positional, so the interface stays uniform as flags accumulate. Without `-o`,
the output is `<input-basename>.html` next to the input.

**The `hashed` pattern.** `hashed` is never read from a source YAML (the
validator rejects it there). It is always injected at build time, from the
`--muddle` flag or from detecting a muddled file. `buildFromObject()` in
`shared/build/buildFromObject.js` owns both that computation and the
`prepareFn({ ...rawPuzzle, hashed })` call. `writePuzzlePage()` in
`shared/cli/writePuzzlePage.js` wraps it with file I/O for the CLI; the studio
calls `buildFromObject()` directly. A new tool exports
`HOOKS = { validateFn, prepareFn, buildHtmlFn }` from `builder.js` and adds
itself to `TOOL_HOOKS` in `shared/build/tools.js`; the CLI builds it through
`buildKnownPuzzle(loaded, inputPath, outputPath, options)`. `builder.js`
stays free of file I/O so the studio can bundle it.

`buildHtmlFn` is `(prepared, rawPuzzle, options, notes) => htmlString`.
`rawPuzzle` is the pre-prepare YAML object, for a tool that needs a raw field
`prepared` doesn't carry (Snake Charmer's explicit `shape`). `notes` is an
array it may push complete message lines into (no trailing newline), which the
CLI prints and the studio shows.

**`buildToolHtml`.** All four tools' `buildHtml()` share one skeleton: read the
tool's `index.html` template, compose the theme CSS, take the tool's bundled
page script, and inject `title`, `css`, `js` and `puzzleData` into the
template. `buildToolHtml(templateDir, { title, tool, puzzleData }, opts)` in
`shared/build/page.js` owns it. `tool` names the tool whose script
`engineJs(tool)` returns (`shared/build/engineBundle.js`: esbuild, once per
process; the studio's bundle swaps that module for the same scripts built
ahead). Callers assemble `puzzleData` themselves
(`{ ...commonPuzzleData(prepared), ...toolFields }`), since that is the one
genuinely tool-specific part.

## Muddled YAML

A muddled YAML is a source YAML with each entry's `answer:` replaced by
`length:` and the top-level fields `hashed: true`, `format: 2` and `boardHash:`
added (the full field list is in [AUTHORING.md](AUTHORING.md)). What the build
path relies on:

- `length:` is a **cell** count: a bracketed rebus group is one cell however
  many letters it holds.
- `format:` is invalid in a source puzzle, and that field set is the canonical
  muddled signal, so the format is self-describing.
- Only the board-level hash is stored; there are no per-entry hashes.
- A muddled file carrying `boardHash:` without `format: 2` came from a
  pre-rebus muddler whose hash used plain concatenation. It is no longer
  verifiable, so the validator rejects it and tells the author to re-run
  `varietypack muddle`.
- `format: 2` is an explicit version rather than silent reinterpretation
  because `length:`'s meaning changed with the rebus feature (letter count to
  cell count). Without the version check, an old file's letter-count `length:`
  values would silently misbuild the grid for any puzzle that still parses.

## Cells and board strings

Answers are normalized (see [AUTHORING.md](AUTHORING.md); the function is
`shared/normalize.mjs`) before cell-counting, validation and hashing.

An `answer:` string may mark a rebus cell with `[...]`; a bracketed group is
exactly one cell (`S[HAR]ON` gives cells `s|har|o|n`). `parseAnswerCells()` in
`shared/build/cells.js` is the one parser that turns an `answer:` into per-cell
normalized strings. Validators get an entry's cells from what `validateEntry`
returns, and prepare steps from `processEntries`' `_cells`. `entryCellCount()`
equals `normalize(answer).length` for a bracket-free answer and is smaller when
brackets are present. `length` everywhere in the formats (a muddled entry's
`length:`, `PUZZLE_DATA`'s entry `length`) means the same cell count.

A muddled entry has no cells (it carries `length:` and no plaintext), so its
`_cells` is `null`. A prepare step reads `_cells` only inside the `computeBoard`
closure it passes to `prepareCommon` (in `shared/build/prepare.js`), which owns
that guard for all four tools. On a source entry with an invalid answer,
`entryCellCount` and `processEntries` throw (`cellsOrThrow`) rather than return
an empty cell list.

**Normalize each cell, then join; never normalize a joined string.** Board
strings (the SHA-256 preimage for `boardHash`, and the `solution` field on
`varietypack:complete`) are built by normalizing each cell individually and
joining the results with `joinCells` from `shared/boardString.mjs` (delimiter
`.`, exported as `CELL_DELIM`). `normalize()` strips everything but letters and
digits, so normalizing a joined string would eat the delimiter and silently
collapse two cells into one.

## Shared library

`shared/` has two kinds of code, depending on where it runs.

**Page modules (`.mjs`).** `normalize`, `sha256hex`, `boardString`,
`engine-state`, `engine-chrome` and `engine-phone` run in the browser and in
Node. They are ES modules: each tool's `engine.js` imports what it needs, and
`shared/build/engineBundle.js` has esbuild bundle that engine and everything it
imports into the page's one script. Each tool's own page-side helpers
(`layout`, `grid`, `typing`, `entryMaps`, the shape renderers) are `.mjs` too.
The extension is deliberate: Node loads them through `require()` as well
(tests, validators, prepare steps, the studio), and for a plain `.js` file with
ES-module syntax it prints a typeless-package warning. An import that names
something a module doesn't export fails the bundle, so a missing wire is a
build error. This needs Node 22.12+ (`require()` of ES modules).

The engines' shared code is split by role. `engine-state.mjs` is the game-state
cores plus composition helpers that fix an order by construction
(`setupSolveTracking`, `restoreAndSeal`, `resetAndRefocus`). `engine-chrome.mjs`
is the UI chrome. Neither imports the other: `setupSolveTracking` takes the
congrats dialog's `.open` as an injected `onComplete` callback.
`engine-phone.mjs`, built on `engine-chrome.mjs`, is the phone solving view and
drawn keyboard that a touch-first device gets (see CROSS_TOOL_SPEC → "Phone
layout and drawn keyboard"). Each engine calls into them from its own `init()`,
keeping per-tool SVG rendering, navigation and `syncUI` in the engine.

`svg-zoom.mjs`, `svg-zoom-geometry.mjs` and `svg-zoom-gestures.mjs` are the phone
grid's pinch, pan and double-tap zoom. They are generic: they know nothing about
puzzles, cells or clues, and `engine-phone.mjs` is what attaches them to a grid and
feeds them the cursor.

**Build-path modules** (`shared/build/` plus each tool's `validator.js`,
`prepare.js`, `layout.js` and `builder.js`). These run in two places: Node, for
the CLI, and the studio page, via esbuild ("the studio bundle"; "the page
script" is `engineJs(tool)`'s output, a separate thing). Apart from the `.mjs`
page modules that the builders also import, they never reach a puzzle page.
They use `'use strict'` and plain `module.exports`, with paths relative to the
requiring file. The rule: the build path reads files only through
`fs.readFileSync` and uses no other Node API; `studio/test/parity.test.js`
enforces it. The one build-path module that needs Node, `engineBundle.js`, is
replaced in the studio bundle by the same scripts built ahead
(`studio/build.js`). The CLI layer, `shared/cli/`, is Node-only, free to use any
Node API, and never in the studio bundle (`studio/test/bundle-guard.test.js`
fails if the studio page reaches it).

`escHtml.js` is plain CommonJS and never reaches a puzzle page; it escapes
titles and links for `shared/cli/buildIndex.js` and
`shared/build/injectTemplate.js`. The engines write puzzle text via
`textContent`.

**`clue` and `instructions` in `PUZZLE_DATA` are HTML, not plain text.**
`shared/build/renderMarkdown.js` renders a small markdown subset at prepare
time (`processEntries` for clues, `prepareCommon` for instructions, both in
`shared/build/prepare.js`), with raw HTML in the source escaped, and engines
inject the result via `innerHTML`, only through `setClueHtml` and
`renderInstructions` in `shared/engine-chrome.mjs` (ESLint rejects an `innerHTML`
assignment in other page code). An engine must never `innerHTML` any other YAML
string. Syntax and security notes: CROSS_TOOL_SPEC → "Markdown formatting
in clue and instructions text".

**Testability categories.** Which category a function is in decides where a
change to it can be covered. See [TESTING.md](TESTING.md).

- *Browser-only DOM helpers* create or render DOM nodes, or wire real DOM event
  listeners directly, with no injectable seam. They have no `node:test`
  coverage; verify them in a browser or in e2e.
- *DOM-coupled, tested via mock* functions take a plain mock object in place of
  a real DOM node, so their logic runs under `node:test` without a browser.
  Tests live in `shared/test/engine-chrome.*.test.js`,
  `shared/test/engine-state.*.test.js` and `shared/test/engine-phone.test.js`.
- *Pure logic* functions have every DOM touch displaced into supplied accessors
  or closures, so they take plain values under test with no mock. The shared
  board-state and answer-checking core (`makeBoardChecker`) is the largest
  example: one `checkIfFilled` serves both hashed and non-hashed modes, which
  makes the two symmetric by construction rather than by two hand-maintained
  copies. Tests live alongside the DOM-coupled ones.

A function's category can shift as it's refactored (a DOM read gets displaced
into an accessor), so check its test file rather than trusting a list.

## Themes and print

`shared/themes/theme-base.css` defines neutral `--theme-*` defaults; each theme
is one `<name>-tokens.css` overriding them. `theme-components.css` holds every
tool-agnostic var-driven selector (masthead, buttons, SVG cell states, congrats
card) plus per-tool namespaced sections for single-tool selectors (bands,
chevrons, secondary cells), scoped by the `class="tool-<name>"` hook on each
`<body>`, so no per-tool theme CSS file is needed. `print-base.css` holds the
cross-tool `@media print` resets.

`composeThemeCss(templateDir, theme, fontMode, themeTokens)` in
`shared/build/themes.js` owns theme defaulting (to `broadsheet`) and the cascade
order (listed, with its reasons, in the comment above it). Builders call it once
instead of defaulting and concatenating by hand.

**Adding a theme** takes two changes: a `<name>-tokens.css` in `shared/themes/`
and a `THEME_REGISTRY` entry in `shared/build/themeRegistry.js`. System-font
themes use `{ fonts: null }`. Custom-font themes declare `fonts.faces` (for
`--font embed`) and/or `fonts.cdn` (for `--font link`), and builders default to
`embed` (or `link` when only `fonts.cdn` is declared). The flag is silently
ignored for system-font themes.

**A theme is printer-friendly if its base visual design translates cleanly to
paper without modification**: high contrast, no screen-specific effects. Every
theme hides interaction chrome (`#controls`, `#congrats-dialog`, `#done-wrong`)
in `@media print`, but a printer-friendly theme needs no further print
overrides. If `@media print` must undo a theme's highlight colors, the theme
isn't printer-friendly. The author's theme choice is the print decision; there
is no separate print mode.

**Explicit `display` in print rules.** `@media print` shares the cascade with
screen styles. If a responsive breakpoint sets `display: block` on a flex or
grid container, that rule applies in print too, so `@media print` must
re-declare `display: flex` or `display: grid` explicitly rather than rely on
the base rule still being active.
