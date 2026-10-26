# Snap! Accessibility: Audit, Roadmap, and Parallel DOM Contract

*Baseline audited: upstream Snap! v12.0.6 (commit `3a2fe919`), August 2026.*

This document is the working plan for making Snap! fully screen reader
compatible using a **parallel DOM** and providing **full keyboard support**
for the IDE. It records what exists today, what remains, the phased plan,
and the DOM/ARIA contract that the automated tests in `tests/` assert
against.

---

## 1. Current state (audit)

### 1.1 Architecture

The entire IDE is painted onto a single `<canvas id="world" tabindex="1">`
(`snap.html:78`) by morphic.js. Nothing the user sees — palette, blocks,
scripts, stage, sprites, menus, dialogs — exists in the DOM. As far as a
browser's accessibility tree is concerned, Snap! is an empty page with an
unlabeled canvas.

Keyboard input is captured by a hidden, off-screen
`<textarea id="morphic_keyboard">` created in
`WorldMorph.prototype.initKeyboardHandler` (`src/morphic.js:12337`). It is
0×0 px, `z-index: -1`, autofocused, and routes `keydown` / `keypress` /
`keyup` / `input` events to `world.keyboardFocus` — Morphic's *internal*
focus concept, invisible to the browser. A screen reader user who tabs into
the page lands on an unnamed, empty edit field and hears nothing useful.

### 1.2 What already exists (and is worth preserving/building on)

All of the following operate entirely inside the canvas via
`world.keyboardFocus`:

| Capability | Where | Notes |
|---|---|---|
| Text editing | `CursorMorph` (`src/morphic.js:5720`) | Binds the hidden textarea for composition/IME; full cursor/selection support in any string field. |
| Menu keyboard navigation | `src/morphic.js:8412` ("MenuMorph keyboard accessibility") | Arrows / Enter / Esc / type-to-select once a menu is open. No keyboard way to *open* most menus. |
| Dialog keyboard handling | `DialogBoxMorph.prototype.processKeyDown` (`src/widgets.js:2901`) | Tab cycles fields/buttons, Enter accepts, Esc cancels. Internal only — not a real DOM focus trap. |
| Keyboard script editing | `ScriptFocusMorph` (`src/blocks.js`), toggled via `ScriptsMorph.prototype.toggleKeyboardEntry` (`src/blocks.js:9714`) and the scripts-pane toolbar keyboard button | Opt-in ("Keyboard editing" in the accessibility settings menu, `IDE_Morph.prototype.accessibilityMenu`, `src/gui.js:8190`). Navigate scripts with arrows, type to search/insert blocks, run with Enter. Draws a visible focus indicator on canvas. |
| Low-vision aids | `accessibilityMenu` (`src/gui.js:8190`) | Magnification (whole-world zoom), block zoom, block fade, afterglow, stage scaling. |
| Audio feedback | click sound on block snap | Useful non-visual cue; opt-in. |

### 1.3 What is absent

- **No ARIA anywhere.** Zero roles, labels, landmarks, or live regions in
  the whole codebase. The accessibility tree contains only the unlabeled
  canvas and the unlabeled hidden textarea.
- **No parallel DOM.** Not started — this fork is currently identical to
  upstream v12.0.6.
- **No browser-level focus model.** DOM focus never moves; there is nothing
  focusable except the canvas and the hidden textarea, so screen readers
  have no focus to follow and no virtual-cursor content to read.
- **Keyboard cannot reach most of the IDE.** No keyboard access to: the top
  toolbar/menu bar, palette category selection, palette block browsing,
  picking up a palette block (keyboard script editing can *search* for
  blocks, which partly substitutes), the sprite corral, the
  Scripts/Costumes/Sounds tabs, stage watchers, splitter resizing, or
  opening context menus (menus are keyboard-navigable only *after* being
  opened with the mouse).
- **No announcements.** Nothing tells a non-visual user that a block
  snapped, a script ran, an error ballooned, a project saved/loaded.
- **`snap.html` hygiene**: no `lang` attribute; hidden keyboard textarea
  has no accessible name; the world canvas used a positive `tabindex="1"`
  (an anti-pattern that hijacks tab order). (All fixed in this branch as
  seed changes.) An axe-core scan of the baseline additionally flags the
  `region` rule — no page content is inside a landmark — which the Phase 1
  parallel DOM resolves; until then it is allowlisted in
  `tests/specs/70-axe.spec.js`.

---

## 2. Approach: the parallel DOM

A hidden-but-real DOM subtree (`#snap-a11y`) that mirrors the semantic
structure of the Morphic world, overlaid on the canvas:

1. **Morphic remains the single source of truth.** The parallel DOM is a
   *projection*: morphs describe themselves (role, name, states, bounds)
   and a sync layer creates/updates/destroys matching elements.
