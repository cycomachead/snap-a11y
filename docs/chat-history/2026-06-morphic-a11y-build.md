# Chat history — Morphic a11y prototype build (June–July 2026, manual workspace)

> Exported from `ff35a582-2abd-4934-aaa5-405b72791cae.jsonl` on 2026-08-07.
> Session span: 2026-06-29T21:16:36.328Z → 2026-06-30T23:23:19.368Z.
> User and assistant messages in full; tool calls are shown as
> one-line summaries; tool outputs and thinking are omitted.

## 🧑 Michael

I need to make Snap! + Morphic JS compatible with a Screen Readers / AT.
Morphic is a framework based on Squeak / Smalltalk that renders to Canvas ans minimized the use of the DOM. 
We should still adhere to these principles. 

A a high level:

* Morphic will need a SINGLE GLOBAL `focused_element`
* We will need to be able to tab forward/backward between elements
* Every Morph will need to be able to render to a DOM element which will be invisible/unstyled by usable by the screen reader. 
   * This will be a DOM element and need to set basic aria properties and attributes.
   * Don't worry about getting the API perfect for this first pass, but do expose functionality to set/experiment with other settings
* Consider how OSes / browsers handle this so we can mimic or leverage some funcationality.
* We will need to **sync** status between the parallel DOM and the actual morphic state, regardless of who or what intercepts the keypress or touch event. 
* In Morphic: We will need to draw a focus ring (let's say a bright 2px blue one) around an element when it gets focused via a keyboard, i.e. want to just implement focus-visible semantics. 
* We will start by just making the high level adjustments to morphic
* Then render the DOM for each region of Snap! (Toolbar, palette, scripting area, etc) as landmark regions
* Then we will work on just the tool bar and menus. We will want a menu to work with a screen reader.

**🤖 Claude:**

I'll research this accessibility project thoroughly. Let me start by exploring the codebase structure to understand Morphic and Snap!'s architecture. Let me launch parallel Explore agents.

- 🔧 `Agent` → Explore Morphic core architecture
- 🔧 `Agent` → Explore Snap IDE regions and menus
- 🔧 `Agent` → Explore existing keyboard and DOM code
**🤖 Claude:**

This is a substantial architecture project. I have a thorough map of the codebase now. Let me read the most critical integration points myself and simultaneously launch a Plan agent to design the Morphic-core accessibility layer.

- 🔧 `Agent` → Design Morphic accessibility layer
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

I've now got a thorough map of the architecture plus a detailed design for the Morphic-level accessibility layer. Before I finalize the plan, I have three foundational decisions to confirm — these shape everything downstream and are hard to reverse.

A few things I've established:
- All the engine source (morphic.js, gui.js, blocks.js, widgets.js) lives in **`snap-dev/src/`**, so that's where the implementation goes (the `manual` repo is the reference-manual website). I'll assume that unless you say otherwise.
- The existing `world.keyboardFocus` + always-focused hidden `<textarea id="morphic_keyboard">` is currently the *sole* keyboard entry point, routing every keystroke to `keyboardFocus.processKeyDown`. That's the model we have to coexist with.
- There's already keyboard *editing* of blocks (`ScriptFocusMorph`) and keyboard menu nav in `MenuMorph` — separate from screen-reader support, but we'll reconcile with them.

- 🔧 `AskUserQuestion`
**🤖 Claude:**

The answers give me a clear, nuanced direction:

1. **Native roving focus** as the primary model, **plus `aria-activedescendant` where APG expects it** (e.g. combobox/search, certain composites) — so the layer must support both mechanisms, selected per widget pattern.
2. **Split by change-type**: global focus *state* inlined into `morphic.js`; *overrides* of existing functions edit the morphic.js source directly; *new additive* functionality goes in a new `src/accessibility.js`.
3. **Morphic core + test harness** only for the first pass, validated with a real screen reader.

Let me nail down the exact source hook points by reading the precise methods I'll need to adapt, so the plan is accurate.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

I now have precise, verified hook points. I have everything needed to write the plan. Let me write it.

- 🔧 `Write` → /Users/michael/.claude/plans/i-need-to-make-tidy-lollipop.md
**🤖 Claude:**

The plan is written. Let me load the tool to present it for approval.

- 🔧 `ToolSearch` → select:ExitPlanMode
**🤖 Claude:**

I've researched the codebase and written a detailed Phase-1 plan to [`i-need-to-make-tidy-lollipop.md`](/Users/michael/.claude/plans/i-need-to-make-tidy-lollipop.md). Here's the shape of it:

**What we're building (Phase 1 — Morphic core only):** a parallel, invisible accessibility DOM tree that mirrors opted-in morphs, kept two-way synced to Morphic state, leveraging the browser's native focus/AT machinery.

**Core pieces:**
- **`world.focusedMorph`** — a single global AT focus, kept *distinct* from the existing `world.keyboardFocus` (raw-key receiver). Table in the plan spells out the relationship.
- **Per-morph DOM nodes** — opt-in (`Morph.isAccessible`, default false, so Morphic stays DOM-minimal), each visually-hidden-but-AT-visible with real geometry, `role`/`aria-label`/extensible attribute bag.
- **Native roving focus** as primary, with an **`aria-activedescendant`** path for APG patterns like a search/combobox — per your note.
- **2px blue focus-visible ring** via a `FocusIndicatorMorph`, shown only when focus arrived by keyboard (tracks an input-source flag exactly like the browser's `:focus-visible`), glued to the focused morph through the existing `changed()`/damage pipeline.
- **Tab/Shift+Tab** via one document-level capture `keydown` listener that defers entirely to the existing textarea path during text editing.

**Code-split per your rule:** global focus *state* inlined into `WorldMorph.init`; **7 small source adaptations** to `morphic.js` for overrides (`changed`, `edit`/`stopEditing`, `addChild`/`removeChild`/`destroy`); everything additive in a new **`src/accessibility.js`**.

**The hard part I want to flag:** today the hidden `<textarea>` is *always* the focused element and the sole key path. The plan keeps it as the default active element and only hands native focus to a morph node on Tab/SR/touch/edit — sidestepping a focus tug-of-war with the autofocus + mousedown-refocus kludge.

**Validation:** a standalone `morphic-a11y-demo.html` (Morphic runs without Snap!) exercising buttons, an editable field, a nested region, and a combobox — tested with **VoiceOver + NVDA** before any Snap! IDE wiring.

Phases 2 (Snap! landmark regions) and 3 (accessible toolbar & menus) are sketched as a roadmap to be planned separately.

- 🔧 `ExitPlanMode`
## 🧑 Michael

[Request interrupted by user]

## 🧑 Michael

begin to implement this plan

**🤖 Claude:**

The plan is approved. Let me start implementing. First, let me gather the exact Morphic APIs I'll be building on (geometry, world accessors, layout hooks) so the new code is correct, and set up task tracking.

- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && echo "=== getDocumentPositionOf ===" && grep -n "getDocume…
- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && echo "=== fillPage / zoom / initRetina ===" && grep -n "Wo…
- 🔧 `ToolSearch` → select:TaskCreate,TaskUpdate
**🤖 Claude:**

Let me get the remaining API details (the first grep short-circuited on a missing match):

- 🔧 `Bash` → echo "=== getDocumentPositionOf ===" ; grep -n "getDocumentPositionOf" src/morphic.js | head -5 ; echo "=== Mo…
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

I have all the geometry/world APIs I need. Key detail confirmed: under `world.zoom()`, `ZOOM` is a global multiplier (logical→CSS pixels), so geometry sync must scale by `ZOOM` (1 in the normal case). Let me read the render pipeline to get the focus ring's drawing right, and set up task tracking.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `TaskCreate` → New file with Morph ARIA API (isAccessible, ariaRole/Tag/Label, ariaAttributes, isFocusable, a11yFocusMode), e…
- 🔧 `TaskCreate` → Inline global a11y state + initAccessibility() in WorldMorph.init (12090); geometry/ring sync in Morph.changed…
- 🔧 `TaskCreate` → Add accessibility.js script tag right after morphic.js (line 16); consider role=application on the world canva…
- 🔧 `TaskCreate` → Standalone page loading only morphic.js + accessibility.js, building a bare WorldMorph with 3 buttons, an edit…
- 🔧 `TaskCreate` → Run the demo: confirm overlay geometry, element lifecycle, two-way focus sync (no loop), focus-visible ring, T…
**🤖 Claude:**

The render pipeline is clear: `render(ctx)` draws in local coordinates (0,0 = morph's top-left), context pre-clipped to bounds. Let me confirm a few standard methods exist before writing, then build the file.

- 🔧 `Bash` → grep -n "Morph.prototype.center =\|Morph.prototype.setPosition =\|Morph.prototype.setExtent =\|Morph.prototype…
**🤖 Claude:**

All standard methods confirmed. Now I'll write the additive layer. Let me mark task 1 in progress and create `src/accessibility.js`.

- 🔧 `TaskUpdate`
- 🔧 `Write` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now let me syntax-check the new file and confirm I'm matching Snap's exact Morph-subclass declaration idiom and the `modules` global.

- 🔧 `Bash` → echo "=== node syntax check ===" && node --check src/accessibility.js && echo "OK: accessibility.js syntax val…
**🤖 Claude:**

Idiom matches exactly (`var X; X.prototype = new ...; function X()`) and `modules`/syntax check out. Now the 7 source adaptations to `morphic.js`. Let me apply them.

- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

All 7 edits applied. Let me syntax-check the modified morphic.js and mark task 2 done.

- 🔧 `Bash` → node --check src/morphic.js && echo "OK: morphic.js syntax valid" && echo "=== verify edits landed ===" && gre…
**🤖 Claude:**

morphic.js is valid and all hooks landed. Let me complete the source tasks and wire up `snap.html`.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/snap.html
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/snap.html
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/snap.html
**🤖 Claude:**

Before building the demo, I want the parallel DOM to **nest** (mirror the morph hierarchy) rather than be flat — that's what makes landmark grouping and lists/menus work correctly in later phases, and it's a small change now. Let me refine `accessibility.js`: nest elements under their nearest accessible ancestor and position them relative to it.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now let me syntax-check and build the test harness.

- 🔧 `Bash` → node --check src/accessibility.js && echo "OK: accessibility.js syntax valid" && grep -n "Morph.prototype.setC…
**🤖 Claude:**

Tasks 1 and 3 are done. Let me update statuses and build the demo harness.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Write` → /Users/michael/Dropbox/Projects/snap/snap-dev/morphic-a11y-demo.html
**🤖 Claude:**

The demo is built and showing in the preview panel. Now let me actually run it in a browser to verify the accessibility layer works. Let me load the preview tools.

- 🔧 `ToolSearch` → Claude_Preview preview start eval screenshot snapshot console
**🤖 Claude:**

Let me check for any running preview server and existing launch config.

- 🔧 `mcp__Claude_Preview__preview_list`
- 🔧 `Bash` → echo "=== manual/.claude/launch.json ===" ; cat /Users/michael/Dropbox/Projects/snap/manual/.claude/launch.jso…
**🤖 Claude:**

Python3 is available and no server is running. Let me create a launch config that serves the `snap-dev` directory, then start it.

- 🔧 `Write` → /Users/michael/Dropbox/Projects/snap/manual/.claude/launch.json
- 🔧 `mcp__Claude_Preview__preview_start`
**🤖 Claude:**

Server is up. Let me navigate the preview to the demo page and check it loads without errors.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Let me check for load errors and inspect the resulting accessibility tree.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. Let me inspect the parallel accessibility tree that was built.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The tree is built correctly: canvas `role="application"`, 7 focusable widgets in the right reading order, proper nesting (region→buttons, combobox→listbox→options), relative positioning, roving `tabindex=-1`, and stable IDs for `aria-activedescendant`. Now let me exercise the interactions — Tab navigation, two-way focus sync, the focus-visible ring, and activedescendant.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Two-way sync, Tab/Shift+Tab, and focus-visible all work exactly right — native DOM focus follows Morphic, the ring matches bounds (expanded 2px), and pointer input hides the ring while keeping focus. Now let me test activation, the combobox's `aria-activedescendant`, DOM-initiated focus (simulating a screen reader), and text-edit handoff.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Activation, combobox `aria-activedescendant` (ArrowDown ×2 → Cherries, `aria-selected` synced), and the ARIA combobox attributes all work. But one thing to check: after a direct `.focus()` (simulating a screen reader moving native focus), `document.activeElement` became Charlie yet `focusedMorph` stayed Bravo — suggesting `focusin` didn't auto-fire. That's often a quirk of programmatic focus when the preview window itself isn't focused. Let me confirm the `focusin` handler itself is correct by dispatching the event a real AT would.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Confirmed — `document.hasFocus()` is `false` (the preview window lacks system focus), which is exactly why programmatic `.focus()` set `activeElement` but didn't auto-fire `focusin`. When I dispatch the `focusin` a real AT/focused-window produces, `setFocusFromDOM` correctly syncs `focusedMorph` → Charlie with no loop. The DOM→Morphic path is sound.

Now the last major piece: text-edit handoff to the hidden textarea.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Text-edit handoff is perfect: editing hands native focus to the hidden `morphic_keyboard` textarea, `keyboardFocus` becomes the `CursorMorph`, the ring tracks the field, typing flows through the existing text path ("hello world"), Tab is correctly deferred during editing, and `stopEditing` cleans up. 

Every core behavior is verified programmatically. Let me now visually confirm the blue focus ring actually renders on the canvas.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The blue 2px focus ring renders crisply around Bravo, the combobox shows Cherries selected (from the arrow-key test), "hello world" is in the editable field, and the event log shows the full two-way-sync history. The Morphic-core layer works end to end.

The critical remaining check: I modified `morphic.js` and added `accessibility.js` to the real `snap.html` — I must confirm I didn't break the actual Snap! IDE. Let me load it.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Snap! is a large app; let me give it a moment to load, then check for errors and confirm the IDE built correctly with the accessibility layer active.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Snap! loads cleanly with the accessibility layer active: the IDE built (`hasIDE: true`), `initAccessibility` ran (root + focus ring exist, canvas `role="application"`), the global focus state is present, and crucially the parallel tree is **empty** with **0 focusable widgets** — exactly right, since no Snap morphs opt in yet (that's Phase 2). The layer is inert until used, so it's safe. Let me confirm the IDE renders visually.

- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The full Snap! IDE renders perfectly — palette, categories, sprite editor, scripting area, stage, and corral all intact. The accessibility layer is loaded but dormant (nothing opted in yet), so it doesn't interfere. Let me do a final check for any warnings and confirm Snap's own interaction still works.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

No warnings. The eval serialization choked on returning a morph object — let me re-run returning only primitives.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

No warnings, and Snap's keyboard path is unaffected — the hidden textarea handler is intact, our document keydown handler safely no-ops when nothing has opted in (`focusableCount: 0`), and dispatching keys doesn't throw. The layer is genuinely inert in Snap until Phase 2.

One refinement: the overlay should align to the canvas's *drawing surface* (accounting for any border/padding) so AT touch-exploration is pixel-accurate. Let me improve that.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Bash` → node --check src/accessibility.js && echo "OK: accessibility.js valid"
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Let me verify the overlay now aligns pixel-accurately with the rendered morphs.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Pixel-perfect alignment confirmed — both a top-level button (Alpha) and a nested one (Inside 1) have `dx=0, dy=0` against where Morphic actually renders them, and the overlay correctly accounts for the canvas border. 

Phase 1 is complete and fully verified in-browser. Let me close out the tasks.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
**🤖 Claude:**

Let me record this initiative in memory for future sessions, since it's a multi-phase effort with non-obvious architecture decisions.

- 🔧 `Bash` → cat "/Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/MEMORY.md" 2>/dev/null…
- 🔧 `Write` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
- 🔧 `Write` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/MEMORY.md
**🤖 Claude:**

Let me do one more check the plan flagged as a risk — that geometry scales correctly under `ZOOM` (zoomed UI). I'll verify the scaling math non-destructively.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

ZOOM scaling is correct — at `ZOOM=2` every coordinate doubles (20,40→40,80; 150×42→300×84). That was the last flagged risk. Let me get a clean summary of what changed.

- 🔧 `Bash` → echo "=== git status (snap-dev) ===" && git status --short && echo "" && echo "=== diffstat ===" && git diff -…
**🤖 Claude:**

Phase 1 is complete and fully verified. The `morphic.js` diff is **51 insertions, 0 deletions** — purely additive guarded hooks, no existing logic touched, exactly the discipline you asked for.

## What landed

**New `src/accessibility.js`** — the additive layer:
- **Morph ARIA API** (opt-in): `isAccessible`, `ariaRole`, `ariaTag`, `ariaLabel`/`setAriaLabel`, `setAria(k,v)` bag, `a11yFocusMode` (`roving` | `activedescendant`), `excludeFromTabRing`.
- **Per-morph DOM nodes** that nest to mirror the morph hierarchy (so landmarks/lists/menus work later), visually hidden but AT-visible, positioned relative to their accessible ancestor.
- **WorldMorph focus manager**: `world.focusedMorph` (the single global AT focus, distinct from `keyboardFocus`), `setFocus`/`setFocusFromDOM` with a re-entrancy guard, `focusableMorphs()`, roving Tab/Shift+Tab via one document-level capture listener, `aria-activedescendant` support.
- **`FocusIndicatorMorph`** — the 2px blue focus-visible ring (keyboard-only), drawn through Morphic's normal damage pipeline.

**`src/morphic.js`** — 7 guarded source hooks: global focus state + `initAccessibility()` in `WorldMorph.init`; geometry/ring sync in `Morph.changed`; reconcile/teardown in `addChild`/`addChildFirst`/`removeChild`/`destroy`; text-edit reconciliation in `edit`/`stopEditing`. Each guarded so morphic.js still runs standalone without the new file.

**`snap.html`** — loads `accessibility.js` right after `morphic.js`.

**`morphic-a11y-demo.html`** — standalone harness (loads only morphic.js + accessibility.js).

## Verified in-browser (all passing)
- Nested parallel tree with correct roles/labels/ids and **reading order**; **pixel-accurate** overlay (`dx=dy=0`) for top-level *and* nested morphs, border-aware, and correct at **ZOOM=2**.
- **Two-way sync**: Morphic→DOM (`setFocus`→native `.focus()`) and DOM→Morphic (`focusin`→`setFocusFromDOM`), no infinite loop.
- **Roving Tab/Shift+Tab** in reading order; region/listbox/options correctly excluded from the tab ring.
- **Focus-visible ring** appears on keyboard, hides on pointer click (focus preserved) — screenshot confirmed the blue ring renders.
- **Activation** via native `<button>` click and Enter/Space; **`aria-activedescendant`** combobox (arrows move active option, `aria-selected` syncs).
- **Text-edit handoff**: editing hands native focus to the hidden `morphic_keyboard` textarea, `keyboardFocus` becomes the `CursorMorph`, typing flows through the existing path, our Tab nav is deferred during editing.
- **No Snap! regression**: the full IDE loads with the layer **inert** (0 opted-in morphs), no console errors or warnings.

## The one manual step left to you
Real screen-reader smoke test (I can't drive your VoiceOver/NVDA). A dev server is already running:

**Open `http://localhost:8765/morphic-a11y-demo.html`**, turn on VoiceOver (⌘F5) or NVDA, and Tab through / explore. The on-page "Try this" panel and live event log walk you through it. (Server config is in `manual/.claude/launch.json` as `snap-dev-static`.)

## Next (Phase 2, when you're ready)
Tag the Snap! IDE regions (`controlBar`, `categories`, `palette`, `spriteEditor`, `stage`, `corral`) as ARIA landmarks using this API — wired in `IDE_Morph.buildPanes`/`createXXX`. Then Phase 3: accessible toolbar + menus.

Want me to proceed to Phase 2, or would you rather run the screen-reader pass first and tweak the core based on what you hear?

## 🧑 Michael

OK, the morphic dev demo is looking decent. 
When you right click you get the dev inspector menu. Lets look at making this menu accessible. 

* add a tiny ui button to trigger the context menu
* ensure it has ARIA for haspopup etc
* ensure arrowing through the menu items reveals them to the screen reader

**🤖 Claude:**

The Morphic context menu (right-click → dev/inspector menu) is a `MenuMorph`, which already has internal keyboard navigation — it just has no ARIA, so a screen reader can't follow it. Making `MenuMorph` accessible is the natural first step of the menu work, and it'll benefit both the right-click menu and your new trigger button.

Let me study the `MenuMorph`/`MenuItemMorph` code precisely so I integrate without breaking the existing nav.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

`MenuMorph` already has full internal keyboard nav (`processKeyDown`, `selectUp/Down`, `select`), driven through the textarea when `world.keyboardFocus = menu`. The missing piece is purely ARIA + making the screen reader follow the selection. Let me read `select`, `createItems`, the `MenuItemMorph` class, and how menus close, then integrate.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Bash` → grep -n "activeMenu = null\|createItems = function\|MenuMorph.prototype.destroy\|prototype.popUpSubmenu\|proto…
**🤖 Claude:**

I have the menu internals. `select()` (8566) is the single choke point for selection changes, `destroy()` (8574) already manages `activeMenu`/`keyboardFocus`, and items are `MenuItemMorph`s (direct children, or under a `ScrollFrameMorph` when scrolled). Let me confirm the submenu popup path and `createItems`, using absolute paths (the shell cwd reset).

- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && grep -n "createItems = function\|popUpSubmenu = function\|…
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

I now have the complete picture: `select()` is the selection choke point, `popUpSubmenu()` adds submenus to the parent menu (auto-creating their a11y elements via the reconcile hook), and `developersMenu()` builds the right-click menu. The cleanest integration makes `MenuMorph` itself accessible (benefiting the right-click menu *and* the new button), using the `aria-activedescendant` pattern so Morphic's existing arrow-nav drives the SR.

Let me add the menu support to `accessibility.js`. First the helpers and the keydown routing:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me track this menu work and continue the edits — the keydown routing and focus-ring targeting.

- 🔧 `TaskCreate` → accessibility.js: MenuMorph/MenuItemMorph ARIA (role menu/menuitem, label, aria-haspopup for submenus), syncAc…
- 🔧 `TaskCreate` → Add a small button to morphic-a11y-demo.html that opens a context/dev menu (with a submenu), sets aria-haspopu…
- 🔧 `TaskUpdate`
**🤖 Claude:**

Now the keydown routing and focus-ring targeting in `accessibility.js`:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now append the menu accessibility section at the end of `accessibility.js`:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me syntax-check and apply the 4 small `MenuMorph` hooks in `morphic.js`.

- 🔧 `Bash` → node --check src/accessibility.js && echo "OK: accessibility.js valid"
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

Let me verify morphic.js still parses, then add the menu-trigger button to the demo.

- 🔧 `Bash` → node --check src/morphic.js && echo "OK: morphic.js valid"
**🤖 Claude:**

Both files parse. Now let me add the menu-trigger button to the demo — a helper that builds a context menu (with a submenu), plus wiring in `buildDemo` and the instructions.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/morphic-a11y-demo.html
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/morphic-a11y-demo.html
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/morphic-a11y-demo.html
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/morphic-a11y-demo.html
**🤖 Claude:**

All edits are in. Let me restart the preview server and verify the menu accessibility end to end.

- 🔧 `mcp__Claude_Preview__preview_start`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Let me check for load errors, then drive the full menu flow: open it, arrow through items, enter the submenu, and close.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Found a real bug: `MenuMorph` (and some others) shadow the `world()` *method* with a `world` *property* (set to the WorldMorph or null), so my `this.world()` calls throw. Morphic itself guards this with `this.world instanceof Function ? this.world() : this.world`. Let me add a robust `a11yWorld()` helper and use it everywhere. First let me find all the call sites.

- 🔧 `Bash` → grep -n "\.world()" src/accessibility.js
**🤖 Claude:**

Let me add the `a11yWorld()` helper and fix all 5 call sites.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me syntax-check and re-run the menu flow test.

- 🔧 `Bash` → node --check src/accessibility.js && echo "OK valid"
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Menu accessibility is working: button has `aria-haspopup=menu` / `aria-expanded` toggling, the opened menu has `role=menu` + label, native focus moves into it, `aria-activedescendant` points at the first item (Inspect), all items are `role=menuitem`, and the submenu item ("More…") correctly gets `aria-haspopup=menu`. Now let me verify arrow navigation updates `aria-activedescendant`, submenu enter/leave, and close-returns-focus.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The entire menu flow works perfectly: `aria-activedescendant` updates on every arrow, the focus ring hugs the active item (`ringOnSelection: true` throughout), submenu enter (→ "Export") and leave both manage focus correctly, and Esc closes the menu and returns native focus to the trigger button with `aria-expanded` reset. Let me capture it visually.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The viewport is narrow, cutting off the menu (which is at x=530). Let me widen it and re-capture with the menu open.

- 🔧 `mcp__Claude_Preview__preview_resize`
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The menu renders correctly — "Demo menu" title, items (Inspect, Duplicate [highlighted], More… ▶ with submenu arrow, Delete), opened below the Menu button, with 8 focusable widgets now in the tab ring. 

The most important check: I made `MenuMorph` globally accessible and hooked its shared methods, which Snap! uses everywhere. Let me verify Snap! menus still work without regression.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No load errors. Let me open a real Snap! menu (the Settings menu, which has submenus) and verify it gets the ARIA treatment, navigates, and closes cleanly.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Snap!'s real Settings menu is now fully accessible — `role=menu`, 15 menuitems (Language…, Looks…, Editor…, Project…, Accessibility…), 6 submenu items flagged with `aria-haspopup=menu`, arrow-nav works (landed on "Editor…"), and Escape closes cleanly with no errors. Making `MenuMorph` accessible automatically covers **every** Snap! menu. Let me confirm no warnings, then verify the right-click dev menu path the user specifically mentioned.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

No warnings in Snap either. Now let me verify the right-click dev/inspector menu path the user specifically called out — both that a `developersMenu` is accessible and that an actual right-click opens it.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Both paths work: the **right-click dev/inspector menu** (the one you mentioned) now opens as an accessible `role=menu` with all 13 items (color…, transparency…, resize…, duplicate, pick up, attach…) exposed as `menuitem`s — via both a direct `developersMenu()` call *and* a real right-click through the full mouse path. And the dedicated trigger button works too.

Let me close out the tasks and summarize what changed.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Bash` → git diff --stat && echo "--- untracked ---" && git status --short | grep '??'
**🤖 Claude:**

The `morphic.js` diff is now 67 insertions, still 0 deletions — purely additive. Let me update the project memory to record the menu work.

- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Done — and verified end to end. Here's what I added for menu accessibility.

## What changed

**`src/accessibility.js`** (additive) — `MenuMorph`/`MenuItemMorph` are now accessible:
- `MenuMorph` → `role="menu"` + label; `MenuItemMorph` → `role="menuitem"`, with `aria-haspopup="menu"` on items that open submenus.
- Uses the **`aria-activedescendant`** pattern (APG-valid for menus): the menu element holds native focus, and Morphic's *existing* arrow-key navigation drives `selection`, which I mirror into `aria-activedescendant` so the screen reader announces each item as you arrow.
- `syncAccessibleMenuFocus` / `updateActiveDescendant` / `restoreAccessibleFocus`, menu key-routing in `handleA11yKeydown`, and the focus ring now hugs the **active item** (`a11yActiveTarget`).
- Added `a11yWorld()` — a robust world accessor, because `MenuMorph` shadows the `world()` *method* with a `world` *property* (this was a real bug I hit and fixed).

**`src/morphic.js`** (4 tiny guarded hooks, +16 lines, still 0 deletions): `MenuMorph.getFocus` / `select` / `destroy` / `leaveSubmenu`.

**`morphic-a11y-demo.html`**: a "**Menu ▾**" button with `aria-haspopup="menu"` + `aria-expanded` that opens a menu (with a submenu); instructions updated.

## Verified in-browser
- **Trigger button**: `role=button`, `aria-haspopup=menu`, `aria-expanded` toggles false→true on open, true→false on close. ✓
- **Open** (keyboard): native focus moves into the menu (`role=menu`), first item active, `aria-activedescendant` set. ✓
- **Arrowing**: `aria-activedescendant` follows ↓/↑ (Inspect→Duplicate→More…), and the blue ring tracks the active item at every step. ✓
- **Submenu**: → enters ("More…" → Export/Import, `aria-haspopup` on the item), ← returns to parent. ✓
- **Esc**: closes and returns native focus to the trigger button. ✓
- **No Snap! regression** — and a big bonus: because `MenuMorph` is now accessible globally, **every Snap! menu** is covered. I confirmed the real **Settings menu** (15 items, 6 submenus) and the **right-click dev/inspector menu** (13 items: color…, transparency…, duplicate, …) both open as `role=menu` with navigable `menuitem`s — via a direct call *and* a true right-click through the mouse path. No console errors or warnings.

The demo is live at **`http://localhost:8765/morphic-a11y-demo.html`** — tab to **Menu ▾**, Enter, then arrow with VoiceOver/NVDA on to hear each item announced. Right-click anywhere also opens the now-accessible dev menu.

A couple of honest notes for later refinement: the submenu's DOM isn't perfectly nested inside its triggering item per strict APG (it's functional, items get `aria-haspopup`), and Snap's embedded dropdown *lists* (`isListContents`) currently also get `role=menu` (harmless, but semantically a listbox would be better). Want me to keep going into the toolbar/control-bar buttons next, or refine the menu semantics first?

## 🧑 Michael

This looks good so far. Two notes:

* when you click inside the morph on a button, the screen reader seems to read more info that necessary about the world. Is there a work around?
* when a menu opens it should say something like 'list N items' and let you tab between them too. 
* it would be good it we read/exposed the 'expanded'/'collapsed' attributes

**🤖 Claude:**

These are good, concrete accessibility refinements. Let me first inspect what the browser's accessibility tree actually looks like right now (this is what the screen reader consumes), so I diagnose the "too much about the world" noise precisely.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The culprit is clear: the canvas itself has `role="application"` *and* `tabindex="1"` *and* `id="world"` — so clicking it makes the screen reader announce the bare "world" canvas as an application region, on top of the overlay. The fix is to hide the visual canvas from AT entirely (the parallel tree carries all semantics).

Let me address all three notes. First, the canvas/root cleanup and the menu item-count + Tab support:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me create a tracking task and continue with the menu Tab handling, item-count exposure, and `aria-expanded`.

- 🔧 `TaskCreate` → Note 1: aria-hide canvas (done). Note 2: aria-setsize/posinset on menu items + Tab/Shift+Tab navigates items. …
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

Let me syntax-check both files, then reload and verify.

- 🔧 `Bash` → node --check src/accessibility.js && node --check src/morphic.js && echo "OK: both valid"
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The shell cwd reset again. Let me syntax-check with an explicit directory.

- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && node --check src/accessibility.js && node --check src/morp…
**🤖 Claude:**

Both valid. Let me verify all three fixes in the browser: canvas hidden from AT, menu item-count + Tab navigation, and `aria-expanded` on submenu open/close.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

All three notes are verified:

**Note 1** — canvas is now `aria-hidden=true` with no role; only a single labeled application region remains (no more bare "world" canvas chatter).
**Note 2** — items expose `aria-posinset`/`aria-setsize` (so the SR says "Inspect, 1 of 4"), and **Tab/Shift+Tab navigate items** (Inspect→Duplicate→Inspect).
**Note 3** — the "More…" submenu item reports `aria-expanded`: false → **true** when opened (→) → false when closed (←).

Now the important regression check — these canvas/menu changes apply globally to Snap! too. Let me confirm Snap! still works.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Snap! is fully intact: IDE loaded, canvas `aria-hidden=true`, and the real Settings menu now reports "Language…, 1 of 15", Tab moves to "Looks…", and Esc closes cleanly — no errors. Let me confirm the IDE renders visually and capture the menu refinements in the demo.

- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

Snap! renders perfectly — the IDE is fully intact and the `aria-hidden` canvas change has zero visual impact. All three notes are addressed and verified with no regression. Let me close out the task and record the refinements.

- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

All three notes are fixed and verified in-browser (demo + real Snap! menus), with no regression.

## 1. Too much "world" chatter on click
The canvas had `role="application"` + `tabindex="1"` + `id="world"`, so clicking it made the screen reader announce the bare **"world" application** on top of your overlay. Fixed by making the visual canvas **`aria-hidden="true"`** with no role — the screen reader now reads *only* the parallel tree. The overlay root keeps `role="application"` (so keystrokes pass through to our navigation instead of the SR's browse-mode arrows) plus an `aria-label`, so there's one clean app boundary instead of a noisy duplicate.

## 2. Menu announces item count + Tab between items
- Every menu item now carries **`aria-posinset` / `aria-setsize`** → the SR announces "Inspect, **1 of 4**" (verified: Snap's Settings menu reports "1 of 15").
- **Tab / Shift+Tab now move between items** in addition to the arrow keys (Inspect→Duplicate→Inspect). Esc still closes.

## 3. Expanded/collapsed exposed
Submenu items now expose **`aria-expanded`**, toggled live: `false` when collapsed → `true` when you open the submenu (→) → `false` when you close it (←). The trigger button already exposed `aria-expanded` too.

**Verified end to end:** the demo's "Menu ▾" and Snap!'s real Settings menu both announce position/size, Tab-navigate, and toggle expanded state; the canvas is hidden from AT in both; Snap! loads and renders with no console errors and no visual change.

One honest note on wording: a `role="menu"` is announced by screen readers as "menu" (with "N of M" per item), not literally "list, N items" — that's the correct ARIA for a menu, and the count is conveyed via `setsize`/`posinset`. If you specifically want *list* semantics somewhere (e.g. the combobox results or a non-menu popup), that'd be `role="listbox"`/`option`, which we can apply where it fits.

The demo is live at **`http://localhost:8765/morphic-a11y-demo.html`** for a screen-reader pass. Want me to keep going — e.g. apply the same treatment to Snap's palette/block dropdowns, or move on to the control-bar toolbar buttons?

## 🧑 Michael

OK, we can continue to use menu semantics. When you right click to open a menu focus should be moved to that menu so it reads the title (if present) and N items. 

Hitting ESC properly closes a submenu, but it should restore your keyboard focus point to the previous menu item. Similarly hitting esc to close any menu should move the focus point back tothe menu trigger button so pressing tab just keeps moving you forward

**🤖 Claude:**

Two good refinements. Let me look at how `onNextStep` is used (the right-click flow re-focuses the textarea via it, which could steal focus from a menu I move focus into), so I handle note 1 robustly.

- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && grep -rn "onNextStep" src/*.js
**🤖 Claude:**

`onNextStep` on the world is exclusively the textarea-refocus kludge (morphic.js:12524-12529) — other usages are on different morphs. So clearing the *world's* `onNextStep` when a menu grabs focus is safe and targeted. Let me apply all the changes.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/morphic-a11y-demo.html
**🤖 Claude:**

Let me syntax-check and reload the demo to test the right-click focus and ESC behaviors.

- 🔧 `Bash` → node --check src/accessibility.js && node --check src/morphic.js && echo "OK both valid"
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Let me test all three behaviors: right-click opens with focus + title + count, ESC on submenu returns to the parent item, and ESC on root returns to the trigger button.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

All three behaviors work exactly as requested:
- **Right-click** → focus moves into the menu (`focusedIsMenu`, `activeElIsMenu`), title read (`menuLabel: "Morph"`), and "color…, 1 of 13"; the textarea kludge was canceled so focus sticks.
- **ESC on submenu** → returns to the parent menu's "More…" item (menu still open).
- **ESC on root** → returns native focus to the "Menu" trigger button so Tab continues forward.

One safety guard before I re-check Snap!: auto-focusing on open should skip menus that have *no* items (e.g. the numeric-input slider popup, which shouldn't steal focus mid-edit).

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me syntax-check and verify Snap! has no regression from the auto-focus-on-open change.

- 🔧 `Bash` → node --check src/accessibility.js && echo OK
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. Let me verify Snap! menus auto-focus correctly and don't break anything.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Snap! is fully working with no regression: the Settings menu **auto-focuses on open** (reads "Language…", 15 items), ESC closes and clears focus, the stage's right-click context menu auto-focuses too (4 items), the IDE is intact, and no errors. The slider-only guard and `onNextStep` cancellation both behave.

Let me record these behaviors in memory.

- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Both refinements are done and verified across the demo and real Snap! menus, with no regression.

## 1. Right-click (and any menu open) moves focus into the menu
`MenuMorph.popup()` now calls `enterAccessibleFocus()`, which moves native AT focus into the menu on open — so the screen reader immediately reads the **title** (when present) and the **first item with its count**. Verified:
- Right-click dev menu → "**Morph** menu, color…, **1 of 13**", focus is on the menu element.
- Snap's Settings menu → auto-focused, "Language…, 1 of 15".
- I cancel the world's pending `onNextStep` (the right-click→textarea-refocus kludge) inside the focus move, so it can't steal focus back; and I guard against item-less popups (e.g. the numeric-input slider) so they don't grab focus mid-edit.

## 2. ESC restores the right focus point
- **ESC on a submenu** now calls `leaveSubmenu()` → closes just the submenu and returns focus to the **parent menu's trigger item** (verified: submenu "More"/"Export" → ESC → parent "Demo menu" with "More…" selected, menu still open).
- **ESC on the root menu** closes it and returns focus to the **trigger button** (verified: → "Menu" button has native focus), so pressing **Tab just keeps moving forward**. For right-click menus with no button trigger, focus returns to wherever it was (or the textarea), and Tab proceeds to the first widget.

Net `morphic.js` change is still purely additive guarded hooks. The demo (`http://localhost:8765/morphic-a11y-demo.html`) is ready for a screen-reader pass: Tab to **Menu ▾** and Enter, or right-click anywhere — you'll hear the menu title + "N of M", arrow/Tab through items, → into a submenu, and ESC steps back out one level at a time.

Want me to move on to the toolbar/control-bar buttons next, or apply `role="listbox"` semantics to the block/input dropdowns where a list (rather than a menu) is the better fit?

## 🧑 Michael

OK great! One more fix for menus then we will move to exploring Snap! integration.

When you right click safari says "you are currently on a menu item" - shouldn't the focus be on the menu morph itself then tabbing moves to the first option?

ESC and keyboard semantics seem good and stable

**🤖 Claude:**

Good catch — that's a real ARIA subtlety. Because I pre-select the first item on open, `aria-activedescendant` immediately points at it, so VoiceOver reports "on a menu item" instead of "on the menu." The fix: on open, focus the menu container with **no** active descendant (so it announces as a menu), and let the first arrow/Tab move onto the first item. (Submenus should still land on their first item per APG — that path uses `getFocus`, which I'll leave alone.)

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Bash` → node --check src/accessibility.js && echo OK
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && node --check src/accessibility.js && echo OK
**🤖 Claude:**

Let me verify the menu now focuses the container (not an item) on open, and that Tab/arrow then moves to the first option.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The fix works exactly as requested:
- **On open** (right-click): focus is on the **menu container** (`activeElRole: "menu"`, `aria-activedescendant: null`, no selection) → VoiceOver will say "menu, N items" instead of "on a menu item".
- **First Tab** → moves onto the first option ("color…"); **arrow down** → "transparency…".
- **Submenus** still land on their first item ("Export") per APG — that path was left intact.

As a nice side effect, mouse users no longer see a pre-highlighted first item on open (closer to original Snap behavior). Let me confirm Snap! has no regression.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Verified in Snap! too: the Settings menu opens with focus on the **menu container** (`focusOnMenuContainer: true`, no active descendant, no selection), the first arrow moves to "Language…", ESC closes — no errors, no regression.

Let me record this final menu behavior in memory.

- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Fixed and verified in both the demo and Snap!, with no regression.

## The fix
The menu was pre-selecting its first item on open, so `aria-activedescendant` immediately pointed at it — that's why VoiceOver reported "on a menu item." Now `enterAccessibleFocus` puts focus on the **menu container itself** (`role=menu`) with **no item selected and no `aria-activedescendant`**, so the screen reader announces the menu. The first **Tab/arrow** then moves onto the first option.

Verified:
- **On open** (right-click *and* Snap menus): focus is on the menu container, `aria-activedescendant` is null, no selection → announced as a menu, not a menu item.
- **Tab / ↓** → first option ("color…" / "Language…"), then subsequent items.
- **Submenus** (→) still land on their first item per APG — that path was untouched.
- Bonus: mouse users no longer see a pre-highlighted first item on open (back to original Snap! feel); the menu just quietly takes keyboard focus for AT.

The menu layer now feels complete: container-focus on open, Tab/arrow navigation with "N of M", submenu enter/leave, `aria-haspopup`/`aria-expanded`, and ESC stepping back one level at a time (submenu → parent item, root → trigger).

Ready to move on to **Snap! integration** whenever you are. The natural starting points are:
1. **Landmark regions** — tag the IDE's panes (control bar, palette, scripting area, stage, corral) as ARIA landmarks so a screen-reader user can jump between them.
2. **Control-bar toolbar** — make the green-flag/stop/pause and project/settings/cloud buttons real accessible buttons (labels for the symbol-only ones, `aria-pressed` for toggles, roving arrow nav).

Which would you like to explore first?

## 🧑 Michael

Let's do the landmark regions, and then hopefully menus within those regions will work. 

The IDE_Morph should be the entrypoint labelled just Snap! - Project Name (please make use to `localize` labels)

We want the control bar, scripting area, block palette, category selector, stage and sprite corral

**🤖 Claude:**

Let me move to Snap! integration: ARIA landmark regions. First let me study the IDE setup — where the regions are created/recreated, how the project name is obtained and updated, and where `localize` is used.

- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && echo "=== method locations ===" && grep -n "IDE_Morph.prot…
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

`buildPanes` creates all six regions, `getProjectName()` reads `scenes.at(1).name`, and `setProjectName`/`updateLabel` is where the name refreshes. Let me see `openIn` (the setup flow) and confirm how regions are added, so I hook the tagging correctly.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

`openIn` does `buildPanes()` then `world.add(this)` (so regions exist and are world-attached after that), and `setProjectName`/`updateLabel` refresh the project name. Let me find the IDE's `fixLayout` end and the control bar's `updateLabel` so I hook region-tagging (catches palette/editor/corral recreation) and the entrypoint-label refresh.

- 🔧 `Bash` → echo "=== fixLayout ===" && grep -n "IDE_Morph.prototype.fixLayout = function" src/gui.js && echo "=== updateL…
**🤖 Claude:**

Regions are added via `this.add(this.X)` inside each `createXXX`, and `controlBar.updateLabel()` is the central project-name refresh. Let me read `updateLabel` and find where `fixLayout` ends so I hook region-tagging and the entrypoint-label refresh.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Bash` → awk 'NR>=2740 && /^IDE_Morph.prototype.[a-zA-Z]+ = function/ {print NR": "$0; if(++c==2) exit}' src/gui.js
**🤖 Claude:**

`updateLabel` captures the IDE as `myself`, and `fixLayout` runs 2740–2931. Let me see the end of `fixLayout` for my hook point.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

fixLayout ends at line 2929. I have everything I need. Let me implement: a `setAccessibleLabel` on the world, and IDE methods to tag the six panes as landmark regions + label the entry point "Snap! - ProjectName". 

Key design point: menus pop up at the **world** level, so they nest under the a11y root — which must stay `role="application"` for their key pass-through. So the **root** carries the "Snap! - ProjectName" entry-point label (set by the IDE), and the six regions are landmarks directly under it. Let me set up tasks and make the edits.

- 🔧 `TaskCreate` → accessibility.js: WorldMorph.setAccessibleLabel. gui.js: IDE setAccessibleRegions/tagAccessibleRegion/updateAc…
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now the IDE methods and hooks in gui.js. First the three methods (added after `fixLayout`, with the `fixLayout` hook):

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now the `openIn` and `updateLabel` hooks:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me syntax-check and verify the landmarks in Snap!.

- 🔧 `Bash` → node --check src/gui.js && node --check src/accessibility.js && echo "OK both valid"
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. Let me verify the landmark regions and the entry-point label.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The label is still default and no regions tagged — let me check whether the new IDE methods are even present (possible stale cache) or failing silently.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The new gui.js methods are `undefined` — the browser is serving a **stale cached `gui.js`** (the `?version=` string didn't change). Let me confirm the edits are on disk, then switch the dev server to a no-cache one so reloads always pick up changes.

- 🔧 `Bash` → echo "=== methods on disk? ===" && grep -n "setAccessibleRegions = function\|updateAccessibleLabel = function\…
- 🔧 `Write` → /Users/michael/Dropbox/Projects/snap/snap-dev/.nocache_server.py
**🤖 Claude:**

Confirmed — the methods are on disk (2942, 2956, 2967); it's purely browser caching of `gui.js`. Let me switch the launch config to the no-cache server and restart it.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/manual/.claude/launch.json
**🤖 Claude:**

Let me load the stop tool to restart the server with the new config.

- 🔧 `ToolSearch` → select:mcp__Claude_Preview__preview_stop
- 🔧 `mcp__Claude_Preview__preview_stop`
- 🔧 `mcp__Claude_Preview__preview_start`
**🤖 Claude:**

Server restarted with no-cache headers. Let me reload Snap! and re-check whether the new gui.js is now served.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The browser still has the old `gui.js` URL cached (the no-store headers only affect future fetches, and the `?version=` URL is unchanged). I need to bump the version strings once; after that, the no-cache server keeps future edits fresh. Let me bump the versions of the files I've edited.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/snap.html
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/snap.html
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/snap.html
**🤖 Claude:**

Now the script URLs are fresh. Let me reload and verify the landmarks.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Excellent — all six landmarks are now exposed with localized labels, positioned over their panes, and the entry point reads **"Snap! - untitled"**. Let me verify the label updates on project rename and that pane recreation (category/tab switches) keeps regions tagged.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Rename works ("Snap! - My Game"). Wrong category method name — let me recreate the palette directly to test re-tagging.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Pane recreation correctly re-tags the new morphs (Block Palette, Scripting Area stay `role=region`), with no orphans (still exactly 6). One thing to improve: recreated panes get *appended* to the end, so the landmark **reading order** drifts (Block Palette and Scripting Area moved to the end). Let me keep the order stable by re-appending in reading order whenever a region is (re)created.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me syntax-check and verify the order stays stable after pane recreation.

- 🔧 `Bash` → node --check src/gui.js && echo OK
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The landmark order is now stable across pane recreation. Let me confirm no errors and that Snap! still renders correctly.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

No warnings, and Snap! renders correctly (the narrow preview viewport just squeezes the stage/corral — the IDE is fully functional and the a11y changes have no visual impact). Phase 2 is complete. Let me reset the viewport for your screen-reader testing, mark the task done, and record this.

- 🔧 `mcp__Claude_Preview__preview_resize`
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Phase 2 (landmark regions) is complete and verified, with no regression.

## What landed

**Six ARIA landmark regions**, tagged in `gui.js` (`IDE_Morph.setAccessibleRegions` / `tagAccessibleRegion`), all with `localize()`'d labels:

| Pane | Role | Label |
|---|---|---|
| `controlBar` | region | Control Bar |
| `categories` | region | Category Selector |
| `palette` | region | Block Palette |
| `spriteEditor` | region | Scripting Area |
| `stage` | region | Stage |
| `corral` | region | Sprite Corral |

**Entry point** labelled **"Snap! - &lt;Project Name&gt;"** (e.g. "Snap! - untitled", and it updated live to "Snap! - My Game" on rename). The labels and separator go through `localize`.

**Robustness verified:**
- Hooked from `openIn`, `fixLayout`, and `controlBar.updateLabel`, so panes that get **recreated** on category/tab switches stay tagged (no orphans — always exactly 6).
- Landmark **reading order stays stable** across recreation (`orderAccessibleRegions` re-appends in order) — verified it doesn't scramble after recreating the palette + scripting area.
- No console errors/warnings; the IDE renders and works unchanged.

**Menus within regions** work — since menus pop up at the world level and we already made `MenuMorph` accessible, opening a menu while in any region focuses it and announces normally.

## One design note to flag
You asked for **IDE_Morph** to be the entry point. I put the "Snap! - ProjectName" label and `role="application"` on the **a11y overlay root** (which the IDE sets via `world.setAccessibleLabel`) rather than a separate IDE_Morph element. The reason: menus are added to the *world*, so their DOM nodes sit at the root level — they must stay **inside** the `role="application"` container for screen-reader key pass-through. If I'd nested everything under an IDE_Morph element instead, menus would fall outside it. The AT result is identical (you enter "Snap! - ProjectName, application", then the six regions). If you'd rather have a literal IDE_Morph node, I can do that — menus would just need to also nest under it.

Also worth knowing: regions are currently **empty containers** — landmark navigation jumps you to "Block Palette" etc., but the blocks/scripts inside aren't exposed to AT yet (that's a later phase).

## Aside: a dev-caching fix
Your edits to `gui.js` weren't showing up because the browser caches `src/*.js` by their `?version=` query. I added a **no-cache dev server** (`snap-dev/.nocache_server.py`, wired into the `snap-dev-static` launch config) so reloads now pick up changes, and bumped the `?version=` stamps once to clear the stale entries.

The server's running at **`http://localhost:8765/snap.html`** for a screen-reader pass — try jumping between landmarks (VoiceOver rotor → Landmarks, or NVDA `D`). Want me to move on to the **control-bar toolbar buttons** next (green-flag/stop/pause + project/settings/cloud, with labels and `aria-pressed`), or start **exposing contents inside a region** (e.g. the palette blocks or the category buttons)?

## 🧑 Michael

Great progress!

Regions Feedback:

* The entire control bar (100% width, with the Snap! app menu should be the region. The black outline ring may be off?
* Add a region called the "scripting area toolbar" (this has the sprite name, and editor tabs)
* make the "sprite corral toolbar" a region (for the area right above the sprite corral)

Buttons!
Then Let's make a primary buttons selectable and ideally tab-able. Menus seem to work OK so far. 

* Snap! Menu
* File Menu
* Cloud Menu
* Settings Menu
* Green Flag (start)
* Pause
* Stop
* Category selector buttons

**🤖 Claude:**

Clear, well-scoped feedback. Let me study the control-bar/category button structure and the button classes' activation so I wire these correctly.

- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && echo "=== control bar button property names ===" && grep -…
- 🔧 `Bash` → echo "=== PushButton trigger/click ===" && grep -n "PushButtonMorph.prototype.mouseClickLeft\|PushButtonMorph.…
**🤖 Claude:**

Logo click → `snapMenu` confirmed. Let me read the button-class activation methods and the category-button creation to wire activation and pressed-state correctly.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now I understand the architecture. Both button classes trigger via `mouseClickLeft()`, `ToggleButtonMorph.state`/`refresh()` drive pressed state, category buttons live in `this.categories.buttons` with a `.category` property, and the logo's click opens `snapMenu`. 

This is a sizable chunk. Let me track it and do it in two stages — regions first, then buttons. Let me start with the region fixes, including a `a11yBounds` override so the control bar can span full width (logo + controlBar).

- 🔧 `TaskCreate` → Control Bar region spans 100% width (logo+controlBar) via Morph.a11yBounds override; add Scripting Area Toolba…
- 🔧 `TaskCreate` → Make logo (Snap! menu), projectButton, cloudButton, settingsButton (haspopup), startButton (Green flag), pause…
- 🔧 `TaskUpdate`
**🤖 Claude:**

Let me add the `a11yBounds` hook and make geometry sync use it (so a morph can present a different region rectangle, e.g. the full-width control bar):

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now the gui.js region updates — add the two toolbars, exclude regions from the tab ring, and make the control bar span full width:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now update `setAccessibleRegions` to make the control bar full-width:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now Stage B — the buttons. Let me read the rest of `ToggleButtonMorph.refresh` to hook the pressed-state sync.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
**🤖 Claude:**

`refresh` ends at 673. Let me make the Stage B edits — the refresh hook, the ToggleButton `aria-pressed` + menu-trigger `aria-expanded` in accessibility.js, and the button-tagging methods in gui.js.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

I hit a load-order issue: `accessibility.js` loads before `widgets.js`, so `ToggleButtonMorph` isn't defined there. Let me handle `aria-pressed` inline in `widgets.js` `refresh` instead (gated on a flag), and remove the dead extension.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
**🤖 Claude:**

Now the menu-trigger `aria-expanded` toggle (so the buttons that open menus reflect open/closed state):

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now the button-tagging methods in gui.js (inserted after `orderAccessibleRegions`):

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now sort the tab ring by screen position so the buttons Tab in a natural order:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me syntax-check all modified files and bump the `widgets.js` cache version (I edited it).

- 🔧 `Bash` → node --check src/accessibility.js && node --check src/gui.js && node --check src/widgets.js && echo "OK all va…
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/snap.html
**🤖 Claude:**

Let me reload Snap! and verify the regions and buttons.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. Let me inspect the updated regions and the new accessible buttons.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Regions are all correct — Control Bar now spans full width (0,0 583x28) with the logo nested inside it, plus the two new toolbars (8 regions total). Buttons are mostly working with `aria-pressed` on categories (Motion=true) and `aria-haspopup` on menu openers. But **Pause and Stop are missing** from the tab order. Let me debug why.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The Pause/Stop buttons have *negative* `visibleBounds` — they're clipped off the right edge because the preview window is narrow (the control bar overflows). `focusableMorphs` correctly excludes off-screen morphs. Let me confirm by widening the window.

- 🔧 `mcp__Claude_Preview__preview_resize`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The world is only 475px wide despite the 1300px viewport — `fillPage` didn't pick up the resize. Let me force it.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

All 15 buttons are now tabbable once the window is wide enough (the earlier exclusion was correct — they were genuinely off-screen). The full set: 4 menu openers (`aria-haspopup`), Green Flag, Pause/Stop (`aria-pressed`), and 8 category buttons (`aria-pressed`, Motion=true). Now the critical test — do they **activate**, toggle `aria-expanded`, and switch categories?

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Everything works perfectly:
- **Settings menu button** → opens the menu, `aria-expanded` → **true**, focus moves into the menu; **Esc** → closes, focus returns to the button, `aria-expanded` → **false**.
- **Category button** (Control) → actually switches category (`currentCategory: "control"`), `aria-pressed` flips (Control=true, Motion=false).

Let me confirm visually with the focus ring on a button, and check for warnings.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

Focus ring renders on the Green flag button, no warnings. Let me capture the visual.

- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The screenshot confirms it all: the palette switched to **Control** blocks (category activation worked), and there's a **blue focus ring around the Green flag button** (top-right). The full IDE renders correctly. Let me mark the tasks done and record this.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

All done and verified. Let me get a final summary of the changes.

- 🔧 `Bash` → git diff --stat && echo "--- new files ---" && git status --short | grep '^??'
**🤖 Claude:**

Both region fixes and button accessibility are complete and verified, with no regression (console clean, `morphic.js`/`widgets.js` changes are purely additive).

## Regions (now 8)
- **Control Bar** now spans **100% width** (0,0 → full width), with the **Snap! app menu (logo) nested inside it** — so VoiceOver's outline ring covers the whole bar, including the app menu. (Implemented via a new `Morph.a11yBounds()` hook that lets a landmark present a custom rectangle.)
- **Scripting Area Toolbar** (sprite name + editor tabs) — new region.
- **Sprite Corral Toolbar** (the bar above the corral) — new region.
- Regions are now excluded from the Tab ring (they're landmarks you jump to, not tab stops).

## Buttons (15 tabbable)
All `role="button"` with localized labels, focusable and **Tab-able** in screen-position order:

| Button(s) | ARIA |
|---|---|
| Snap! menu, Project menu, Cloud menu, Settings menu | `aria-haspopup="menu"` + `aria-expanded` (toggles open/closed) |
| Green Flag | button |
| Pause, Stop | `aria-pressed` |
| 8 category buttons (Motion…Variables) | `aria-pressed` (the selected one = true) |

**Verified behavior:**
- Activating a menu button (Enter/Space/AT click → native `click` → the button's action) **opens its menu**, moves focus into it, and sets the trigger's `aria-expanded=true`; **Esc** closes it, returns focus to the button, and sets `aria-expanded=false`.
- Activating a **category button** actually switches the category (`currentCategory` → "control") and updates `aria-pressed` across the group.
- The **blue focus ring** renders on keyboard-focused buttons (screenshot showed it on the Green flag).
- `aria-pressed` stays in sync via a one-line hook in `ToggleButtonMorph.refresh`.

The server's at **`http://localhost:8765/snap.html`** — Tab through the toolbar/categories and try the menus with VoiceOver/NVDA.

## Two small notes
1. **Label wording:** I labelled the file/project button **"Project menu"** (it opens New/Open/Save…). You called it "File Menu" — easy to rename if you prefer that exact wording.
2. **Preview quirk (not a bug):** the preview's window-resize didn't auto-trigger Snap's `fillPage`, so buttons near the right edge were briefly clipped (and correctly hidden from AT) until I forced a relayout. A real browser fires resize normally, so all buttons stay visible/tabbable.

Want me to (a) rename "Project menu" → "File menu", (b) refine category buttons into a proper `tablist`/`radiogroup`, or (c) move on to **exposing contents inside a region** — e.g. making the palette blocks or the scripting area reachable by AT?

## 🧑 Michael

Great work!

A few small fixes:

* let's use `<section>` tags for the regions
* can we draw round blue focus rings that hug the buttons more?
* let's ensure all other UI buttons are focusable (stage size, single stepping), controls in the corral tool bar
* 
Categories Selector

*  One tabstop with an arrow key (up/down) radiogroup sounds good

Blocks Palette

* Each block should be an arrow up/down in a list of N items
* search/+/make a block/visibility checkboxes should all be tap stops
* We will want to add aria-descriptions to a block "press enter to activate the block"
* First pass on the blocks title should be to read the visible text then "argument (...)" ... 


Scripting Area:

* Let's render all stacks of blocks. 
* We will want tabbing/moving to a new stack of blocks to speak the first block

**🤖 Claude:**

Excellent set of improvements. This is a big list spanning quick polish to deep block exposure. Let me tackle it in order, verifying as I go — starting with the quick fixes (sections, rounded rings, remaining toolbar buttons) and the categories radiogroup this round, then the palette/scripting work which needs block-morph exploration.

Let me study the remaining toolbar buttons and the category/palette structure.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && echo "=== corralBar buttons ===" && sed -n '2449,2540p' sr…
**🤖 Claude:**

This is a large, multi-part request. I'll do the quick fixes + Categories radiogroup this round (they build on the toolbar work), then tackle the Blocks Palette and Scripting Area exposure next, since those need block-morph exploration. The remaining toolbar buttons are clear: `stageSizeButton`/`appModeButton`/`steppingButton` (control bar) and the corral-bar buttons have `hint`s I can use as labels.

Let me set up tasks and implement.

- 🔧 `TaskCreate` → Use <section> tags for regions; rounded focus ring hugging buttons; make stageSize/appMode/stepping + corral-b…
- 🔧 `TaskCreate` → categories = role=radiogroup (one tab stop), category buttons = role=radio with aria-checked, up/down arrow na…
- 🔧 `TaskCreate` → Palette = list, each block = listitem/option with arrow up/down nav; block title reads visible text then 'argu…
- 🔧 `TaskCreate` → Render all stacks of blocks in the scripting area; tabbing/moving to a new stack speaks its first block. (Next…
- 🔧 `TaskUpdate`
**🤖 Claude:**

Let me make the quick fixes: `<section>` regions, rounded focus rings, and the remaining toolbar buttons.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now set the ring's corner radius per target, and add the remaining toolbar buttons:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now Change 4 — the categories radiogroup. Let me update `accessibleRegions` (remove categories), add the radiogroup methods, fix the label newline-stripping, and extend the refresh hook for `aria-checked`:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
**🤖 Claude:**

Now add the categories radiogroup methods:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me restart the preview server and test all four changes.

- 🔧 `mcp__Claude_Preview__preview_start`
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. Let me widen the window and verify all four changes — sections, rounded rings, the new buttons, and the categories radiogroup.

- 🔧 `mcp__Claude_Preview__preview_resize`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

All four changes are working:
- **`<section>` regions** (7 sections) ✓
- **Categories radiogroup** ✓ — `role=radiogroup`, one tab stop, 8 `role=radio` children with `aria-checked` (Motion=true), `aria-activedescendant` set.
- **More buttons** ✓ — Visible stepping, Stage size, Presentation mode, and corral-bar buttons (add Turtle, paint, camera).

One cleanup: there's an unlabelled corral button showing as **"Button"** (no hint). Let me skip unlabelled buttons rather than expose a bare "Button", then verify the radiogroup arrow navigation and the rounded ring visually.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me reload and verify the radiogroup arrow navigation works, then capture the rounded ring visually.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The categories radiogroup works: one tab stop, **arrow down/up moves AND switches the category** (Motion→Looks→Sound→Looks), with `aria-checked` and `aria-activedescendant` updating live. The ring is now rounded (radius 14 for the green flag), and the bare "Button" is gone. Let me capture the rounded ring visually.

- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The palette switched to Looks (purple blocks) — confirming the radiogroup category switch works visually. The screenshot is scaled down so the ring is tiny, but `cornerRadius=14` confirms it's rounded. Let me confirm no warnings and that mouse interaction still works.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No warnings. Changes 1–4 are complete and verified. Let me mark them done and record the progress.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Done with the quick fixes + Categories radiogroup, all verified in Snap! with no warnings.

## ✅ This round

**Sections** — all 7 landmark regions now use real `<section aria-label="…">` tags (implicit region landmarks).

**Rounded focus rings** — the ring is now a rounded rectangle whose corner radius matches the target's own rounding (e.g. radius 14 on the green flag), so it hugs buttons cleanly. (I kept a 2px gap; easy to tighten further if you want it even closer.)

**Remaining toolbar buttons now focusable/tabbable:**
- Control bar: **Stage size**, **Presentation mode**, **Visible stepping** (with `aria-pressed`).
- **Corral toolbar**: add-Turtle, paint, camera (labelled from their hints; unlabelled buttons are skipped rather than announced as a bare "Button").

**Category selector → radiogroup** — now **one tab stop** (`role=radiogroup`), with 8 `role=radio` children (`aria-checked`). **↑/↓ (and ←/→) move *and* switch the category** — verified Motion→Looks→Sound→Looks with the palette actually changing and `aria-checked`/`aria-activedescendant` following.

## ⏭️ Remaining (the two big ones)

These need deeper block-morph work, so I'll do them as focused passes next:

**Blocks Palette** (`#14`): make the palette a single tab stop containing an arrow-navigable **list of N blocks**; each block read as **visible text + "argument (…)"** for its input slots, with an `aria-description` "press Enter to activate"; and make **search / + / make-a-block / visibility checkboxes** their own tab stops.

**Scripting Area** (`#15`): expose every **stack of blocks**; moving to a new stack speaks its **first block**.

Both require parsing `BlockMorph` structure (labels + input slots) and walking `ScriptsMorph` — meatier than today's toolbar work, but the focus/list/activedescendant machinery is all in place now.

Want me to go ahead with the **Blocks Palette** next?

## 🧑 Michael

yes, start on the blocks palette and then make sure blocks in the scripting area get spoken too

**🤖 Claude:**

Let me explore the palette contents structure (at runtime) and the `BlockMorph` API for extracting a block's text/arguments.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The palette has CommandBlockMorph/ReporterBlockMorph blocks (with `parts()` = label morphs + slots), plus ToggleMorph checkboxes and a "Make a block" PushButton. Let me nail down a few more things — the scroll-into-view method, the ToggleMorph state, the search/+ buttons, and the ScriptsMorph (scripting area) structure — before implementing.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Key findings: palette has `scrollIntoView`, `ToggleMorph` has `state`+`refresh`, and `ide.spriteEditor.contents` is the `ScriptsMorph` (top blocks would be its `BlockMorph` children). Let me implement the palette: `palette.contents` becomes a listbox of block options, with the make-a-block button and checkboxes as separate tab stops nested in the palette region.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now wire `setAccessiblePalette` into `setAccessibleRegions` and add a `ToggleMorph.refresh` hook for the checkbox `aria-checked`:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && grep -n "ToggleMorph.prototype.refresh = function\|ScrollF…
**🤖 Claude:**

`ToggleMorph.refresh` is at widgets.js:1339. Let me read it to add the `aria-checked` hook.

- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/widgets.js
**🤖 Claude:**

Let me reload and verify the palette is now a navigable listbox of block options.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The palette is a working listbox: 17 block options with titles reading **visible text + "argument (value)"** ("move argument (10) steps"), `aria-description` "Press Enter to activate the block", and the make-a-block button + 3 checkboxes as separate tab stops. Let me verify arrow navigation, scroll-into-view, and Enter activation.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Arrow navigation, scroll-into-view (reached "y position", now visible), and Enter activation all work with no errors. One refinement: with `activedescendant`, the focus ring currently hugs the whole listbox, not the current block. Let me make the ring follow the active block/radio (like the menu follows its selection).

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

The ring now follows the active block/radio. Now the **Scripting Area** — expose each stack (top block) as an option that speaks its first block. Let me add the scripts methods (mirroring the palette) and wire them in.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me reload, add a few script stacks to test, and verify navigation speaks the first block of each.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. The scripting area is empty in a fresh project, so let me add a couple of stacks and verify navigation announces each stack's first block.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Navigation between stacks works (each speaks its first block: "move…", "point in direction…", "go to…"), but `querySelectorAll('[role=option]')` found no option elements — the stack elements may not be created or nested correctly. Let me debug.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Found a real bug: blocks dragged/copied from the palette inherit the template's `a11yElement`/`a11yId` via `fullCopy`, so copied blocks (in the scripts) carry stale, shared a11y state — that's why the stack options weren't nesting correctly. I need to reset stale a11y state on copies. Let me fix `createAccessibleElement` to detect and reset it, add a validity check, and update the taggers.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now update the taggers to use `a11yIsTagged()` and create the element before assigning the id:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me reload, re-add stacks, and verify the option elements now nest correctly under the scripts listbox.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The options nest correctly now, but ids aren't unique — `fullCopy` copies the `a11yId` string (not just the element ref), so I need to explicitly clear the inherited a11y state when re-tagging a non-owned morph. Let me reset all three references in the taggers.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me reload and verify the ids are now unique.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Still not unique — the deeper issue is that the *copied* block inherits `isAccessible=true`, so the `addChild` reconcile creates an element for it prematurely (with the palette's inherited role/label/no-id), and then the tagger sees it as "already tagged" and skips it. The clean fix is to reset a11y state when a morph is copied. Let me find the copy method.

- 🔧 `Bash` → grep -n "^Morph.prototype.copy = function\|^Morph.prototype.fullCopy = function\|Morph.prototype.updateReferen…
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

The fix belongs in `Morph.prototype.copy` (the single choke point for all copies) — a copy must not inherit accessibility state. Let me reset it there.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

Let me reload and verify the stack options now have unique ids and navigation works correctly.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Everything works now — unique ids, no blanks, correct nesting, and navigation announces each stack's first block ("move argument (10) steps" → "point in direction argument (90)"). The copy-reset fix also makes real palette→scripts drags work. Let me confirm no errors/warnings and capture it visually.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The scripting area now shows the 3 stacks, and the palette ring is on the current block. Both the **Blocks Palette** and **Scripting Area** are working, with no errors or warnings. Let me mark the tasks done and record this.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Both the Blocks Palette and Scripting Area are working and verified. Here's the summary.

## ✅ Blocks Palette
- **`palette.contents` → an ARIA listbox** ("Blocks"), one tab stop, navigated with **↑/↓**, using `aria-activedescendant`.
- **Each block → a `role=option`** whose title reads **visible text + "argument (value)"** — e.g. *"move argument (10) steps"*, *"point in direction argument (90)"* — with `aria-description` **"Press Enter to activate the block"**.
- **Enter activates** (runs) the current block; navigating **scrolls it into view** and the **focus ring hugs the current block**.
- **Make-a-block button + the visibility checkboxes are separate tab stops** (nested in the palette region, not inside the listbox).

## ✅ Scripting Area
- **`spriteEditor.contents` (ScriptsMorph) → a listbox** of stacks; **each stack → an option labelled with its first block**.
- Moving between stacks (↑/↓) **speaks the first block** (verified: "move…" → "point in direction…" → "go to…"), Enter runs the stack, ring follows.

## 🐛 Key fix (important for real use)
Blocks dragged/copied from the palette were inheriting the template's `a11yElement`/`a11yId` via `fullCopy`, causing **duplicate/blank ids and broken nesting**. I fixed `Morph.prototype.copy` to **reset all a11y state on any copy** — so a dragged block starts fresh and gets re-tagged for its new context. Verified: script options and palette options now have **unique, non-blank ids** with correct nesting, and no Snap regression.

## Known first-pass limitations (noted for later)
- Palette **checkbox labels are generic** ("show or hide") — should pull the watcher's variable name.
- **Search / "+" buttons** aren't tagged yet (couldn't cleanly locate them).
- You navigate **stacks** in the scripting area, but not yet **block-by-block within a stack**.
- Scripts re-tag on `fixLayout` (frequent, but not literally per block-drop) — fine in practice, could be hooked tighter.

The server's running at **`http://localhost:8765/snap.html`** — Tab to the palette and arrow through the blocks (each reads its text + arguments), and drop a few blocks in the scripting area to hear stacks announced. Want me to refine any of the limitations above (checkbox names, search/+ buttons, or in-stack block navigation) next?

## 🧑 Michael

@"/Users/michael/Desktop/Sp22 | Project 1 2048 Skeleton.xml"
OK, much progress.

* Overall fix: When I click (say in the palette) then hit `tab` the palette should become the next focused block, like the browser does with links. 
* Please outline the block palette area when you initially tab to it. Ensure the label includes the category name

* for the blocks palette include function called 'templateLabel'  The template label actually should **not** read the block arguments when in the palette. in accessibility.js include a block Selects -> templateLabel map that allows us to write custom names for blocks. Let this empty except for the control 'for i' block which should say 'for i loop' as an initial example. [We will customize over time]
* Attached is an XML for a demo project. Start using this so we can read the scripts in the scripting area. 

Editor Navigation:
We will need to be very careful overtime about finding accessible editing flows. For now:

* Each distinct script should be a tab stop
* Each script should read the top block's name (with arguments) and N blocks. 
* We should navigate using arrow keys, through the entire stack of blocks. L/R should go through the arguments in a single 'line' or to the next/previous line
* Be sure to highlight each block as we tab through it.

**🤖 Claude:**

This is a substantial set of features. Let me start by loading the demo project (so I can develop against real scripts) and understanding the block-stack traversal API, then work through the list.

- 🔧 `Bash` → ls -la "/Users/michael/Desktop/Sp22 | Project 1 2048 Skeleton.xml" 2>/dev/null && echo "--- size ok ---" && he…
- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && echo "=== block stack traversal ===" && grep -n "BlockMorp…
**🤖 Claude:**

85KB project file, `doFor` is the for-loop selector, and there are `blockSequence`/`nextBlock` traversal methods. Let me copy the project into the dev dir (to load it for testing) and read the block traversal + inputs API.

- 🔧 `Bash` → cp "/Users/michael/Desktop/Sp22 | Project 1 2048 Skeleton.xml" /Users/michael/Dropbox/Projects/snap/snap-dev/2…
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/blocks.js
**🤖 Claude:**

85KB project copied to `snap-dev/2048.xml`, `doFor` is the for-loop selector, and `blockSequence()` gives a stack's command blocks. This is a large set of features — I'll work through them and verify against the loaded project.

Let me start with the accessibility.js core changes: the template-label map, click-to-focus anchoring, and a `keepNativeFocus` option.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `TaskCreate` → On mouse click, set focusedMorph to the nearest tab-stop ancestor (no native-focus steal, no ring) so Tab cont…
- 🔧 `TaskCreate` → templateLabel uses A11yBlockTemplateLabels map (doFor->'for i loop') else visible words without arguments; out…
- 🔧 `TaskCreate` → Each script = tab stop announcing top block (with args) + N blocks; up/down through all blocks in the stack; L…
- 🔧 `TaskUpdate`
**🤖 Claude:**

Now the `keepNativeFocus` option and `focusFromClick`:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now hook `focusFromClick` into the pointer listener (guarding non-mouse events):

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Now the gui.js palette changes — `templateLabel` (no args, with the selector map), category-aware label, outline-on-focus, and click-to-set-active-block:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me reload, load the 2048 project, and test the palette refinements + click-focus.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. Let me load the 2048 project and test the palette refinements (templateLabel, category label, outline).

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Palette refinements all work: `templateLabel` reads visible text **without** arguments ("when clicked", "when key pressed"), the **"for i loop"** custom label applies, the label includes the **category** ("Motion blocks" → "Control blocks"), and the palette is **outlined on focus** (no active descendant). 

The 2048 project loaded. Now the editor navigation — let me explore the loaded scripts' structure (top blocks, inputs, C-slots) to build the traversal.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The current sprite's scripts are empty — let me find where the project's scripts actually are.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The 2048 skeleton has no sprite scripts (its content is likely in custom blocks). Let me check that and build a representative nested script (with a C-slot) to develop the traversal against.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The structure is clear: `top.allChildren().filter(CommandBlockMorph)` gives the lines (DFS), `block.inputs()` gives args (with `CSlotMorph` for nested stacks), and the for-loop assembled correctly. Now let me rework the scripting area for the editor navigation. Let me read the current scripts methods to replace them.

- 🔧 `Bash` → awk '/IDE_Morph.prototype.scriptStacks = function/{s=NR} /IDE_Morph.prototype.handleScriptsKey = function/{f=N…
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now I'll replace the scripting-area section with the editor-navigation model: each script is a tab stop (a focusable group), up/down moves through blocks, left/right through arguments, with highlighting.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me reload, rebuild a test script, and verify the editor navigation (scripts as tab stops, up/down through blocks, L/R through arguments, highlighting).

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No errors. Let me build test scripts (the project has no sprite scripts) and verify the editor navigation.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The editor navigation works: each script is a tab stop ("when clicked, 3 blocks"), up/down moves through blocks (including the nested "move" in the C-slot), and left/right moves through arguments ("argument (10)"). One label fix: the C-slot is being read as "argument ()" — it shouldn't be (it's the nested stack). Let me exclude C-slots from the block label.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me make `focusFromClick` use viewport-relative coordinates (more robust than `pageX`):

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me reload and run a combined test: click-to-focus, the corrected block label, and the editor-nav ring.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Click-to-focus works (clicking the Settings button focuses it, clicking a palette block focuses the listbox + sets the active block), and the label fix is good ("repeat argument (10)"). But the editor-nav `currentItem` stayed null after the down key — let me debug whether the handler ran.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Direct call works perfectly (`currentItem: "repeat argument (10)"`, treeitem nested under the script). The earlier null was likely from the prior clicks leaving state. Let me verify the real `document` keydown path works cleanly (no prior clicks), plus full up/down/left/right navigation.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The document-dispatch path isn't routing to the script handler now (but the direct call works). Let me diagnose what's intercepting in `handleA11yKeydown`.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Found it: `a11yTextEditing` is stuck `true` (a `CursorMorph` edit is active), and my guard returns early regardless of where focus actually is. Two fixes: (1) only defer to text editing when the hidden textarea actually holds focus, and (2) end any active edit when focus moves to a non-text morph.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Let me reload and re-test the full editor navigation via the real keydown path.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The editor navigation works end to end: Tab to a script ("when clicked, 3 blocks"), **down/up through blocks** (including the nested "move"), **left/right through arguments** ("argument (10)") and to the next/previous line, with the **ring highlighting each block**. Let me confirm no errors and that normal text editing still works, then capture it.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
**🤖 Claude:**

No warnings. Let me capture the editor navigation visually — a script with a block highlighted.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The ring is on a block ("move…"). Let me capture it.

- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The screenshot confirms it: the script renders ("when clicked → repeat (10) [ move (10) steps ]") with the **rounded blue ring on the "move 10 steps" block** — the editor highlight works. Everything from this round is functional. Let me mark the tasks done and record it.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

All of this round's features are implemented and verified. Here's the summary.

## ✅ Overall fix: click sets the focus anchor
Clicking anywhere now sets the Tab anchor like a browser does with links — `focusFromClick` walks up from the clicked morph to the nearest tab stop and focuses it (no ring, no native-focus steal). Verified: clicking the **Settings** button focuses it; clicking a **palette block** focuses the palette listbox *and* makes that block the active one. **Tab continues from where you clicked.**

## ✅ Blocks Palette
- **`templateLabel`** — palette blocks now read their **visible text without arguments** ("when clicked", "when key pressed"), via a **selector→label map in `accessibility.js`** (`A11yBlockTemplateLabels`), seeded with **`doFor` → "for i loop"** (extend over time).
- **Outline on initial Tab** — the whole palette is ringed when you first Tab to it; the first arrow enters the blocks.
- **Category in the label** — "Motion blocks", "Control blocks", etc.

## ✅ Editor Navigation (scripting area)
- **Each script is its own tab stop** (role=group), announced as **"&lt;top block with arguments&gt;, N blocks"** (e.g. "when clicked, 3 blocks").
- **↑/↓ move through every block** in the stack, including blocks nested in C-slots (repeat → move).
- **←/→ move through a block's arguments** ("argument (10)"), and to the next/previous line at the ends.
- **Each block is highlighted** with the rounded ring as you move (screenshot confirmed the ring on "move 10 steps").

## 🐛 Key fix
A stuck `a11yTextEditing` flag was silently blocking *all* arrow navigation. Fixed: the text-edit guard now only defers while the hidden textarea actually holds focus, and moving to a non-text morph ends any active edit (browser-like).

## Notes on the 2048 project
I copied it to `snap-dev/2048.xml` and load it for testing — but it has **no sprite scripts**; its content is in **custom block definitions**. So I developed/verified the editor nav against scripts I built programmatically. Making the **custom-block editor** accessible (so the 2048 skeleton's actual code is readable) is a distinct, larger piece.

## Remaining (noted for later)
- Palette **search / "+" buttons** still untagged.
- Script labels **refresh on `fixLayout`**, not the instant a block is dropped.
- **In-block editing** flows (entering values), and the **custom-block editor**.

Server's at **`http://localhost:8765/snap.html`**. Want me to tackle the **custom-block editor** (to read the 2048 skeleton's real code) or **in-block editing** next?

## 🧑 Michael

@"/Users/michael/Desktop/Sp22 | Project 1 2048 Skeleton.xml"
Note for later: Toggle switches in the palette appear out of order, and they will need to be associated with the label for their

Some progress! Dropping that XML file onto snap results in an error 'null is not an object' on aNode.destroyAccessibleElementTree

* The Scripting Area does not seem to be a tab stop this should work.
* I should be able to click on the scripting area then press `tab` then see the focus ring around the scripting area or actual scripts
* Revise my notes about tabbing between stacks of blocks: TAB should tab within the open / selectable inputs of blocks within the script first THEN at the end of a script, tab should tab to the 'next' script

**🤖 Claude:**

Three things: a crash to fix, the scripting area as a tab stop, and a revised TAB model. Let me start with the **crash** — `removeChild(null)` hits my hook (the original tolerated null). Let me make all the tree hooks null-safe.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/morphic.js
**🤖 Claude:**

Now make the tree recursions null-safe in accessibility.js:

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/accessibility.js
**🤖 Claude:**

Crash hooks are null-safe now. Now the bigger rework: the **scripting area itself** should be the tab stop, with **TAB moving through the scripts' inputs** (then to the next script), Up/Down through blocks, and the area focusable even when empty. Let me find the current scripting-area section to replace it.

- 🔧 `Bash` → cd /Users/michael/Dropbox/Projects/snap/snap-dev && awk '/IDE_Morph.prototype.scriptLines = function/{s=NR} /I…
- 🔧 `Read` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Now I'll replace the scripting-area section with the new model — the ScriptsMorph as the single tab stop, TAB through inputs (then next script), Up/Down through blocks.

- 🔧 `Edit` → /Users/michael/Dropbox/Projects/snap/snap-dev/src/gui.js
**🤖 Claude:**

Let me track this round and verify — reload, confirm the project loads without crashing, and test the scripting area as a tab stop.

- 🔧 `TaskCreate` → removeChild(null)/tree recursions now null-safe so dropping a project XML doesn't throw on destroyAccessibleEl…
- 🔧 `TaskCreate` → ScriptsMorph is one focusable tab stop (even when empty); Tab/Shift+Tab step through scripts' inputs (header t…
- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Project loads cleanly. Let me confirm no errors and test the scripting area as a tab stop — empty first, then with scripts.

- 🔧 `mcp__Claude_Preview__preview_console_logs`
- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The scripting area is now a tab stop (`role="tree"`, "Scripting area, N scripts", focusable even when empty) — and the **2048 project's real scripts loaded** (6 scripts via `openProjectString`). Tab steps through script headers + inputs ("when I receive (start game), 9 blocks" → its inputs), Down moves to blocks, ring highlights. Let me verify the click→Tab flow the user described.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

The click→Tab flow works (click area → focus it, Tab → first script with ring). The exit test was flawed — my synthetic event lacked `key='Tab'` (which the fallthrough Tab nav checks). Let me re-verify with a proper Tab event.

- 🔧 `mcp__Claude_Preview__preview_eval`
**🤖 Claude:**

Tab now exits at the boundaries correctly (forward → "Motion blocks", Shift+Tab from start exits backward). Everything works, and the **2048 project's real scripts are readable**. Let me capture it visually with a block highlighted.

- 🔧 `mcp__Claude_Preview__preview_eval`
- 🔧 `mcp__Claude_Preview__preview_screenshot`
**🤖 Claude:**

The 2048 project loaded with all its real scripts — the scripting area shows the actual code ("when I receive [start game]", "set GAME BOARD to…", etc.), the stage shows the 4×4 board, and navigation reached "set SIZE to 4" with the ring. Everything works. Let me record this round.

- 🔧 `TaskUpdate`
- 🔧 `TaskUpdate`
- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Everything is fixed and verified. Here's the summary.

## 🐛 Crash fixed
Dropping a project crashed on `removeChild(null) → destroyAccessibleElementTree` (the original tolerated `null`, my hook didn't). All the tree hooks are now null-safe. The 2048 project loads cleanly — and importantly, **its 6 real scripts now load and are readable** (use `openProjectString`, not `rawOpenProjectString`).

## ✅ Scripting area is now a tab stop
- The scripting area (`ScriptsMorph`) is a single focusable tab stop (`role="tree"`, "Scripting area, N scripts"), **even when empty**.
- **Click the scripting area → press Tab → the ring appears** (verified: click anchors it, Tab enters the first script with the ring shown).

## ✅ Revised Tab model (per your note)
- **Tab / Shift+Tab** now step through the **selectable inputs within a script** — each script's top block is announced first ("when I receive (start game), 9 blocks"), then its inputs ("argument (start game)", "argument (SIZE)"…), and at the **end of a script Tab moves to the next script**. Past the very last input, Tab **exits** the scripting area to the next control.
- **Left / Right** do the same traversal but stay inside the area.
- **Up / Down** move between blocks (lines).
- Each block/input is highlighted with the ring as you go.

Verified against the real 2048 scripts (navigated to "set GAME BOARD to…", "set SIZE to 4", etc.).

## 📝 Noted for later
- **Palette toggle/visibility checkboxes** appear **out of order** and need to be **associated with their variable's label** — captured in my notes for a future pass (they're currently labelled generically and follow DOM insertion order).
- Still pending: palette **search / "+"** buttons, **live label refresh** when scripts change, **in-block editing**, and the **custom-block editor** (the 2048 skeleton's tasks live in custom blocks).

The server's at **`http://localhost:8765/snap.html`** with the 2048 project loaded — click into the scripting area and Tab/arrow through the real scripts with a screen reader. Want me to tackle the **palette checkbox ordering + variable labels** next, or the **custom-block editor** so the skeleton's task blocks are navigable?

## 🧑 Michael

OK, some notes to log but not to fix yet:

* In the VO rotor it would be nice to see the current palette's list of blocks as a list
* Tabbing between scripts should outline either the whole script or at least the top block 
* We will need to make a keyboard only edit mode which turns off key reciever hat blocks
* Tabbing should more clearly highlight the current block in the scripting area.

We are hitting the context limit for this chat. Please draft accessibility-prototype.md 
Include everything relevant to pick this up in the future.  Include TODO notes, summaries, reference links


Some minor notes / fixes to start with:

* Clicking an element in Snap! then hitting tab doesn't focus correctly / clicking on any block needs to move the focus to that block 
* Using arrow keys in a stack of blocks should select all types of blocks/inputs.
* When using the existing keyboard editing mode we need to make sure blocks in the search pane are read outloud
* IF you have a block focused and you hit shift-enter to start keyboard editing mode, then the cursor should arrive at the focused block, or just below it. 
* Each script/stack of blocks should show up as a navigable list item OR landmark region or something in the VO rotor.

**🤖 Claude:**

We're at the context limit, so let me capture everything in a thorough handoff document. I'll draft `accessibility-prototype.md` in the `snap-dev` directory (alongside the code), covering the architecture, file map, APIs, gotchas, all the TODOs/notes you've logged, and references.

- 🔧 `Write` → /Users/michael/Dropbox/Projects/snap/snap-dev/accessibility-prototype.md
**🤖 Claude:**

The handoff doc is written. Let me point the persistent memory at it and log the new notes so a future session finds them.

- 🔧 `Edit` → /Users/michael/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.…
**🤖 Claude:**

Done. I've drafted the handoff and logged all your notes — no code changes this round (as you asked).

## 📄 `snap-dev/accessibility-prototype.md`
A comprehensive, self-contained reference to pick this up later. It covers:

- **TL;DR of what works** (core layer, menus, landmarks, toolbar/categories, palette, scripting area).
- **How to run & test** — the no-cache dev server, the standalone demo, loading `2048.xml` (use `openProjectString`), and preview-tool snippets (incl. the synthetic-event / preview-focus quirks).
- **Architecture** — the parallel invisible DOM tree, `world.focusedMorph` vs `keyboardFocus`, two-way sync, the focus-visible ring, and **the composite-widget pattern** (the reusable shape behind menus/radiogroup/listbox/scripts).
- **File map** — what's in `accessibility.js`, the guarded `morphic.js` hooks, `widgets.js`, `gui.js`, `snap.html`, the demo, the server.
- **Per-area implementation notes** and an **API cheat-sheet**.
- **Gotchas/lessons** — load order (accessibility.js before widgets/blocks), `Morph.copy` must reset a11y state, `MenuMorph.world` is a property → `a11yWorld()`, the stuck text-edit guard, caching, null-guards, synthetic-key needs `key:'Tab'`.
- **Reference links** — ARIA APG (menu/listbox/radiogroup/tree/combobox/landmarks), ARIA-in-HTML, `:focus-visible`, Flutter web semantics, Snap!/Morphic source, VoiceOver/NVDA testing.

## 📝 Notes logged (in the doc's TODO section + memory)

**Start here (next session):**
1. Clicking any block must move focus to that block; click→Tab focus is still off.
2. Arrow keys in a stack should reach **all** block/input types (reporters, predicates, hats, every slot).
3. Existing keyboard-editing mode: read **search-pane** blocks aloud.
4. **Shift+Enter** on a focused block → start keyboard editing at/just below that block.
5. Each script/stack should be a list item / landmark in the **VO rotor**.

**Logged (not yet):** VO rotor showing the palette as a list; tabbing between scripts outlines the **whole script** (top block `fullBounds`); a **keyboard-only edit mode** that disables key-receiver hat blocks; clearer current-block highlight. Plus the earlier carry-overs (palette checkbox order + variable labels, search/+ buttons, live label refresh, the **custom-block editor** — where the 2048 tasks actually live).

The memory file now points to `accessibility-prototype.md` as the canonical reference, so a future session will find everything. Good place to pause given the context limit — pick up from the "Start here" list.

