# Cross-Tool Spec

What every puzzle engine must do the same way, where each tool deviates and why, and the
contracts a page keeps with the outside world. It holds three kinds of content only:

- behavior each engine implements itself and must match;
- per-tool deviations, each with its reason in the puzzle format;
- outside contracts: the completion and resize messages, and the storage keys.

What one shared function does is documented at that function, not here. Neither are file
lists or manual test steps: name the test that pins a rule instead.

---

## Engine bootstrap & structure

Each `engine.js` is an ES module whose work happens in `init()`, run on
`DOMContentLoaded`: all mutable state and every function that touches state or the DOM
lives inside it. Pure
helpers worth unit-testing live in a module under the tool's `src/` instead (Snake
Charmer's `entryMaps.mjs`, Crushword's `typing.mjs`), which the engine imports and
`node:test` requires; no test loads `engine.js`.

`init()` has eight sections in this order, each opened by a `// ── <name> ──` banner:
*Data & constants*, *Geometry & index maps*, *State*, *Logic functions*, *Build SVG*,
*Header & clues*, *Event wiring*, *Restore & focus*. It declares, builds and wires, and
calls no logic function until *Restore & focus*. That is why a logic function may read a
`const` declared below it (the SVG layers, `rebusBtn`): it first runs after that `const`
exists. Don't "fix" a temporal-dead-zone error with `?.`; it means a call moved too early.

Board cells are `id="cell-{n}"` and their letters `id="letter-{n}"`; cell clicks read `n`
back from the id. `n` is 1-based in Spiral (cell number), Marching Bands and Crushword
(row-major over the whole grid, so the center square and blocks use up numbers), and
0-based in Snake Charmer (ring position).

`PUZZLE_DATA` carries no entry→cell mapping: each engine derives it at init from the entry
lengths and its traversal rule.

## syncUI() contract

`syncUI()` is the one function that turns game state into DOM. Event handlers change
state (letters, cursor, direction) and then call `syncUI()`, directly or through
`focusCell()`; they never set visual state themselves. It covers the active entry, cell
and composing cell, the active clue, the help rows' disabled state, and the solve state
(the done-wrong banner, and telling the completion latch whether the board is solved).
The active-entry highlight covers every cell of the entry whatever its correctness: it
shows where the cursor is, not what is left to solve.

Marching Bands scrolls the active clue into view on the desktop, and only when it
changes, so typing within a clue never moves the page. Spiral and Snake Charmer don't
scroll their clue lists. Pinned by "the clue list scrolls only when the active clue
changes" in `e2e/shared.spec.js`.

Crushword's desktop clue lists each scroll in their own pane, and each pane follows one
item (its active clue, else its crossing clue) to its middle, again only when that item
changes, so typing within a cell moves neither pane. That holds in the fill layout only; in
the stacked fallback nothing follows the active clue, since carrying the grid off screen
while the solver types is worse than a clue out of view. Acting on the grid there (a click
on a clue, a key) scrolls it back into view if it had scrolled away. Pinned by "typing within a cell
never scrolls a pane" in `e2e/crushword.spec.js`.

For the same reason, Crushword's PageUp, PageDown and arrow keys at the grid's edge do
nothing in the fill layout, where the page doesn't move while solving; in the stacked
fallback they scroll the page, as they do in the other tools.

## Focus management

Keys are handled by one `document`-level `keydown` listener, so they work after a click
anywhere on the page. Letters arrive through the focused `#hidden-input`. The active cell
is assigned only inside `focusCell`, which is therefore the one place that commits a
composing cell the cursor leaves; assigning it anywhere else silently breaks rebus commit.
A control used with a pointer returns focus to the puzzle afterwards; keyboard focus on
the menus and buttons stays where the keyboard put it (see "Escape — leaving the puzzle").

Keys the puzzle doesn't use are left alone, except that the hidden input suppresses the
page's own scrolling: ArrowUp, ArrowDown, PageUp and PageDown are forwarded to the page
when they have no puzzle action.

## Backspace semantics

