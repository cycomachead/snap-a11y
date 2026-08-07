# Testing: harness layout, quirks, and patterns

Full usage docs are in `tests/README.md`; this file records the
non-obvious things.

## Running

```sh
cd tests && npm install && npx playwright install chromium && npm test
```

The config self-serves the repo root (`python3 -m http.server`) and
**blocks the service worker** so the working tree is always what's tested.
`tests.html` (repo root) opens the fixture projects manually in a browser.

## The executable-spec pattern

Tests tagged `@spec` assert the parallel DOM contract
(docs/ACCESSIBILITY.md §2.1) but carry `test.fixme()` so they're listed
without failing. Implementing a feature = deleting its `test.fixme()`
lines. Two baseline tests are deliberate canaries that will start failing
the moment the parallel DOM exposes anything (`60-aria-snapshot` "AX tree
exposes almost nothing", `40-focus` "focus starts on the hidden keyboard
handler") — when they break, update them and activate the matching specs.

## Quirks discovered the hard way

- **axe-core**: the default document context throws "No elements found
  for include in page Context" on this page — use
  `new AxeBuilder({ page }).include('body')`. `<html>`-level rules are
  covered by `10-document.spec.js` instead. Known-broken rules live in an
  explicit allowlist in `70-axe.spec.js` (currently just `region`,
  resolved by Phase 1).
- **Keyboard timing**: `page.keyboard.type()` at full speed loses
  characters in keyboard-entry mode because the block-search field takes
  a world cycle to grab focus. Use `{ delay: 100 }` and `expect.poll`.
  (See `.agents/architecture.md` on the 60 fps world loop.)
- **Reaching Morphic state**: assert application state via
  `page.evaluate` into `world` (helper `snapEval` in
  `tests/helpers/snap.js`); assert semantics via `getByRole` / ARIA
  snapshots; inspect the raw Chromium AX tree via the CDP helper
  `getAXTree`.
- **Readiness**: don't rely on `load` events — wait for
  `world.children[0].palette.contents.children.length > 0` (helper
  `loadSnap`), or `getProjectName()` when opening a fixture.

## Fixtures (`tests/fixtures/`)

Three real projects of increasing size, opened via
`snap.html#open:tests/fixtures/<file>`:

| File | Project name | Size | Use |
|---|---|---|---|
| `Snap_v11_Map_Colors.xml` | Snap! v11 Map Colors | 24 KB | quick non-empty project; known sprites "Map Colors", "Report Scripts" |
| `manual_cover_scripts.xml` | manual cover scripts | 162 KB | medium project |
| `CS10_SP22_Final_Main.xml` | CS10 SP22 Final Main | 4.2 MB | stress/perf; loading takes tens of seconds — tests use a 90 s timeout |

`05-fixtures.spec.js` keeps all three loading successfully and keeps
`tests.html` itself accessible.
