# Testing

Tests use `node:test` and `node:assert`, with no external test framework. Features
are written test-first. Any change on the build path must keep
`studio/test/parity.test.js` green (see [ARCHITECTURE.md](ARCHITECTURE.md)).

## Running tests

Run everything from the repo root with `npm test`. While iterating, run a scoped
subset, which is far faster:

```fish
node --test snake-charmer/test/*.test.js   # one tool
node --test shared/test/*.test.js          # shared library
```

Reserve the full `npm test` for the final check before committing.

`npm run lint` runs ESLint (`eslint.config.js`: recommended rules, with CommonJS,
`.mjs` page modules, engines and studio UI configured as what they are). It is
separate from `npm test`; run it before committing. A leading underscore marks a
deliberately unused binding. It catches an undefined name or stale import that
only e2e would otherwise reach. Comment width in JS is its `max-len`; CSS and
shell comments, and spelling everywhere, are checked by
`test/commentStyle.test.js`.

## What to run when

The full cross-browser suite is slow even sharded in CI, so it runs there and stays out
of the edit loop. Run the cheapest layer that can catch what you changed:

| Change | Run | Cost |
|---|---|---|
| Any, while editing | `npm run lint`; `node --test <tool>/test/*.test.js` | seconds |
| Any, before committing | `npm run lint`; `npm test` | seconds |
| Behavior in one tool or its studio editor | `npm run test:e2e:tool -- <tool>` | a short wait |
| `shared/` or common engine code | `npm run test:e2e:quick` (all of Chromium) | the slowest local option |
| Pointer, focus, soft keyboard, layout or CSS | `npm run test:e2e:tool -- <tool> --project=webkit`, then `--project=firefox` | a short wait each |
| Documentation only | `npm test` | seconds |

Then push and keep working: CI runs the full matrix as parallel jobs (Chromium,
WebKit, Firefox, and the phone projects), and a Linux-only failure shows up there.
CI skips the e2e jobs for a change that touches only documentation; the `test` job
still runs, because `test/commentStyle.test.js` reads the docs.

`npm run test:e2e:tool` runs the tool's own specs plus its share of
`e2e/shared.spec.js` (most of the desktop tests, run once per tool with the title
prefixed `[<tool>]`). It passes other Playwright flags through.

## End-to-end tests

`npm test` does not run Playwright. E2E is the separate `npm run test:e2e`. The
builder-to-engine `boardHash` preimage is covered *only* there: each tool's e2e
hashes the `detail.solution` the page emits and compares it with the
`detail.boardHash` it emits. Any change touching a prepare step's board string or
an engine's board string (`makeBoardChecker`'s `getSolution()`) must run both
suites, because a green `npm test` is not evidence for those.

E2E runs in Chromium, WebKit *and* Firefox, so a first run needs
`npx playwright install chromium webkit firefox`. Scope a run with `--project=chromium`
while iterating, but don't conclude from it alone on anything touching pointer,
focus or soft-keyboard behavior: WebKit is not redundant (see
`playwright.config.js`). Use `tap()` (with `test.use({ hasTouch: true })`), not
`click()`, to exercise touch. `click()` papers over the difference even under
WebKit.

**Phone layouts.** The `mobile-webkit` and `mobile-chromium` projects run only
`e2e/mobile.spec.js` and `e2e/phone.spec.js` (the phone solving view's behavior,
which only a touch-first device gets). They check layout properties under real
phone descriptors, and known breakage is recorded as `test.fail()` entries in
the `KNOWN_FAILURES` table in `e2e/mobile.spec.js`; delete an entry when
Playwright reports it "expected to fail, but passed". To look at phone layouts
while working, run `npm run capture:mobile [-- <yaml-or-dir>...]` and open the
PNGs it prints. Neither reaches a real soft keyboard or IME (see CROSS_TOOL_SPEC
→ "Known limitation (touch)"), and Playwright's WebKit is not iOS Safari.

**Real-device checks.** Build the pages into a scratch directory and serve it on
the LAN with `python3 -m http.server 8765 --bind <LAN IP> --directory <dir>`.
Plain `http://` on a LAN address isn't a secure context, so clipboard copy fails
there and only there. E2E runs Firefox only as a desktop project, so check
Firefox on a phone by hand.

## Fixtures

Fixture HTMLs live in `<tool>/test/fixtures/` and are derived from the YAMLs next
to them; the built HTMLs are gitignored. After template changes (`engine.js`,
`index.html`, `*.css`), rebuild from the repo root. `varietypack build` refuses
to overwrite, so pass `-f`:

```fish
node cli.js build <tool>/test/fixtures -f
```

A forgotten rebuild leaves a hand-opened fixture showing old output. E2E isn't
affected: each e2e spec builds its own HTML into a temp directory.

What makes a representative fixture varies too much between formats to have hard
rules, so settle the target properties before writing any YAML: how many fixtures
and their cell counts; the range of entry lengths; the range of clue lengths
(including whether any should wrap to two lines); entries per direction; any cell
styling (such as circles); and whether to include `hashed` or `instructions`
variants.

## Reproducing a CI failure on Linux

