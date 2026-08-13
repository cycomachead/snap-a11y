# Snap! + Morphic — Screen-Reader / AT Accessibility Prototype

A working prototype that makes Snap! (and the Morphic framework under it) usable with
screen readers / assistive technology (AT), **without abandoning Morphic's canvas-first
design**. It builds a parallel, invisible DOM tree that mirrors the morphs we choose to
expose, kept two-way-synced with Morphic state, and leverages the browser's native
focus / tab / ARIA machinery rather than reinventing it.

This document is the handoff: architecture, file map, APIs, how to run/test, the gotchas
we hit, and the prioritized TODO list. Read it before touching the code.

---

## 0. TL;DR — what works today

- **Morphic core a11y layer** — global focus (`world.focusedMorph`), per-morph parallel DOM
  nodes (opt-in), two-way focus sync, roving + `aria-activedescendant` navigation, a
  keyboard-only **2px rounded blue focus ring** (focus-visible semantics), click-to-anchor
  focus.
- **Menus** — every Snap! `MenuMorph` (right-click dev menu, project/settings/etc., dropdowns)
  is an ARIA menu: `role=menu/menuitem`, `aria-haspopup`/`aria-expanded`, item counts, arrow +
  Tab nav, Esc steps back one level, focus returns to the trigger.
- **IDE landmarks** — 7 `<section>` regions (control bar incl. the Snap! logo/menu, block
  palette, scripting-area toolbar, scripting area, stage, sprite-corral toolbar, sprite corral).
  App entry point labelled **"Snap! - &lt;Project Name&gt;"**.
- **Toolbar + categories** — control-bar buttons (menus, green flag, pause/stop, stage size,
  presentation, single-stepping) and corral buttons are focusable/tabbable with `aria-pressed`/
  `aria-haspopup`/`aria-expanded`. The category selector is one tab stop, a **radiogroup** with
  up/down arrow navigation + `aria-checked`.
- **Block palette** — a listbox: each block is an option, navigated with up/down arrows; titles
  read the **template label without arguments** (with a selector→label override map); the whole
  palette is outlined on first focus; label includes the category. Make-a-block + visibility
  checkboxes are separate tab stops.
- **Scripting area** — one tab stop (`role=tree`, focusable even when empty). **Tab/Shift+Tab**
  step through the scripts' inputs (each script's top block is announced, then its inputs, then
  the next script; Tab exits past the last input). **Up/Down** move between blocks. **Left/Right**
  do the same as Tab but clamped. Enter runs the current script. The current block/input is
  ring-highlighted.
- **Dialogs** — every `DialogBoxMorph` is an ARIA modal dialog (title + message read out,
  `aria-modal`, real focus trap, focus returned to the opener on close). Tab moves between a
  dialog's search field, its list views and every button; Esc cancels, Enter accepts. The
  **Import library** and **Open / Save project** dialogs declare their own tab order and names.
- **List views** — `ListMorph` (project, library, block lists, the inspector) is a listbox: one
  tab stop, up/down + Home/End, selection follows focus, Enter runs the default action.
- **No Snap! regression** — the layer is inert until a morph opts in; the full IDE works; the
  2048 demo project loads and its scripts are readable.

Everything has been verified programmatically + visually in Chrome via the preview tools.
**Real screen-reader testing (VoiceOver / NVDA / JAWS) is still the main outstanding validation.**

---

## 1. How to run & test

### Dev server (important: caching)
`snap.html` loads `src/*.js` with `?version=DATE` query strings — editing a file does **not**
bust that cache. Use the **no-cache dev server**:

- `.nocache_server.py` (repo root) — a Python static server that sends `Cache-Control:
  no-store` and serves this repo on port **8765**.
- Wired into this repo's `.claude/launch.json` as the `snap-a11y-static` config.
- Run it (Claude Code preview): start the `snap-a11y-static` server, then open
  `http://localhost:8765/snap.html`. Or just: `python3 .nocache_server.py`.
- If a file still looks stale, bump its `?version=` in `snap.html` once (edited files are
  currently at `2026-07-03` / `2026-08-07`).

### The standalone demo
`snap-dev/morphic-a11y-demo.html` loads **only** `morphic.js` + `accessibility.js` (Morphic runs
standalone). It exercises the core layer in isolation: focusable buttons, an editable field, a
nested region, a combobox (activedescendant), and a menu-trigger button. Great for testing the
core without the whole IDE.

### The demo project (real scripts)
`2048.xml` (the "Sp22 Project 1 2048 Skeleton") — **currently missing; lost in the snap-dev
reset, re-download from the CS10 materials** (see §6.5). Load it with
`ide.openProjectString(xml)` — **NOT** `rawOpenProjectString` (that loads 0 scripts). It has 6
real sprite scripts, custom categories ("2048 - Helpers", "2048 - Your Tasks", "Testing Blocks"),
and custom blocks. Drag-drop loading also works now (see crash fix below).