Backspace clears the current cell if it holds content, and the cursor stays. On an empty
cell it steps back to the previous cell and clears that. It never clears and moves at
once. While a cell composes, Backspace deletes its last letter; on an empty composing cell
it steps back as above, committing on the way. A locked cell counts as empty: Backspace
steps past it without clearing it. Crushword: see "Crushword — explicit-commit typing".

## Space semantics

Space clears the current cell and advances to the next cell in the current direction,
committing a composing cell. A locked cell is left intact. Crushword: see "Crushword —
explicit-commit typing".

## Period key — direction/mode toggle

`.` switches between the two directions without moving the cursor, as a click on the
active cell or the toggle does: Marching Bands' row and band modes, Snake Charmer's two
loops, Spiral's inward and outward, Crushword's across and down. In Crushword it does
nothing on a cell with no entry in the other direction.

A switch made with the mouse also shows, once, a tip that `.` does it too; when it shows
and where is `setupSwitchTip`'s (`shared/engine-chrome.mjs`). Each engine reports its own
switches to it: `atCell` after a click on the active cell that switched, `atToggle` after
a click on the other toggle option, and `noteKey` after a `.` that switched, which stops
the tip on every puzzle (see "localStorage key format"). Pinned by "a second click on the
active cell shows the period tip at the cell, once" in `e2e/shared.spec.js`.

## Tab / Shift+Tab entry navigation

Tab goes to the next entry in the current direction that still has an empty cell, and
lands on its first empty cell; Shift+Tab does the same backward. Both wrap and skip
complete entries, as crossword apps do. A composing cell counts as empty. When every
entry is complete, Tab steps plainly to the next entry's first cell. A solved board still
takes Tab and Shift+Tab, so the solver can read through the clues; it ignores every other
key. The phone's ‹ › press these keys.

- **Crushword:** the across entries then the down entries form one loop, so Tab from the
  last across entry goes to the first down entry and switches the direction.
- **Spiral:** Tab never switches between inward and outward. They read the same cells in
  opposite orders, so hopping across would feel like a jump rather than the next clue.
- **Snake Charmer:** entries are numbered across both loops, and Tab moves to the next
  whichever loop it is in.
- **Marching Bands:** Tab moves by row or band, not by entry (see "Active-clue banner").

## Escape — leaving the puzzle

Tab moves within the puzzle, so Escape is the keyboard route out of it. A bare Escape
while the puzzle holds focus focuses the help button (the options button in a hashed
build, which has no help menu); from there native Tab and Shift+Tab move through help,
options and shortcuts. Escape on any other page control returns focus to the puzzle.
Escape inside a dialog or an open menu belongs to that dialog or menu. Each engine's
shortcuts table ends with the row `Esc` / "Go to the menus". Pinned in
`e2e/shared.spec.js`, "Keyboard route to the menus".

## Clue click navigation

A click on a clue puts the cursor on the first cell of its entry, switching the direction
to the clue's. A click on a link inside a clue only follows the link. Marching Bands'
clues are grouped by row and band, and a click anywhere in the group goes to the first
cell of that row or band (see "Active-clue banner").

## Enter / Rebus button — rebus entry

Snake Charmer, Spiral and Marching Bands. Enter and the Rebus button open multi-letter
entry on the active cell. Letters then append to it and the cursor holds; a second press
commits it, and the cursor stays. Any cursor move commits it too. Opening keeps the
cell's content, so `H` grows into `HAR` without retyping.

**The spoiler rule:** nothing in the UI varies with a cell's capacity, so nothing reveals
which cells are rebus cells. Enter is always bound, and the Rebus button is never hidden,
identical in hashed and plain builds, and disabled only where composition is refused
whatever the capacity (a locked cell, a solved board). A filled cell never triggers
auto-advance, for the same reason.

### Composition is saved state

The composing cell is part of the save. Without it, a reload would commit a half-typed
prefix as if the solver had entered it. On restore, each engine puts the cursor back on
the composing cell explicitly, since `focusCell` would otherwise commit it on the way to
the default cell.

### Known limitation (touch)

Letters typed into a composing cell arrive through the IME, and the composer appends the
whole input value. An IME that re-sends its whole buffer on each `input` event would
repeat letters. Unverified: Playwright's device emulation uses a desktop input stack, so
it needs a real device.

