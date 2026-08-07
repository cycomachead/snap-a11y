# Snap! accessibility test harness

Playwright-based tests for the screen reader / keyboard accessibility work
described in [`docs/ACCESSIBILITY.md`](../docs/ACCESSIBILITY.md). Snap!
renders into a single canvas, so real screen reader *utterances* can't be
automated — instead these tests verify the layers that determine them:

- **Roles & labels** — `getByRole` queries against the parallel DOM
  (`20-landmarks`, `30-labels`).
- **Focus** — where real DOM focus is, how it moves, dialog trapping and
  restoration (`40-focus`).
- **Keyboard behavior** — keystrokes in, Morphic state out, asserted via
  `page.evaluate` into the live `world` (`50-keyboard`).
- **Accessibility tree** — full Chromium AX-tree dumps over CDP and
  Playwright ARIA snapshots (`60-aria-snapshot`, `helpers/snap.js`).
- **WCAG rules** — axe-core scans (`70-axe`).

## Running

```sh
cd tests
npm install
npx playwright install chromium   # one-time browser download
npm test                          # starts a local server automatically
```

The config serves the repository root with `python3 -m http.server` and
blocks Snap!'s service worker so the working tree is always what's tested.

Useful variants:

```sh
npm run test:headed               # watch the browser
npx playwright test 50            # one spec file
npx playwright test --grep @spec  # only the executable-spec tests
npm run report                    # open the HTML report
```

## How the suite is organized

| File | Status | Purpose |
|---|---|---|
| `specs/00-smoke.spec.js` | passing | harness sanity: Snap! boots, world introspectable |
| `specs/10-document.spec.js` | passing | host-page semantics (lang, title, named keyboard textarea) |
| `specs/20-landmarks.spec.js` | `fixme` | Phase 1 spec: overlay root, landmarks, live regions |
| `specs/30-labels.spec.js` | `fixme` | Phases 1/3 spec: accessible names, speakable block labels |
| `specs/40-focus.spec.js` | mixed | baseline focus reality + Phase 2 spec: focus sync, dialogs |
| `specs/50-keyboard.spec.js` | mixed | baseline: today's keyboard script editing; spec: full-IDE keyboard |
| `specs/60-aria-snapshot.spec.js` | mixed | baseline: AX tree is ~empty today; spec: target tree shape |
| `specs/70-axe.spec.js` | passing | WCAG scan with an explicit known-failures allowlist |

**Executable specification pattern:** tests tagged `@spec` assert the
contract in `docs/ACCESSIBILITY.md` §2.1 but are marked `test.fixme()`, so
Playwright lists them without failing the suite. When implementing a
feature, delete the `test.fixme()` line for its tests — they become the
acceptance criteria. Baseline tests (untagged) assert *current* behavior,
including two designed to break the moment the parallel DOM appears, as a
reminder to promote the corresponding specs.

Keep contract changes in this order: `docs/ACCESSIBILITY.md` first, specs
second, implementation third.