### Driving it from the preview tools (examples)
```js
// the IDE
var ide = world.children.find(c => c.constructor.name === 'IDE_Morph');
world.fillPage(); ide.fixLayout();            // the preview resize doesn't auto-fillPage
// dispatch a keydown (set BOTH keyCode and key for Tab handling)
function key(code, opt){ var e = new KeyboardEvent('keydown',
  Object.assign({bubbles:true,cancelable:true}, opt||{}));
  Object.defineProperty(e,'keyCode',{get:()=>code}); document.dispatchEvent(e); }
world.lastInputWasKeyboard = true;
world.setFocus(someMorph, {viaKeyboard:true});
world.focusableMorphs().map(m => m.ariaLabel());   // the tab order
```
Note: in an **unfocused** preview window `document.hasFocus()===false`, so programmatic
`.focus()` sets `document.activeElement` but does **not** auto-fire `focusin` — dispatch a
synthetic `FocusEvent('focusin')` to test the DOM→Morphic path.

---

## 2. Architecture (the core model)

A **parallel, invisible DOM tree** overlays the canvas:

- `world.a11yRoot` — a `<div id="morphic_a11y_root_<stamp>" role="application">` appended to
  `<body>`, positioned exactly over the canvas drawing surface (`getDocumentPositionOf` +
  `clientLeft/clientTop`, size `clientWidth/clientHeight`), `pointer-events:none` so the canvas
  keeps all mouse input. Its `aria-label` is the app entry-point name (the IDE sets
  "Snap! - &lt;Project Name&gt;"). The visual **canvas is `aria-hidden="true"`** so the SR reads
  only the parallel tree.
- Each opted-in morph gets one real DOM node (visually hidden but AT-visible: `opacity:0`,
  `pointer-events:none`, **real geometry** so touch-exploration + the focus ring agree on
  location — never `display:none`/`visibility:hidden`). Nodes **nest** to mirror the morph
  hierarchy (nearest accessible ancestor), positioned relative to that ancestor.
- **`world.focusedMorph`** = the single global AT/visual focus (what the ring draws around, what
  the SR is on). This is **distinct** from the pre-existing `world.keyboardFocus` (the raw-key
  receiver for text editing / menus / `ScriptFocusMorph`).
- **Two-way sync**: `setFocus(morph, opts)` moves native DOM focus + the ring (Morphic→DOM);
  `focusin` on a node calls `setFocusFromDOM` (DOM→Morphic). A `_a11ySyncingFocus` re-entrancy
  guard breaks the loop. `setFocus` options: `viaKeyboard`, `isText` (keep native focus on the
  hidden textarea), `force`, `keepNativeFocus` (set the Tab anchor without grabbing native focus
  — used by clicks).
- **Tab navigation**: `focusableMorphs()` does a tree walk, filters focusable non-excluded
  morphs, and **sorts by screen position** (`a11yOrderKey` = `top*100000 + left`). The single
  document-level capture `keydown` listener (`handleA11yKeydown`) owns Tab/Shift+Tab + activation
  and routes to composites.
- **Focus-visible ring**: `FocusIndicatorMorph` — a non-interactive overlay morph drawing a
  rounded 2px blue stroke (`rgb(0,120,255)`), corner radius = `target.corner + padding`. Shown
  **only** when the last input was the keyboard (tracked like the browser's `:focus-visible`:
  keydown ⇒ true, mousedown/touchstart ⇒ false). Tracks `a11yActiveTarget()` and follows the
  focused morph via the `changed()` hook.

### The "composite widget" pattern (reused everywhere)
A composite is a focusable morph (one tab stop) that owns internal navigation:
- `a11yFocusMode = 'activedescendant'`
- `a11yHandleKey(event)` — internal arrow/Tab handling; returns `true` if it consumed the key
  (`handleA11yKeydown` then `preventDefault`s), `false` to let the key fall through (e.g. Tab
  leaving the composite).
- `a11yActiveTarget()` — the morph the ring should hug (the current item, or the composite/area
  itself for the "overview").
- `a11ySetActiveItem(item)` — called on click to make the clicked descendant the active one.
- Items are `isAccessible` + `excludeFromTabRing`, given stable ids via `ensureA11yId()`, and
  flattened/nested under the composite via an `a11yParentMorph` override.

Used by: `MenuMorph`, the **category radiogroup**, the **palette listbox**, and the **scripting
area tree**.

---

## 3. File map