2. **Geometry-synced overlay, not `display:none`.** Elements are absolutely
   positioned over their morphs' canvas bounds (transparent, no painting).
   This makes VoiceOver/TalkBack touch exploration, focus rings, and
   magnifier tracking line up with what sighted users see, and lets
   assistive-tech "clicks" on elements be forwarded to Morphic mouse
   handlers.
3. **Two-way focus sync.** When Morphic's `keyboardFocus` changes, the
   matching DOM element receives real `focus()`; when AT moves DOM focus,
   Morphic's focus follows. One focus, two representations.
4. **No separate "accessibility mode" if we can afford it.** The overlay
   should be cheap enough (sync on layout changes, not per frame) to be
   always on. If profiling says otherwise, it becomes a setting that
   defaults on when a screen reader is likely (e.g., first Tab press).
5. **Canvas gets `aria-hidden="true"`** once the overlay carries the
   semantics, so nothing is double-announced.

### 2.1 Parallel DOM contract (v0)

This is the contract the tests in `tests/specs/` assert. Change it here
first, then in tests, then in implementation.

| What | Selector / ARIA |
|---|---|
| Overlay root | `div#snap-a11y[aria-label="Snap!"]`, positioned over the world canvas |
| Polite announcer | `#snap-a11y-announcer[aria-live="polite"]` |
| Assertive announcer | `#snap-a11y-alert[role="alert"]` |
| Top toolbar / menu bar | `[role="toolbar"][aria-label="Snap! toolbar"]`; each control a `button` with an accessible name (logo/file/settings menus: `aria-haspopup="menu"`) |
| Block category selector | `[role="tablist"][aria-label="Block categories"]` with one `[role="tab"]` per category (`aria-selected` on the current one) |
| Palette | `[role="listbox"][aria-label="Block palette"]`; each block template an `[role="option"]` named with its speakable label (e.g. "move 10 steps"); palette buttons ("Make a variable") are plain named `button`s in the same region |
| Scripts pane | `[role="region"][aria-label^="Scripts"]` containing `[role="tree"][aria-label^="Scripts for"]`; each top-level script a `[role="treeitem"]`, nested blocks as nested tree items, named by speakable label |
| Stage | `[role="region"][aria-label="Stage"]` |
| Editor view tabs | `[role="tablist"][aria-label="Editor views"]` with tabs Scripts / Costumes / Sounds |
| Sprite corral | `[role="tablist"][aria-label="Sprites"]`, one `[role="tab"]` per sprite plus the stage |
| Dialogs | `[role="dialog"][aria-modal="true"]` labeled by the dialog title (static body text as its accessible description); real DOM focus trap (Tab / Shift+Tab cycle the dialog's own stops, wrapping); Escape cancels; focus restored to the opener on close. Inside: buttons are named `button`s (source / mode toggles carry `aria-pressed`), toggles are `checkbox` / `radio`, input fields are `textbox`es (editing starts on keyboard focus; the hidden textarea takes the field's name while editing), notes are multi-line `textbox`es (`aria-readonly` when not editable). Open / Save Project: `textbox` "Project name" / "Search projects", `listbox` "Projects", `textbox` "Project notes", source buttons Cloud / Examples / Computer. Import library: `textbox` "Search libraries", `listbox` "Libraries", `textbox` "Library description" |
| Lists in dialogs (`ListMorph`) | `[role="listbox"]` (one Tab stop) with `[role="option"]` children (`aria-selected`), the current one in `aria-activedescendant`; Up / Down / Home / End move the selection (selecting exactly like a click), Enter is the list's double-click action (the dialog's default button) |
| Menus (incl. context menus) | `[role="menu"]` with `[role="menuitem"]` children, named |

**Speakable block labels**: derived from the block spec with input values
inlined and symbols verbalized — `"move %n steps"` with input `10` →
`"move 10 steps"`; `%greenflag` → `"green flag"`. Localized through
`SnapTranslator` like every other label.

---

## 3. Large tasks remaining

Everything below remains; the parallel DOM effort has not started.

1. **Morphic parallel DOM infrastructure.** The sync layer in morphic.js:
   morph → element lifecycle (add/remove/reorder), throttled geometry sync,
   an extension API on `Morph` (e.g. `accessibleRole()`,
   `accessibleName()`, `accessibleStates()`, opt-out for purely decorative
   morphs), and forwarding of AT-originated events back into Morphic. This
   is the foundation everything else stands on.
2. **Semantic mapping of the IDE.** Implement the contract in §2.1 for
   IDE_Morph's regions: toolbar, categories, palette, scripts, stage,
   corral, tabs, dialogs, menus, watchers.
3. **Accessible names everywhere.** Speakable labels for blocks (spec →
   sentence, recursively including nested reporters), names for every
   icon-only button (toolbar symbols, corral buttons, scripts toolbar),
   localization plumbing.