## Crushword — explicit-commit typing

Crushword has no rebus mode and no Rebus button. Every cell composes from its first
keystroke, and typing never advances the cursor except when the cursor reaches
`maxCellLetters`. That cap is puzzle-wide, so reaching it reveals nothing about any one
cell. Everything else that leaves a cell (Tab, Space, Enter, a click, an arrow crossing a
cell edge) commits it, and Check cell commits it first, so a just-typed letter can be
checked without moving off it.

Without auto-advance a keystroke on a cell holding a letter can only mean "add to it", so
no explicit rebus gesture is needed. A cursor position inside the cell decides where edits
land: typing inserts there (and overwrites once the cell is full), Backspace deletes the
letter before it, and ←/→ step through a cell's letters before crossing into the next.
Space keeps what is before the cursor, drops what is after it, and advances to the front
of the next cell; Enter keeps everything and lands at the next cell's end. A `.cell-caret`
marks the cursor in place of the dashed composing outline.

The last cell typed stays composing, so a board finished short of `maxCellLetters` counts
as complete only once something commits it. Accepted as a cost of the model.

## Active-clue banner

A tool shows a fixed `#active-clue-bar` with the active cell's clues **when, and only
when, those clues are known from the cell alone**, that is, when entry boundaries are
given rather than solved for. Snake Charmer, Spiral and Crushword qualify, though
Crushword shows the bar only in the phone layout: on the desktop its crossings panel
already shows the active clue and every crossing clue, so a bar would repeat it. Marching Bands
does not: finding where one entry ends and the next begins is its puzzle, so a banner
would have to guess. The same rule shapes everything else Marching Bands does differently:

- no `.filled` clues (see "Filled clues"), and no clue item ever marked `.correct`;
- Tab moves by row or band, and clue items are grouped under a `.clue-group` per row or
  band, which is what highlights and takes clicks;
- the help menu's clue rows act on the active row or band and say so ("Check row");
- the phone's clue list has no cell rows.

The bar's second row shows the entry crossing the active cell, and hides when there is
none (Crushword on a cell with no crossing entry; Snake Charmer where both loops are one
entry). Tools whose two rows could be confused label them (Spiral's In/Out, Crushword's
Across/Down).

### Marching Bands on a phone

On a touch-first device the bar row holds a clue navigator: `Row 3` or `Band C`,
`clue 2 of 3`, and one clue of that row or band, with ‹ › to cycle through them. It reveals
nothing because it never moves on its own: it shows the first clue whenever the active row
or band changes, and moves only on ‹ › or a tap on a clue in the list.

## Filled clues

A clue item carries `.filled` while every cell of its entry holds content, right or wrong,
like a solver crossing a clue off by hand. It is not `.correct`, which marks a solved
board. It is derived in `syncUI()` from cell content, never saved. A composing cell is not
filled, so in Crushword a clue gains `.filled` only when its last cell commits (pinned in
`e2e/crushword.spec.js`). Themes opt in to styling it through `--theme-clue-filled-*`.

## Answer checking

A plain build ships its letters and checks the board cell by cell; a hashed build ships
only the board hash. Both go through one checker, so anything the solver sees (when
feedback appears, what gets marked, what banner shows) is the same in both modes.

When the last cell is filled, the board is checked: a correct board is painted solved
(`.solved` on the board SVG, `.correct` on clue items in the tools that mark them; no cell
is marked) and the congratulations dialog opens once; a wrong one shows the done-wrong
banner. Nothing is checked automatically before every cell is filled, and nothing per
entry; in a plain build the help menu's Check gives feedback on request.

### Hashed-mode feedback timing

On each keystroke the engine first advances the cursor (`focusCell`, which syncs the UI),
then checks the board. The winning keystroke therefore syncs twice; don't coalesce them,
or every other keystroke leaves the highlight stale.

### Filled excludes composing cells

A cell counts as filled only when it holds content and is not composing. Otherwise a
half-typed rebus that happens to be a correct prefix (`HA` of `HAR`) would complete the
board, fire the one-time completion event, and never fire it when the solver finishes.
Every path that checks or marks a cell takes only a filled cell, or ends the composition
first.

