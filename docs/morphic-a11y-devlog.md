# Morphic a11y prototype — build devlog (June–July 2026)

> Imported 2026-08-07 from the Claude Code running-log memory
> (`~/.claude/projects/-Users-michael-Dropbox-Projects-snap-manual/memory/snap-morphic-accessibility.md`).
> The canonical handoff doc is `accessibility-prototype.md` in the repo root; this is the
> step-by-step record of decisions made while building the prototype.


Making Snap! + Morphic (canvas-based UI) usable with screen readers / AT. Started 2026-06-29.
Engine source is in `snap-dev/src/` (NOT the `manual/` repo, which is the reference-manual website).

**FULL HANDOFF DOC: `snap-dev/accessibility-prototype.md`** — read it first; it has the architecture,
file map, API cheat-sheet, gotchas, references, and the prioritized TODO list. This memory is the
running log; that doc is the canonical reference.

**Next-session "start here" TODOs (from the user, 2026-06-30):** (1) clicking any block must move focus
to that block; click+Tab focus is still off. (2) arrow keys in a stack should reach ALL block/input
types (reporters/predicates/hats too, every slot). (3) when Snap's built-in keyboard editing is active,
read SEARCH-PANE blocks aloud. (4) Shift+Enter on a focused block should start keyboard editing at/just
below that block. (5) each script/stack should appear as a list item / landmark in the VO rotor.
Logged-not-yet: VO rotor shows palette blocks as a list; tabbing between scripts outlines the whole
script (top block fullBounds); keyboard-only edit mode that disables key-receiver hat blocks; clearer
current-block highlight.

**Approach:** a parallel, invisible DOM tree mirrors opted-in morphs, two-way synced to Morphic state,
leveraging native browser focus/tab/AT rather than reinventing it.

**Phasing:** (1) Morphic core machinery [DONE] → (2) Snap! IDE landmark regions [DONE] → (3)
accessible toolbar + menus [MenuMorph DONE; control-bar + category buttons DONE]. Later: palette
blocks / scripting contents AT, ScriptFocusMorph/block-editor AT, aria-live.

**Primary buttons (done):** gui.js IDE_Morph.setAccessibleButtons/tagAccessibleButton (called from
setAccessibleRegions) make these role=button, ariaTag='button' (so Enter/Space/AT fire native click ->
mouseClickLeft -> action), focusable + tabbable with localize()'d labels: logo="Snap! menu",
projectButton="Project menu", cloudButton="Cloud menu", settingsButton="Settings menu" (all
aria-haspopup=menu + aria-expanded toggled by syncAccessibleMenuFocus/restoreAccessibleFocus),
startButton="Green flag", pauseButton/stopButton + the 8 category buttons = aria-pressed (synced via a
hook added to ToggleButtonMorph.refresh in widgets.js, gated on morph.a11yUsePressed). The logo nests
inside the Control Bar region via a per-instance Morph.a11yParentMorph override. focusableMorphs() now
sorts by a11yOrderKey (top, then left) so Tab follows screen position. Regions now use <section> tags
(ariaTag='section', implicit region landmark - no role attr). Focus ring is rounded
(FocusIndicatorMorph.cornerRadius = target.corner + padding). Remaining toolbar buttons tagged:
stageSize/appMode/stepping + corral-bar buttons via tagAccessibleButtonsIn (walks a container, labels
from .hint, skips unlabelled). Category selector is now a role=radiogroup (ONE tab stop,
a11yFocusMode=activedescendant) with role=radio children (aria-checked via a11yUseChecked + the
widgets.js refresh hook); up/down arrows move+select via IDE_Morph.handleCategoryKey/
updateCategoryActiveDescendant (removed from accessibleRegions list). Morph.a11yBounds() (new) lets a
landmark span a custom rect: controlBar.a11yBounds merges logo+controlBar so the Control Bar region is
full-width (covers the Snap! app menu). NOTE widgets.js (PushButton/ToggleButton) loads AFTER
accessibility.js, so DON'T extend those classes in accessibility.js - do button wiring in gui.js
(IDE) which loads later. snap.html ?version= bumped to 2026-06-30 for morphic/accessibility/gui/widgets.

**Landmark regions (done):** gui.js IDE_Morph.setAccessibleRegions/tagAccessibleRegion/
orderAccessibleRegions/accessibleRegions tag controlBar, categories, palette, spriteEditor, stage,
corral as role=region with localize()'d labels (Control Bar, Category Selector, Block Palette,
Scripting Area, Stage, Sprite Corral). Hooked from openIn (after world.add) + fixLayout (catches pane
recreation on category/tab switch) + controlBar.updateLabel. Entry point = the a11y root (role=
application), labelled `localize('Snap!') + ' - ' + getProjectName()` via WorldMorph.setAccessibleLabel
+ IDE_Morph.updateAccessibleLabel (root, NOT a separate IDE element, because menus pop up at world level
and must stay inside the application root for key pass-through). orderAccessibleRegions re-appends region
elements in reading order so recreated panes don't scramble landmark order. Regions are currently empty
containers (block/script contents not yet exposed - future phase).