4. **Full-IDE keyboard support.** A global focus/navigation model: Tab (or
   F6) cycles the major regions; arrows navigate within a region (category
   tabs, palette blocks, corral sprites, menu bar); Enter/Space activates;
   a keyboard command picks up the focused palette block and drops into the
   scripts pane (extending `ScriptFocusMorph`); Shift+F10 / context-menu
   key opens the focused element's context menu; keyboard-driven splitter
   resizing; make "Keyboard editing" default-on; visible focus indicator
   painted on canvas for whatever region has focus (today only
   `ScriptFocusMorph` draws one).
5. **Focus management & dialogs.** Two-way DOM ↔ `keyboardFocus` sync;
   modal dialogs trap and restore real DOM focus; menus move focus in and
   restore it on close.
6. **Live announcements.** Route IDE events through the announcers:
   block picked up / dropped / snapped (what, and where relative to other
   blocks), script started/stopped, runtime errors, palette category
   changed, sprite selected, project saved/loaded, zoom changed.
7. **Text editing exposure.** Give `CursorMorph`'s bound textarea a name,
   role, and correct value/selection exposure so editing a block input or
   the project name is announced properly.
8. **Stage content accessibility (later).** Speakable descriptions of
   sprites/stage state, watcher values as text, possibly sonification.
   Separate track; the IDE chrome comes first.
9. **Performance.** Keep overlay sync off the 60 FPS `doOneCycle` hot path
   (sync on layout/structure changes only); profile with large projects.
10. **Testing & validation.** Grow the harness in `tests/` (see §5),
    wire it into CI, and run a recurring manual screen reader protocol.
11. **Upstreaming strategy.** Keep morphic.js changes additive and behind a
    small API so the work can be proposed upstream to jmoenig/Snap in
    reviewable pieces.

## 4. Plan of action (phases)

Each phase "turns on" a set of currently-skipped spec tests
(`test.fixme` → active) as its acceptance criteria.

- **Phase 0 — Baseline & harness (this branch).** Audit, this document,
  Playwright + axe harness, document-level seed fixes (`lang`, named
  keyboard textarea). Tests: `00-smoke`, `10-document`, `70-axe` pass.
- **Phase 1 — Overlay core + landmarks.** Morphic sync layer; static
  regions and names for toolbar, categories, palette, stage, corral, tabs;
  canvas `aria-hidden`. Activates `20-landmarks`, most of `30-labels`.
- **Phase 2 — Focus & region keyboard navigation.** Two-way focus sync;
  Tab/F6 between regions; arrows within categories/palette/corral/toolbar;
  Enter/Space activation; visible focus painting. Activates `40-focus`.
- **Phase 3 — Blocks & scripts.** Speakable block labels; palette options;
  scripts tree; keyboard pick-up/drop end-to-end; context menus via
  keyboard; keyboard editing default-on. Activates `50-keyboard`, rest of
  `30-labels`, `60-aria-snapshot`.
- **Phase 4 — Dialogs, menus, announcements.** ARIA dialogs with focus
  traps, ARIA menus, live-region announcements for the events in §3.6.
- **Phase 5 — Real-user validation & polish.** Screen reader user testing
  (NVDA, JAWS, VoiceOver), performance on large projects, fix rounds,
  begin upstream conversation.

## 5. Testing strategy

Automated tests live in `tests/` (Playwright + `@axe-core/playwright`);
see `tests/README.md` for how to run them. What we can and cannot automate:

- **Automatable now:** document semantics; presence/shape of the parallel
  DOM (roles, labels, states via `getByRole` and ARIA snapshots); DOM focus
  movement and restoration; keyboard-driven behavior (assert Morphic state
  via `page.evaluate` into `world`); full accessibility-tree inspection via
  CDP; axe-core rule scans.
- **Not automatable:** actual screen reader utterances. Proxy: if the
  accessibility tree is right (role + name + state + focus), NVDA/VoiceOver
  output is nearly always right. Verify with a manual protocol per phase:
  NVDA + Chrome/Firefox (Windows), VoiceOver + Safari (macOS), a
  smoke-pass with Orca (Linux); script: open IDE → identify regions →
  browse palette → build "when green flag clicked, move 10 steps" → run it
  → rename sprite → save, all eyes-free.

## 6. Prior art & references

- **Microsoft MakeCode** — the strongest existing example of a block
  editor with screen reader + full keyboard support (DOM/SVG-based).
- **Blockly keyboard navigation** (Google) — cursor/marker model for
  keyboard block manipulation; good design language for §3.4.
- **ARIA Authoring Practices Guide (APG)** — patterns used in the contract:
  tabs, toolbar, listbox, tree, dialog (modal), menu.
- Snap!'s own `ScriptFocusMorph` — proof that keyboard block editing works
  in Morphic; we extend rather than replace it.