CI runs on Linux, where fonts and timing differ from macOS, so a test that passes
locally can fail there. Reproduce it in the Playwright image that matches the
installed version (`npx playwright --version`), copying the repo in without
`node_modules`, which holds macOS binaries:

```fish
docker run --rm -v (pwd):/src:ro mcr.microsoft.com/playwright:v<version>-noble bash -c '
  mkdir /work && cd /src && tar --exclude=node_modules --exclude=.git -cf - . | tar -xf - -C /work
  cd /work && npm ci --silent
  npx playwright test <spec> --project=chromium --repeat-each=20 --workers=1'
```

`--repeat-each` measures a flake's rate. Select tests with `-g "<name>"` rather than
`file:line`: once an edit shifts the line, nothing matches and the run is silent.
Don't run two such containers at once; the CPU load causes timeouts that look like
failures.

## Testing a PR branch in isolation

Fetch the head with `git fetch origin pull/<N>/head:<name>` and add a worktree. A
fresh worktree has no `node_modules`, so tests fail with
`Cannot find module 'js-yaml'`. Run `npm install` in it (Playwright's packages
have no install scripts, so no browsers are downloaded), or symlink the root's
`node_modules` for speed.

## Philosophy

**One home per behavior.** A behavior's home is the lowest layer that implements
it: `shared/test/` for the shared library and build path (`normalize`,
`processEntries`, `buildOneFile`), a tool's own tests for its own logic, a unit
test before an e2e one. Each layer above tests only what it adds, its wiring,
once, never the behavior's cases again: a tool validator doesn't re-run
`validateEntry`'s cases, and a CLI command doesn't re-run `buildOneFile`'s
overwrite check. A home is a code path, not a behavior name: before deleting a
test as covered elsewhere, confirm the surviving test executes the same function
(a dedupe once dropped `--help` coverage for commands that turned out to
hand-roll their own check). When a refactor moves a behavior's home, move its
tests with it and delete the copies left behind.

**Behavioral contracts, not implementation snapshots.** Before writing an
assertion, ask: *would a correct reimplementation break this test?* If yes, it's
testing implementation, not behavior. Test geometry by its properties (cells
share an edge, the ring closes, anchors sit inside their cell, nothing leaves
the SVG; see `snake-charmer/test/shapes.test.js`), not by recomputing the layout
formula, which a correct reimplementation would break and a bug in the formula
would copy.

**Fixture coupling discipline.** Tests that succeed only because a fixture has
specific content are brittle. Prefer minimal constructed puzzles and
formula-computed expectations; reserve real YAML fixtures for integration smoke
tests where exact content isn't the point.

**Every test earns its place.** Name the one-line break a test catches. If
another test catches that break too, this one is dead weight, and if the other
test lives in another file or layer, trace the call path, or make the break,
before believing it. The same check keeps a test off a library's own behavior:
one case proves our use of it (the typographer is on, the replacer is a
function), not one per thing the library does. If a JSON-parsing test already
covers "PUZZLE_DATA is present and valid," a substring check for
`window.PUZZLE_DATA` adds nothing.

**Assert on output only the new behavior can produce.** When changing an
existing validator or prepare step, the old code still runs and often errors on
the same fixture for an unrelated reason, so a loose assertion can pass before
*and* after the change while a sibling test carries the red. Key the assertion
to wording or values the new behavior alone emits (for example
`/cells differ from loop 0/`, where the old message said `letters differ`).

**Test binary behaviors symmetrically.** When behavior has two sides
(hashed/non-hashed, theme A/theme B), test both: assert presence of what should
be there and absence of what shouldn't. Don't test only the non-default path. An
absence assertion means something only if the fixture could produce what it
rules out: "no uncrossed-cell warning" on a grid whose every cell is crossed
passes whatever the code does.

**`engine.js` is browser-only.** No tool covers `engine.js` with `node:test`;
only pure logic helpers (normalize, sha256hex, tool-specific cell and navigation
functions) are exported and tested. Engine behavior is covered by `e2e/`, and
anything it doesn't reach must be verified in a browser by hand.

**An e2e loop over tools follows the code.** Loop a test over the tools
(`e2e/shared.spec.js`) or the studio's kinds only for behavior each one
implements, or wires with arguments of its own. Behavior that lives entirely in
shared code (a dialog, the options menu, the studio's editing hook) runs on one,
provided some per-tool test still exercises each engine's wiring of it.

**A prose safety argument is a test you haven't written.** When a doc or comment
claims a specific code path is what keeps an invariant true ("sealing first is
what stops the repaint re-announcing", which was false; "`latch.solved` makes
every keydown return before composition can open", true but unbacked), write the
test that fails when that path is removed, and confirm it by removing the path
and watching it go red. Such claims read as authoritative and don't grep, so a
drifted one gets reasoned *from* rather than caught. If a claim genuinely can't
be tested, narrow it to the half that can and name the uncovered half. Design
rationale (a tradeoff, a non-obvious mechanism, why a guard is structural rather
than defensive) stays prose; this applies only to assertions that some path makes
something safe.

**Verifying a pure reorder or rename in an engine.** Diff the *sorted,
comment-stripped* statement lines (old versus new). An empty diff proves only
that order changed; a rename-only diff proves just the rename. This is strong
evidence where `node:test` can't reach.