**Blocks palette + scripting area (done):** gui.js IDE_Morph.setAccessiblePalette/setAccessibleScripts
(called from setAccessibleRegions). palette.contents (FrameMorph) -> role=listbox (ONE tab stop,
activedescendant), each BlockMorph child -> role=option labelled by blockAccessibleLabel(block) = walk
block.parts(): BlockLabelMorph.text words + each *SlotMorph as "argument (value)"; aria-description "Press
Enter to activate". up/down nav via handlePaletteKey (scrollIntoView + updateFocusRing; ring hugs current
block via contents.a11yActiveTarget). Make-a-block PushButton + ToggleMorph checkboxes = tab stops nested
in the palette region via per-instance a11yParentMorph override. Scripting area: spriteEditor.contents
(ScriptsMorph) -> role=listbox, each top BlockMorph (stack) -> option labelled with its first block;
moving speaks it. ToggleMorph.refresh hook (widgets.js) sets aria-checked. IMPORTANT FIX: Morph.copy
(morphic.js) now resets a11y state on the copy (a11yElement/a11yId/_a11yDomParentMorph=null,
isAccessible=false, ariaRole/_ariaLabel/ariaAttributes=null) - else blocks dragged/copied from the
palette inherit the template's element+id (duplicate/blank ids, wrong nesting). Taggers skip via
a11yIsTagged() (own element, el.morph===this), create element THEN ensureA11yId. TODO refinements:
palette checkbox labels generic ("show or hide"); search/+ buttons not yet found/tagged; navigating INTO
a stack block-by-block; scripts re-tag on fixLayout not per-drop.

**Click-focus, palette polish, editor navigation (done):**
- Click sets the Tab anchor like a browser: WorldMorph.focusFromClick (hooked into the canvas mousedown
  listener) walks up from the clicked morph to the nearest tab-stop and setFocus({keepNativeFocus:true,
  viaKeyboard:false}) - no ring, no native-focus steal; clicked options call the composite's
  a11ySetActiveItem. setFocus gained keepNativeFocus option.
- Palette: blocks now use IDE_Morph.templateLabel (visible words WITHOUT arguments, or a custom name from
  the A11yBlockTemplateLabels map in accessibility.js, currently {doFor:'for i loop'}). On focus the whole
  palette is outlined (contents._a11yCurrentBlock=null, a11yActiveTarget returns the palette); first arrow
  enters the blocks. Listbox label includes the category ("Motion blocks") via updatePaletteLabel.
- Editor navigation (gui.js, replaced the old scripts-listbox): each top BlockMorph = its OWN tab stop
  (role=group, activedescendant), labelled "<top block w/ args>, N blocks". scriptLines(top)=
  top.allChildren().filter(CommandBlockMorph) (DFS incl. nested C-slots); lineArguments(block)=
  block.inputs() minus C/CommandSlotMorph. up/down move through blocks, left/right through a line's
  arguments (then to next/prev line); each line=treeitem, each arg=textbox, flattened under the script
  group via a11yParentMorph override; ring highlights the current item (a11yActiveTarget). handleScriptKey
  tracks _a11yLineIndex/_a11yArgIndex. blockAccessibleLabel now skips C-slots.
- IMPORTANT FIX: handleA11yKeydown's text-edit guard now only defers when the hidden textarea actually
  holds focus (document.activeElement===keyboardHandler), and setFocus ends any active edit when moving to
  a non-text morph - else a stuck a11yTextEditing blocked all arrow navigation.
- 2048.xml (copied to snap-dev/): load with ide.openProjectString (NOT rawOpenProjectString - that left
  0 scripts); it has 6 real sprite scripts + custom categories ("2048 - Helpers" etc.) + custom blocks.

**Crash fix + scripting-area rework (latest):**
- Dropping a project crashed on removeChild(null)->destroyAccessibleElementTree. Fixed: removeChild hook
  guards `aNode &&`, and createAccessibleElementTree/destroyAccessibleElementTree use `(this.children||[])`
  + `child &&`.