| File | Role |
|---|---|
| `src/accessibility.js` | **NEW.** The whole additive a11y layer: Morph ARIA API + element lifecycle, `WorldMorph` focus manager (`initAccessibility`, `setFocus`, `setFocusFromDOM`, `focusFromClick`, `focusableMorphs`, `handleA11yKeydown`, `updateFocusRing`, `setAccessibleLabel`), the modal focus trap (`a11yFocusRoot`, `a11yEnterModal`, `a11yLeaveModal`), `FocusIndicatorMorph`, and the `MenuMorph`/`MenuItemMorph` + `ListMorph` accessibility methods. Also the `A11yBlockTemplateLabels` map. |
| `src/morphic.js` | A handful of **guarded** source hooks (see below). All additive — `git diff` is insertions only except `snap.html` version bumps. |
| `src/widgets.js` | `ToggleButtonMorph.refresh` + `ToggleMorph.refresh` hooks → keep `aria-pressed`/`aria-checked` in sync (gated on `a11yUsePressed`/`a11yUseChecked`). Plus the **DialogBoxMorph accessibility** section: `role=dialog`, tab stops, `nextTab`/`previousTab`, Esc/Enter, focus trap + return. |
| `src/gui.js` | All Snap-IDE wiring: landmark regions, entry-point label, toolbar/corral buttons, category radiogroup, palette listbox, scripting-area editor navigation, and the tab order + labels of the Open/Save (`ProjectDialogMorph`) and Import library (`LibraryImportDialogMorph`) dialogs. (`IDE_Morph.prototype.*`.) |
| `snap.html` | Adds `<script src="src/accessibility.js?...">` right after `morphic.js`; bumped version stamps for edited files. |
| `morphic-a11y-demo.html` | **NEW.** Standalone core-layer test harness (morphic.js + accessibility.js only). |
| `2048.xml` | Demo project (copied from the Desktop) for testing the scripting area. |
| `.nocache_server.py` | **NEW.** No-cache static dev server (port 8765). |

### morphic.js hook points (all guarded with `if (this.xxx)` so morphic still runs standalone)
- `WorldMorph.prototype.init` — inline global focus state + `this.initAccessibility()`.
- `Morph.prototype.changed` — geometry sync + ring reposition.
- `Node.prototype.addChild` / `addChildFirst` — reconcile (create elements for accessible subtree).
- `Node.prototype.removeChild` — teardown (**null-guarded**: `if (aNode && ...)`).
- `Morph.prototype.destroy` — teardown.
- `Morph.prototype.copy` — **reset a11y state on the copy** (`a11yElement`/`a11yId`/
  `_a11yDomParentMorph`=null, `isAccessible`=false, `ariaRole`/`_ariaLabel`/`ariaAttributes`=null).
  Critical — see gotchas.
- `WorldMorph.prototype.edit` / `stopEditing` — text-edit focus reconciliation
  (`a11yTextEditing` flag).
- `MenuMorph` `getFocus` / `select` / `destroy` / `leaveSubmenu` / `popup`, and
  `MenuItemMorph.popUpSubmenu` — menu a11y + submenu `aria-expanded`.

### Memory / logs
The blow-by-blow build log from the June–July sessions is checked into this repo as
`docs/morphic-a11y-devlog.md` (imported from the Claude Code memory at
`~/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/`). This doc supersedes
it for handoff, but the devlog has the step-by-step decisions. The audit that predates the
prototype is in `docs/ACCESSIBILITY.md`.

---

## 4. Per-area implementation notes

### Menus (`MenuMorph`, `MenuItemMorph` — accessibility.js + morphic.js hooks)
- `MenuMorph` is `isAccessible=true` **globally** → every Snap menu is accessible.
- On open (`popup` → `enterAccessibleFocus`) focus moves onto the **menu container** (no item
  active yet) so the SR says "menu, N items" (not "on a menu item"). The first arrow/Tab moves to
  the first item. Submenus (Right arrow) **do** land on their first item (APG).
- `aria-setsize`/`aria-posinset` for "N of M"; Tab/Shift+Tab also move items; Esc on a submenu →
  parent's trigger item, Esc on the root → the trigger button. `restoreAccessibleFocus` returns
  focus to `_a11yMenuReturnFocus`. Submenu items get `aria-haspopup` + `aria-expanded`.
- **Gotcha**: `MenuMorph` shadows the `world()` **method** with a `world` **property** → use
  `Morph.prototype.a11yWorld()` (added), never `this.world()`, in the a11y layer.

### Landmarks + entry point (`gui.js`: `setAccessibleRegions` etc.)
- 7 `<section aria-label>` regions (implicit ARIA region landmarks), `excludeFromTabRing`.
- The **control bar** spans the full width including the Snap! logo/menu via a per-instance
  `a11yBounds()` override (merges logo+controlBar bounds); the logo nests inside it.
- Recreated panes (palette on category switch, scripts on tab switch) re-tag on `fixLayout`;
  `orderAccessibleRegions` keeps the landmark reading order stable.