### Cell marks

A cell carries at most one mark, `data-mark` on the cell and its letter:

- `checked`: confirmed right by Check. Its letter takes the checked color.
- `revealed`: confirmed right by Reveal, whether Reveal wrote the answer or found it
  already there. A flag across the cell's top-right corner.
- `wrong`: a Check found it wrong. A slash across the cell. It stays until the cell is
  edited, and Check refuses the cell until then.

A mark never changes the cell's fill, which belongs to the cursor and highlights. Solving
marks no cell, so a clean solve leaves every cell unmarked and a solve with help keeps
exactly the marks the help made. Print hides the marks.

### Locked cells

A `checked` or `revealed` cell is locked: keys move the cursor as usual but leave its
content alone, it never composes, and only Clear and Play again empty it. Crushword drops
a letter typed on a locked cell and steps to the next cell, since its cursor would
otherwise hold there.

## Clear and Play again

Clear (behind the options menu, with a second click to confirm) and Play again reset the
board in memory, with no reload. Each engine's reset empties every letter through its one
letter writer, clears every mark and `.correct`, empties the flash layer, and returns the
direction or mode to its initial value. It also clears the save, the timer, the
completion latch and the help record. The cursor then lands on the tool's initial cell.

## Help menu and help record

A plain build has a help menu (the life-ring button beside the options menu) with Check
and Reveal for the cell, the clue and the puzzle. Reveal puzzle asks for a second click
first, as Clear does. A hashed build has no help menu, since it has no answers. The rows
are not keys on the phone's drawn keyboard, where a stray tap beside Next cell could check
a cell. Every row is disabled on a solved board.

The help record counts Checks and Reveals separately. A Check counts once if any cell it
covered could be checked, right or wrong; each Reveal counts once. The record is part of
the attempt: it is saved, cleared with the board, and reported as `checks` and `reveals`
on the completion event. It never enters the board string, so it cannot change
`boardHash`. A revealed finish still fires the completion event.

## Cell styles