- REVISED scripting-area model (replaced "each script = tab stop"): the ScriptsMorph (spriteEditor.contents)
  is now ONE tab stop (role=tree, NOT excludeFromTabRing, focusable even when empty, label "Scripting area,
  N scripts"). Inside: Tab/Shift+Tab step through scriptTabStops() = each script's top block (header,
  role=group, announced as "<block> , N blocks") then its inputs (role=textbox); past the last input Tab
  returns false so it leaves to the next focusable (handleScriptsAreaKey returns false at boundaries ->
  handleA11yKeydown's event.key==='Tab' fallthrough runs the normal Tab nav). Left/Right = same traversal
  clamped; Up/Down = scriptAllBlocks() (blocks/lines). Items flattened under the ScriptsMorph via
  a11yParentMorph override; ring = scripts._a11yCurrentItem || spriteEditor (outline the area on focus).
  Click on the area (focusFromClick) anchors it; Tab then enters. blockOfItem/scriptOfItem walk up.
- Palette TODO from user: toggle/visibility checkboxes appear OUT OF ORDER and need to be associated with
  their variable's label.
- TODO: palette search/+ buttons; refresh script labels live; in-block editing; block editor a11y.

**Dev caching gotcha:** snap.html loads src/*.js with ?version=DATE query strings; editing a file does
NOT bust that cache. Use the no-cache dev server (snap-dev/.nocache_server.py, wired into
manual/.claude/launch.json as `snap-dev-static`, port 8765) so reloads pick up edits; if a file still
looks stale, bump its ?version= in snap.html once.

**Menus (done):** MenuMorph/MenuItemMorph are accessible globally (role=menu/menuitem, label,
aria-haspopup on submenu items). Uses aria-activedescendant: the menu element holds native focus and
Morphic's existing arrow-nav drives `selection`, mirrored into aria-activedescendant via a hook in
MenuMorph.select(). Hooks in MenuMorph getFocus/select/destroy/leaveSubmenu (morphic.js); routing in
WorldMorph.handleA11yKeydown (defers to the textarea path when the textarea, not the menu element,
holds focus, to avoid double-processing). Focus returns to the trigger on close (restoreAccessibleFocus
+ _a11yMenuReturnFocus). Focus ring hugs the active item (Morph.a11yActiveTarget). Menu items expose
aria-setsize/aria-posinset ("N of M"); Tab/Shift+Tab navigate items too (not just arrows); submenu items
expose aria-expanded (toggled in popUpSubmenu / restoreAccessibleFocus). Menus now auto-focus on open
(MenuMorph.popup -> enterAccessibleFocus, so right-click/mouse opens read title+count immediately;
guarded to skip item-less popups like the numeric slider, and clears world.onNextStep so the textarea
refocus kludge can't steal focus). On open, focus lands on the menu CONTAINER with NO item selected (no
aria-activedescendant) so VoiceOver says "menu" not "on a menu item"; the first arrow/Tab then moves to
the first item. Submenus (Right arrow) DO land on their first item via getFocus per APG. ESC on a submenu calls leaveSubmenu (returns to the parent's trigger
item); ESC on the root menu restores focus to the trigger so Tab continues forward. The visual canvas is now
aria-hidden=true (was role=application — that made the SR read the bare "world" canvas); the overlay
root keeps role=application + aria-label so keys pass through. IMPORTANT gotcha:
MenuMorph shadows the world() METHOD with a `world` PROPERTY — use Morph.prototype.a11yWorld() (added),
never this.world(), in the a11y layer. This made ALL Snap! menus (settings, project, right-click dev
menu, dropdowns) screen-reader navigable for free. Demo has a "Menu ▾" trigger button (aria-haspopup).

**Key decisions (confirmed by Michael):**
- Native **roving tabindex** focus is primary; use **aria-activedescendant** only where APG expects it
  (combobox/search, some listbox/grid) via per-morph `a11yFocusMode`.
- Code split: *global focus state* inlined in `morphic.js` `WorldMorph.init`; *overrides of existing
  functions* adapt the `morphic.js` source directly (NOT monkey-patch wrappers); *net-new additions* go
  in `src/accessibility.js`.

**What Phase 1 added:**
- New `src/accessibility.js` (Morph ARIA API: `isAccessible`/`ariaRole`/`ariaTag`/`ariaLabel`/`setAria`/
  `a11yFocusMode`/`excludeFromTabRing`; element lifecycle create/update/destroy/syncGeometry, nested
  under nearest accessible ancestor; WorldMorph focus manager `setFocus`/`setFocusFromDOM`/
  `focusableMorphs`/`handleA11yKeydown`/`updateFocusRing`/`initAccessibility`; `FocusIndicatorMorph` =
  2px blue focus-visible ring). Loaded in `snap.html` right after `morphic.js`.
- 7 source hooks in `morphic.js`: `WorldMorph.init` (global state + `initAccessibility()`), `Morph.changed`
  (geometry+ring sync), `Node.addChild`/`addChildFirst` (reconcile), `Node.removeChild` + `Morph.destroy`
  (teardown), `WorldMorph.edit`/`stopEditing` (text-edit focus reconciliation). All guarded so morphic.js
  still runs without accessibility.js.
- Distinguish `world.focusedMorph` (NEW = the single AT/visual focus, what the ring draws around) from the
  pre-existing `world.keyboardFocus` (raw-key receiver for text edit / menus / ScriptFocusMorph).
- Test harness `snap-dev/morphic-a11y-demo.html` (loads only morphic.js+accessibility.js). Verified in
  browser: roving Tab, two-way sync (no loops), focus-visible ring, activation, aria-activedescendant,
  text-edit handoff to the hidden `morphic_keyboard` textarea, pixel-accurate overlay. Snap! IDE loads
  fine with the layer inert (no morphs opt in until Phase 2). Real VoiceOver/NVDA smoke test left to user.
- Preview: `manual/.claude/launch.json` defines `snap-dev-static` (python http.server on :8765 serving
  snap-dev) for the Claude Preview MCP.

Plan file: `~/.claude/plans/i-need-to-make-tidy-lollipop.md`.