- Entry point = the a11y root (`role=application`, `aria-label` set via `world.setAccessibleLabel`
  from `IDE_Morph.updateAccessibleLabel`, hooked into `controlBar.updateLabel`). It's the root
  (not a separate IDE element) because menus pop up at world level and must stay inside the
  application root for key pass-through.

### Toolbar + categories (`gui.js`: `setAccessibleButtons`, `setAccessibleCategories`)
- Buttons: `role=button`, `ariaTag='button'` (Enter/Space/AT fire native click → `mouseClickLeft`
  → the button's action). Menu openers get `aria-haspopup`+`aria-expanded` (toggled by the menu
  focus hooks). Toggles get `aria-pressed`. Unlabelled buttons are skipped (no bare "Button").
- Categories = `role=radiogroup` (one tab stop), children `role=radio` + `aria-checked`. Up/Down
  (and Left/Right) move + select via `handleCategoryKey`.

### Block palette (`gui.js`: `setAccessiblePalette`, `templateLabel`)
- `palette.contents` (the scrollable `FrameMorph`) = `role=listbox`; each `BlockMorph` child =
  `role=option`. Label = `templateLabel(block)` = **visible words without arguments**, or a custom
  name from `A11yBlockTemplateLabels` (in accessibility.js; currently `{ doFor: 'for i loop' }`).
  Each option has `aria-description` "Press Enter to activate the block".
- On focus the **whole palette is outlined** (no active block); the first arrow enters the blocks.
  Listbox label includes the category ("Motion blocks"). `scrollIntoView` keeps the current block
  visible; the ring hugs it.
- Make-a-block button + visibility `ToggleMorph` checkboxes are separate tab stops (nested in the
  palette region via `a11yParentMorph`).

### Scripting area editor navigation (`gui.js`: `setAccessibleScripts`, `handleScriptsAreaKey`)
- `spriteEditor.contents` (the `ScriptsMorph`) = **one** tab stop, `role=tree`, focusable even
  when empty, label "Scripting area, N scripts".
- `scriptTabStops()` = for each script: its top block (header, `role=group`, "&lt;block&gt;, N
  blocks") then its inputs (`role=textbox`). `scriptAllBlocks()` = all command blocks (lines).
- **Tab/Shift+Tab** → `scriptTabStops`; returns `false` past the boundaries so the normal Tab nav
  takes over and **leaves the area**. **Left/Right** → same list, clamped. **Up/Down** →
  `scriptAllBlocks`. **Enter/Space** → run the current script.
- `blockAccessibleLabel(block)` reads visible text **with** arguments (slots as "argument (value)",
  **skipping C-slots**). `lineArguments(block)` = `block.inputs()` minus C/Command slots.
  `blockOfItem`/`scriptOfItem` walk up. Items flattened under the `ScriptsMorph` via
  `a11yParentMorph`. Ring = `_a11yCurrentItem || spriteEditor` (outline the area on focus).
- Block traversal facts: `top.allChildren().filter(c => c instanceof CommandBlockMorph)` gives
  lines in DFS order (incl. nested C-slot blocks); `HatBlockMorph` IS a `CommandBlockMorph`;
  C-slots are `CSlotMorph` with `.nestedBlock()`; reporters in slots are args.

### Dialogs (`DialogBoxMorph` + heirs — widgets.js, gui.js)
- **Every** dialog is an ARIA modal: `role=dialog`, `aria-modal=true`, `aria-label` = its
  title, `aria-description` = its message text (inform / ask boxes). Set on the prototype, so
  heirs (project, library, block, prompt … dialogs) get it for free.
- **Focus trap.** `a11yTrapsFocus` marks a morph modal; `world.a11yFocusRoot()` answers the
  topmost one and `focusableMorphs()` then returns only ITS stops, wrapping around at both ends
  — Tab can't reach the IDE behind the dialog. `world.a11yEnterModal/a11yLeaveModal` remember
  the opener and hand focus back when the dialog closes (nested dialogs restore to the dialog
  underneath, mapping a morph that has no element of its own — e.g. the string morph of a field
  being edited — onto its enclosing tab stop).
- **Tab stops.** `a11yTabStops()` walks the dialog and tags what it finds (buttons, toggles,
  input fields, list boxes, editable text), ordered by screen position; heirs override it to
  declare an explicit order + names via `a11yStops([[morph, label, role?], …])`. It re-runs from
  `fixLayout` and on every Tab, so labels and counts stay fresh as contents change.
- **Text fields** are one stop each. Focusing one starts Morphic's editing (so typing works
  immediately, and Enter/Esc keep their meaning) — native focus then sits on the hidden
  textarea, which is renamed after the field (`world.setAccessibleEditingLabel`). Tabbing out of
  a field arrives through Morphic's own text tabbing (`CursorMorph` → `Morph.tab` → the owner
  chain), which `DialogBoxMorph.nextTab/previousTab` hand back to the accessible ring — morphic
  explicitly suggests this "fine-grained tabbing cycle at the dialog level".