A circle (today's only cell style) is listed on every entry that covers the cell, so two
entries can name the same cell. An engine draws at most one decoration per cell and
style; a doubled circle would paint bolder. Pinned by "no cell carries two circles" in
`e2e/shared.spec.js`.

## Phone layout and drawn keyboard

A touch-first device (`(hover: none) and (pointer: coarse)`, so tablets too) gets the
phone solving view: one screen holding the title bar with the menus, the grid (or, on the
Clues screen, the clue list in its place), the active clue between ‹ › and a drawn
keyboard. The phone's own keyboard never opens, and the page never scrolls itself.
Anywhere else the page is unchanged. A short landscape screen rearranges the same view
into columns; "Keyboard on the left" in the options menu swaps them.

Drawn keys arrive as real keys would: a letter as the hidden input's `input` event,
anything a hardware keyboard also has as a `keydown`, so no tool's typing rules have a
second copy. Each tool has its own bottom row:

| Tool | Bottom row |
|---|---|
| Snake Charmer | Prev cell · Rebus · Loop ⇄ · Next cell |
| Spiral | Prev cell · Rebus · In ⇄ Out · Next cell |
| Marching Bands | Prev cell · Rebus · Row ⇄ Band · Next cell |
| Crushword | Prev cell · ◂ · ▾ · ▴ · ▸ · Next cell |

Prev cell and Next cell step along the active entry, row or band. They are words rather
than arrows because a ring, a spiral or a band's corner doesn't run left to right.
Crushword's grid is spatial, so it gets four arrows that act as the hardware arrows do,
and no switch key: a tap on the active cell or the clue switches direction.

The Clues screen of Crushword, Spiral and Snake Charmer shows a row of cells under each
clue, filled as the grid is, where a tap puts the cursor. Marching Bands' list is plain,
since cell rows would reveal its entry boundaries.

The grid zooms and pans (pinch, drag, double-tap), and follows the cursor while zoomed.
Each engine's `syncUI` calls `phone.follow(...)` with the active entry's cells and the
cursor.

## Print-mode state erasure

Printing always gives the blank puzzle: no letters, marks, highlights or clue styling,
whatever the solve state, and none of the interaction chrome. The shared print reset
covers every cell state and `.clue-item` state, so a tool's `print.css` adds layout,
plus the `.clue-group` resets Marching Bands needs.

## Completion event

On each change of the board from unsolved to solved, every engine dispatches
`varietypack:complete` on `.puzzle-main` (bubbling, composed) and posts a message to
`window.parent`.

| `detail` field | Type | Meaning |
|---|---|---|
| `boardHash` | string | SHA-256 of the board string (below); present in plain and hashed builds |
| `kind` | string | `snake-charmer`, `spiral`, `marching-bands` or `crushword` |
| `title` | string | The puzzle's title |
| `date` | string, number or absent | The puzzle's date |
| `timeMs` | number | Active solve time (below) |
| `solution` | string | The board string; `sha256hex(solution) === boardHash` |
| `checks`, `reveals` | number | The help record. A hashed page has no help menu, but shares its save with the plain build of the same puzzle, so it can report counts (and show marks) made there |

The posted message is `{ type: 'varietypack:complete', ...detail }` **without**
`solution`, to targetOrigin `'*'`. A build with `--embed-origin` posts it **with**
`solution` to that one origin instead. Either way exactly one message is posted, so a host
never counts a solve twice. Only a hashed build's solution proves anything: a plain build
ships its letters.

### The board string

Each cell's normalized content, joined with `.` (`CELL_DELIM`), over the cells that exist:

| Tool | Cell order |
|---|---|
| Snake Charmer | Ring positions in traversal order |
| Spiral | Inward, cells 1 → N |
| Marching Bands | Row-major, skipping the center square |
| Crushword | Row-major, skipping blocks |

The delimiter is what keeps a wrong board `ha|ro` from hashing like the right `har|o`.

### Timing and emission

`timeMs` is active solve time: it starts at the first letter, pauses while the tab is
hidden, stops at the solve, and accumulates across sessions through the save. Idle time
with the tab visible counts. The event fires once per solve. Restoring a solved puzzle
doesn't fire it again; Clear and Play again re-arm it.

## Embedding — auto-sizing

A framed page posts `{ type: 'varietypack:resize', height }` to its parent, to `'*'`,
whenever its height changes. `height` is the page's own box height, so it can shrink.
A page whose layout fills its view, the phone layout or Crushword's desktop fill layout,
adds `fill: true`: its view is one screen of the frame high, so the host should make the
frame one screen (`100svh`) high instead. Such a layout publishes that as the custom
property `--fills-view: 1`, which `setupEmbedResize` reads, so CSS decides and script
follows. A message is posted when the height or `fill` changes, since a resize can switch
layouts at the same height.

A layout that fills its view must switch on width only, never height: a framed page's
height comes from its own messages, so a height condition can loop. The reasoning is in
the comment beside the media query in `crushword/src/template/base.css`.

## localStorage key format

| Key | Holds |
|---|---|
| `vp:sc:<boardHash>`, `vp:sp:…`, `vp:mb:…`, `vp:cw:…` | One puzzle's progress (Snake Charmer, Spiral, Marching Bands, Crushword) |
| `vp:pref:listWrap`, `vp:pref:keyboardLeft` | A solver's phone preferences, for every puzzle |
| `vp:pref:usedSwitchKey` | That the solver has switched with `.`, so no puzzle shows the switch tip again |

A republished puzzle with new answers has a new hash, so it starts fresh. The tool prefix
keeps two formats with the same answers apart. Clear empties a puzzle's key and leaves the
preferences.

The save is `{ v, letters, marks, activeMs, composing, help }`: letters and marks by cell
id, the active solve time, the composing cell or null, and the help record. Anything a
solved board shows beyond the marks is re-derived on restore, not saved. Restore ignores
a save of another version, and a save naming a cell this board lacks (two boards can share
a hash).

### Save timing

The engines save at mutation sites only (a typed letter, Backspace, Space, a committed
composition, a Check that ran, a Reveal after its completion path) and when the tab is
hidden, never from `syncUI()`,
which runs on every focus change.
