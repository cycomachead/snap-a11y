# Agent notes for snap-a11y

Distilled, hard-won knowledge for AI agents (and humans) working on this
fork. Read these before touching code — each fact here cost a debugging
session or a wrong assumption.

- [`architecture.md`](architecture.md) — how Snap!/Morphic actually works:
  the canvas world, the hidden keyboard textarea, focus, timing.
- [`caching.md`](caching.md) — why your change "doesn't load": the
  `?version=` convention and the service worker cache. **Read this before
  editing anything in `src/`.**
- [`testing.md`](testing.md) — the Playwright harness, its quirks, the
  executable-spec pattern, and the project fixtures.

The accessibility roadmap and the parallel DOM contract live in
[`../docs/ACCESSIBILITY.md`](../docs/ACCESSIBILITY.md). Rule for changing
the contract: update the doc first, the specs in `tests/specs/` second,
the implementation third.

Repo-wide conventions: this fork tracks upstream
[jmoenig/Snap](https://github.com/jmoenig/Snap) (baseline v12.0.6), so
keep changes to `src/` additive and reviewable with upstreaming in mind.
Log notable work in `DEVLOG.md` (this fork's log — upstream history is in
`HISTORY.md`).