- **Keys.** Esc cancels, Enter accepts (`a11yHandleTrapKey`), unless the focused control wants
  the key itself (a `<button>` activates natively, a list box runs its default action).

### List views (`ListMorph` — accessibility.js)
- `ListMorph` is a `role=listbox` composite: ONE tab stop, up/down (+ Home/End) move,
  `aria-activedescendant` follows, Enter runs the item's double-click action (i.e. the dialog's
  default: open the project, import the library), Space just selects.
- **Selection follows focus**, exactly as clicking does: arrowing calls the item's `trigger()`,
  so the surrounding dialog updates its notes / preview / thumbnail as it would for the mouse.
  Because some dialogs re-`edit()` their input field in that action, the handler re-asserts
  focus on the list afterwards.
- A `ListMorph` builds its items as `MenuItemMorph`s of an internal `MenuMorph`. That menu is
  **not** exposed (it would read as a nested ARIA menu), so `buildListContents` is wrapped to
  build the items with the menu accessibility switched off and then re-tag them as `role=option`
  (with `aria-setsize`/`aria-posinset`/`aria-selected`) directly under the listbox element.
- Scrolling moves children with `silentMoveBy()`, which does **not** fire `changed()` per child,
  so the composites call `syncAccessibleGeometryTree()` after `scrollIntoView()` to re-glue the
  parallel nodes (otherwise items stay at stale positions / stay `aria-hidden`).
- The Import library dialog's **block preview** is the same pattern hand-rolled on its
  `ScrollFrameMorph` (the blocks there are pictures, so `displayBlocks` stores each block's
  spoken name as `a11yLabelString`).

---

## 5. Gotchas / lessons learned (read before extending)

1. **Load order.** `accessibility.js` loads (snap.html line ~17) **before** `widgets.js`,
   `blocks.js`, `gui.js`. So it can only extend morphic.js classes (`Morph`, `WorldMorph`,
   `MenuMorph`, `MenuItemMorph`). a11y for widget/block classes (`PushButtonMorph`,
   `ToggleButtonMorph`, `ToggleMorph`, `BlockMorph`, …) must live in **gui.js** (loads last) or as
   inline hooks in those files. (We learned this the hard way trying to override
   `ToggleButtonMorph.prototype.updateAccessibleElement` in accessibility.js — it silently no-op'd.)
2. **`Morph.copy` must reset a11y state.** `fullCopy` shallow-copies the `a11yElement` (DOM node!)
   and `a11yId` — so a block dragged out of the palette would share/duplicate the template's
   element + id. The fix lives in `Morph.prototype.copy` (morphic.js). Taggers also guard with
   `a11yIsTagged()` (own element where `el.morph === this`).
3. **`MenuMorph.world` is a property, not the method.** Use `a11yWorld()`.
4. **Stuck text-edit flag blocks navigation.** `handleA11yKeydown` defers to the text path **only**
   while the hidden textarea actually holds focus
   (`document.activeElement === this.keyboardHandler`); `setFocus` ends any active edit when moving
   to a non-text morph. Without this, a lingering `a11yTextEditing=true` swallowed every arrow key.
5. **Caching.** See §1 — use the no-cache server, bump `?version=` when in doubt.
6. **Null in tree hooks.** `removeChild(null)` is legal in Morphic; our hook must guard
   `if (aNode && ...)`, and `createAccessibleElementTree`/`destroyAccessibleElementTree` iterate
   `(this.children || [])` with `child &&`. (This was the project-drop crash.)
7. **Synthetic key events** need **both** `keyCode` (most handlers) **and** `key:'Tab'` (the Tab
   fallthrough in `handleA11yKeydown` checks `event.key`).
8. **Preview window focus.** `document.hasFocus()` is often false in the preview → programmatic
   `.focus()` won't fire `focusin`; dispatch a synthetic `focusin` to test DOM→Morphic.
9. **`fillPage` on resize.** The preview's resize doesn't trigger Snap's `fillPage`; call
   `world.fillPage(); ide.fixLayout()` after resizing, or controls near the right edge get clipped
   (and correctly hidden from AT, which can look like a bug).

---

## 6. TODO / Next steps

### DONE 2026-08-07 — the six "start here" items (in-browser verified; real-SR pass pending)
All six items were implemented, then lost with the snap-dev reset, recovered by replaying the
Claude Code session transcripts, and re-verified programmatically in Chrome on this branch
(see "Repo history & recovery" below). **A real VoiceOver/NVDA pass is still the next gate.**

0. ✅ **Read out results.** `WorldMorph.announce(text, {assertive})` + an ARIA live region
   (`role=status`, polite; flips to `role=alert`/assertive for errors) in accessibility.js.
   `SyntaxElementMorph.showBubble` is wrapped in gui.js: clicking a reporter or a script ending
   with a result announces "reports <value>" via `IDE_Morph.resultAccessibleText` (strings,
   booleans, numbers, lists (first 20 items), tables, costumes/sounds/scripts/sprites; error
   bubbles are announced assertively). Unknown types fall through to showBubble's own
   `display()`-string recursion, which announces itself.
1. ✅ **Click → focus.** `focusFromClick` now hands the composite the raw clicked morph
   (`a11ySetActiveItem(item || morph)`); the scripting area maps ANY descendant (fresh untagged
   blocks included) onto the traversal via `scriptsSetCurrentFromMorph` (retag, then
   `scriptItemIndexIn` ancestry walk); the palette maps clicks to the top-level template block.
2. ✅ **Exhaustive traversal.** `blockInputItems(block)` recursively descends plugged-in
   reporters/predicates and multi-arg groups (C-/command slots skipped — their stacks are
   lines); `scriptTabStops()` = script header + every block + every input, in reading order;
   Up/Down still move by lines (`blockOfItem` falls back to the top block for standalone
   reporter scripts).
3. ✅ **Search pane.** Guarded hooks in `SpriteMorph.searchBlocks` (objects.js) call
   `IDE_Morph.announceSearchResults` / `announceBlockSelection` — "N blocks found. <block>.
   press up or down to choose, enter to insert", and each arrow move announces the selection.
4. ✅ **Shift+Enter → keyboard editing.** In the scripting area, Shift+Enter calls
   `IDE_Morph.startKeyboardEditing(item)` → `block.focus()` (a `ScriptFocusMorph` at that
   block), refocuses the hidden textarea, and announces "keyboard editing: <block>". A
   `ScriptFocusMorph.fixLayout` wrapper announces every navigation move (deduped against
   repaints); the `stopEditing` wrapper returns AT focus to the scripting area at the last
   edited element when exiting via Esc; `handleA11yKeydown` defers entirely while the SFM
   drives through the textarea.
5. ✅ **Scripts in the rotor** *(experimental)*. Scripts container is now `role=group` (still
   aria-activedescendant); each script's top block is `role=region` labelled
   "script N: <top label>, M blocks" — regions with names should appear in the VO rotor's
   landmark list. Other blocks are `role=button`, inputs `role=textbox`. NEEDS a real
   VoiceOver check; fallback idea if landmarks don't surface inside `role=application`:
   `role=heading` + `aria-level` per script (headings rotor).

### New research / design notes (2026-08-07)
- **Prior art review:** collect and review all public notes on **Blockly**'s accessibility work
  (keyboard navigation plugin, screen-reader announcements) and **Quorum** (the evidence-based,
  accessibility-first programming language) — what worked, what they abandoned.
- **Design challenge — the palette is 'live':** every palette block reacts to click/drag, so a
  screen-reader user can't safely explore. We'll probably need a keyboard-editing mode where you
  **pick up** a block and move it with the arrow keys (grab → move → drop, with announcements).
  Review the **APG guidance on keyboard drag-and-drop** patterns before designing this.

### DONE 2026-08-13 — dialogs + list views (Playwright-verified in Chrome)
- **Dialog boxes** (`DialogBoxMorph` and every heir): `role=dialog` + `aria-modal`, title and
  message read out, real focus trap, focus returned to the opener on close, Tab through the
  stops, Esc/Enter. See §4 "Dialogs".
- **Import library dialog**: Tab = search field → libraries list → block preview → description →
  Import → Cancel; up/down through both list views; each library announced with its description
  and its blocks by name.
- **Open / Save project dialogs**: Tab = name / search field → source buttons (Cloud, Examples,
  Browser, Computer) → project list → notes → action buttons; up/down through the list, which
  announces each project and reads its notes; Enter opens (Save's name + notes fields are
  editable from the keyboard).
- **All other `ListMorph` list views** (block import, project recovery, the inspector, …) get
  the same listbox behaviour from the generic layer.
- Tests: `tests/specs/45-dialogs.spec.js`, plus the now-active dialog tests in `40-focus`.
- Fixed on the way: `focusin`/`focusout` BUBBLE, so a screen-reader-driven (DOM-initiated) focus
  on a button used to be reported as its enclosing landmark region — the listeners now ignore
  events fired by a descendant.

### Medium term
- **Dialogs, remaining gaps:** the numeric-slider dialogs (`SliderMorph` needs `role=slider` +
  `aria-valuenow`), the project preview thumbnail (an unlabelled image), the block editor's
  scripting area (it is a dialog, so its buttons tab, but its scripts aren't navigable yet),
  and announcing "N projects" when a source finishes loading.
- **Sprite control bar** (the tab/toolbar row above the scripting area) still needs tagging.
- **Global tab order** (target): Toolbar → Category selector → Palette → Sprite control bar →
  Scripting area → Corral controls → Corral → left (palette) resize handle → right (stage)
  resize handle → wrap to the beginning.
- **Width drag handles** (palette + stage) should be tab stops: Up/Right moves the handle
  right, Down/Left moves it left (`role=separator` with `aria-valuenow` is the APG pattern).
- **Buttons still to tag:**
  - "Make a block" at the end of each palette category (the in-palette one is tagged; verify
    per-category placement),
  - the palette **search icon** (pinned top-left of the palette),
  - the **"+"** (also make-a-block) button below the search icon,
  - the **keyboard-editing toggle** at the top right of the scripting area,
  - the **sprite-corral delete icon**,
  - **camera / paint-editor icons** in the Costumes tab,
  - the **record button** in the Sounds tab.
- **Costumes list**: tabbing should reach all costumes — probably ONE tab stop, a list with
  arrow-key navigation. Same model for the **sounds list**.
- **Sprite corral model**: first a tab stop for the left-side scenes/stage list (one stop,
  arrow keys), then a tab stop for the main sprite list (one stop, arrow keys).

### Logged (not to fix yet)
- **Stage output + interactivity** — consider how stage rendering (say/think bubbles, sprites,
  pen output) and interactive projects (key/click-driven) are exposed to AT.
- **Lists and table output navigation** — lowish priority but maybe clear wins: make list
  watchers / table views (ListWatcherMorph, TableMorph) navigable with the SR (grid/table roles).
- **VO rotor: palette blocks as a list** — expose the current palette as a list so the rotor shows
  the blocks.
- **Tabbing between scripts** should outline the **whole script** (or at least the top block) — the
  ring currently hugs the current item; for the script-overview state, ring the top block's
  `fullBounds()` (the whole stack) instead of just the top block's bounds.
- **Keyboard-only edit mode** that **turns off key-receiver hat blocks** (so typing doesn't trigger
  "when key pressed" scripts while editing).
- **Clearer current-block highlight** when tabbing in the scripting area.

### From earlier rounds
- **Palette toggle/visibility checkboxes** appear **out of order** and are labelled generically —
  associate each with **its variable's label** (find the adjacent reporter / watcher), and fix
  ordering (DOM insertion vs. visual).
- **Palette search ("magnifier") + "+" buttons** aren't tagged yet (couldn't cleanly locate them —
  likely in the categories pane or a palette toolbar).
- **Live label refresh** — script/area labels only refresh on `fixLayout` (skip-if-tagged), not the
  instant a block is dropped/edited. Hook `ScriptsMorph` mutation, or re-tag on drop.
- **Custom-block editor** (`BlockEditorMorph`) is not accessible — the 2048 skeleton's actual tasks
  live in **custom block definitions**, so making the block editor navigable is a big, important
  piece.
- **In-block editing flows** — entering/changing input values from the keyboard (currently Enter
  "runs"; need an edit affordance distinct from run).
- **`aria-live` announcements** for run/halt/errors; **off-screen virtualization** for very large
  palettes/scripts; **multi-world** correctness (each world owns its own root + focus).
- **Real screen-reader passes**: VoiceOver (mac/Safari), NVDA (Win/Firefox), JAWS, plus
  touch/mobile exploration.

---

## 6.5 Repo history & recovery (2026-08-07)

- The prototype was originally built in `snap-dev` (June–July 2026 sessions, base v12.0.6).
  On 2026-08-07 `snap-dev` was reset to vanilla Snap! and the working files were deleted.
- **Recovery:** every Write/Edit from the Claude Code session transcripts
  (`~/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/…` and
  `…-snap-snap-dev/…`) was replayed in order onto vanilla v12.0.6 sources — zero conflicts,
  all files `node --check` clean, then re-verified live in Chrome (results announcements,
  traversal, click mapping, search pane, Shift+Enter bridge).
- **This work now lives in the `snap-a11y` repo, branch `morphic-a11y-prototype`.**
- On this branch the earlier Codex experiment on `main` (commit `123a3fbc`, "global focus
  management and tab navigation", canvas-drawn ring in morphic.js) is **reverted**: it defines
  `Morph.isFocusable` / `focusedMorph` / its own focus ring with the SAME names as this layer
  and the two systems cannot coexist. `main` still has it for comparison.
- `main`'s snap.html improvements (`lang="en"`, canvas `tabindex="0"`) are kept.
- **Lost:** `2048.xml` (the "Sp22 Project 1 2048 Skeleton" demo project) was not recoverable —
  re-download it from the CS10 course materials and drop it in the repo root to restore the
  §1 test flow.

---

## 7. Reference links

- **WAI-ARIA Authoring Practices Guide (APG)** — the patterns we follow:
  https://www.w3.org/WAI/ARIA/apg/patterns/  (menu, menubar, listbox, radiogroup, treeview,
  combobox, toolbar, landmarks; also the **window splitter** pattern for the resize handles).
- **Keyboard drag-and-drop** — for the pick-up-a-block editing mode: the APG has no finished
  DnD pattern; see the draft/design notes https://github.com/w3c/aria-practices/issues/316 ,
  https://medium.com/salesforce-ux/4-major-patterns-for-accessible-drag-and-drop-1d43f64ebf09 ,
  and https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html (WCAG 2.5.7).
- **Blockly accessibility** — keyboard navigation plugin + docs:
  https://developers.google.com/blockly/guides/configure/web/keyboard-nav ,
  https://github.com/google/blockly-keyboard-experimentation
- **Quorum** — the accessibility-first, evidence-based language (design notes, SR support):
  https://quorumlanguage.com/ , https://quorumlanguage.com/evidence.html
- **ARIA in HTML** (when `<section>`, `<button>` etc. imply roles):
  https://www.w3.org/TR/html-aria/
- **ARIA spec** — `aria-activedescendant`, `aria-setsize`/`aria-posinset`, `aria-expanded`:
  https://www.w3.org/TR/wai-aria-1.2/
- **MDN `:focus-visible`** (the keyboard-vs-pointer heuristic we mimic):
  https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible
- **Flutter web semantics** — a comparable "parallel DOM over a canvas" approach for inspiration:
  https://github.com/flutter/flutter/wiki/Accessibility (and the `flt-semantics` overlay model).
- **Snap!** — https://snap.berkeley.edu/ ; source https://github.com/jmoenig/Snap (Morphic is
  `src/morphic.js`, by Jens Mönig). Snap reference manual is the `manual/` repo in this workspace.
- **Screen readers** — VoiceOver (built into macOS, ⌘F5; rotor = VO+U); NVDA
  https://www.nvaccess.org/ ; testing guide https://webaim.org/articles/voiceover/ and
  https://webaim.org/articles/nvda/.
- **Quill / Monaco / Google Docs** canvas-app accessibility write-ups are also worth a look for the
  "editable canvas + AT" problem space.

---

## 8. Quick API cheat-sheet (accessibility.js)

```text
Morph.prototype:
  isAccessible (opt-in, default false), a11yIgnore, ariaRole, ariaTag ('div'|'button'|'section'|…),
  a11yFocusMode ('roving'|'activedescendant'), excludeFromTabRing, ariaAttributes, a11yId
  ariaLabel()/setAriaLabel(s), setAria(k,v), setAccessible(bool,role)
  isFocusable(), a11yOrderKey(), a11yActiveTarget(), a11yBounds(), a11yWorld()
  a11yParentMorph()/a11yParentElement(), ensureA11yId(), a11yIsTagged()
  createAccessibleElement()/updateAccessibleElement()/syncAccessibleGeometry()/destroyAccessibleElement()
  createAccessibleElementTree()/destroyAccessibleElementTree()
  (optional hooks heirs implement: reactToFocus(viaKeyboard), reactToUnfocus, a11yActivate(event),
   a11yHandleKey(event), a11ySetActiveItem(item))

WorldMorph.prototype:
  focusedMorph, lastInputWasKeyboard, a11yTextEditing, a11yRoot, focusRing, accessibilityEnabled
  initAccessibility(), updateAccessibilityRoot(), setAccessibleLabel(s)
  setFocus(morph,{viaKeyboard,isText,force,keepNativeFocus}), setFocusFromDOM(morph), handleA11yBlur
  focusFromClick(event), focusableMorphs(), handleA11yKeydown(event), updateFocusRing(viaKeyboard)
  setPointerInput()

FocusIndicatorMorph  — the rounded blue ring overlay.
A11yBlockTemplateLabels = { doFor: 'for i loop', ... }  — palette template-label overrides by selector.
```

```text
IDE_Morph.prototype (gui.js):
  setAccessibleRegions/tagAccessibleRegion/orderAccessibleRegions/accessibleRegions, updateAccessibleLabel
  setAccessibleButtons/tagAccessibleButton/tagAccessibleButtonsIn
  setAccessibleCategories/handleCategoryKey/updateCategoryActiveDescendant
  setAccessiblePalette/templateLabel/updatePaletteLabel/setPaletteCurrentBlock/handlePaletteKey/paletteBlocks
  setAccessibleScripts/scriptList/scriptLines/lineArguments/argLabel/blockAccessibleLabel
  scriptTabStops/scriptAllBlocks/blockOfItem/scriptOfItem/tagScriptItem/updateScriptsLabel
  scriptsReactToFocus/scriptsSetCurrent/handleScriptsAreaKey
```
