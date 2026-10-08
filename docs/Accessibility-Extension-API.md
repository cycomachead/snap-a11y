# Proposed Snap! / Morphic accessibility extension interface

Status: design proposal for ticket #5, based on this fork's source on
2026-10-08. **New interfaces below are proposed, not implemented.** Existing
methods are identified explicitly. This proposal does not change the DOM
contract or claim that the prototype is fully accessible.

The most useful upstream change would be a small, supported interface for
observing UI changes and describing and operating morphs. Morphic should own
lifecycle, focus, input routing, and the parallel DOM. Snap! should own block
semantics, editor commands, and project events. An accessibility adapter can
then connect the two without replacing methods or inspecting visual children.

Accessibility should be available at IDE startup, before a project runs. A
project library loaded through an extension block is insufficient for making
the editor itself accessible.

## What exists, and where integration is difficult

The earlier [accessibility audit](ACCESSIBILITY.md) describes a pre-prototype
baseline. This checkout already includes [accessibility.js](../src/accessibility.js)
and integrations in Morphic and the IDE. The
[prototype handoff](../accessibility-prototype.md) provides background; the
source is the authority for current behavior.

| Existing interface or integration | Limitation that a supported API should address |
| --- | --- |
| [api.js](../src/api.js), documented in [API.md](API.md), controls projects, scenes, broadcasts, variables, XML, and script highlighting. | Broadcast listeners observe project messages, not IDE lifecycle, selection, focus, or semantic changes. |
| [SnapExtensions](../src/extensions.js), documented in [Extensions.md](Extensions.md), registers primitives, input menus, and palette buttons. | Loading JavaScript permits customization but supplies no managed per-IDE install/dispose contract for a UI adapter. |
| [accessibility.js](../src/accessibility.js): `setAccessible`, `setAriaLabel`, `setAria`, `a11yBounds`, `a11yParentMorph`, `a11yHandleKey`, `setFocus`, and `announce`. | Useful foundations already exist, but callers also manage DOM nodes, IDs, active descendants, and private synchronization state. |
| [morphic.js](../src/morphic.js): `Node.addChild`, `addChildFirst`, `removeChild`, `Morph.destroy`, `changed`, and `copy` contain accessibility hooks. | Lifecycle is coupled to the DOM adapter; `changed()` updates geometry as part of repaint invalidation rather than a semantic change contract. Copies explicitly reset accessibility fields. |
| [gui.js](../src/gui.js): `setAccessibleRegions`, called from `fixLayout`, tags regions, buttons, palette items, and scripts. | Rebuilt panes require retagging; the adapter knows fields such as `palette.contents` and writes DOM attributes directly. |
| [gui.js](../src/gui.js): wrappers around `SyntaxElementMorph.showBubble`, `ScriptFocusMorph.fixLayout`, and `stopEditing`. | Results and navigation announcements depend on method replacement and layout timing. Focus announcements are deduplicated by text and `atEnd`, so equal descriptions cannot identify distinct positions. |
| [objects.js](../src/objects.js): `SpriteMorph.searchBlocks` calls `announceSearchResults` and `announceBlockSelection`. | Search behavior directly calls accessibility-specific IDE methods instead of publishing reusable result/selection events. |
| [widgets.js](../src/widgets.js): toggle refresh methods write `aria-pressed` and `aria-checked`. | Widget state and its DOM representation are coupled. |

## Changes in Morphic

### 1. Lifecycle and semantic invalidation

Add a per-world subscription interface, provisionally
`world.observeUI(listener)`, returning an idempotent unsubscribe function.
Publish records with a `type`, affected `morph`, and the relevant old/new
parent or changed-property information. Cover attachment, detachment,
reparenting/order changes, destruction, geometry/clipping/visibility, and
semantic changes. Keep the observer interface independent of Snap! classes.

Add `morph.invalidateAccessibility(changes)` for changes such as name, role,
value, state, or semantic children. Existing setters such as `setAriaLabel`
can delegate to it during migration. Plain property assignment is not an
observable contract: core mutation paths must explicitly invalidate.

The contract must specify:

- Structural notifications occur after the model mutation; detach records
  include the previous parent/world. Destruction is distinguishable from a
  temporary move. Cross-world moves detach from the old world and attach to
  the new one.
- Coalesce geometry and semantic updates for dirty morphs at the end of a
  world cycle. An unchanged world causes no accessibility traversal or DOM
  writes. Ancestor movement, clipping, scrolling, and visibility changes
  also invalidate affected descendants.
- Initial installation takes a snapshot and subscribes without losing
  intervening changes. Focus requests flush required pending updates before
  referring to a DOM node or active descendant.
- Observers cannot cancel core mutations. Report listener errors without
  skipping other listeners or interrupting editor operations. Changes caused
  by a listener enter the next batch rather than recursively dispatching.
- Runtime identity survives reparenting within a world; a copy gets a new
  identity. DOM nodes, listeners, focus state, and adapter-owned mutable data
  are never copied or serialized into projects.

Keep the guarded core hooks already present while migrating consumers. A
standalone Morphic world must still run when the DOM adapter is absent.

### 2. Semantic description and actions

Evolve the existing `ariaLabel`, `a11yBounds`, and `a11yParentMorph` hooks into
a documented descriptor, provisionally `morph.accessibilityInfo()`. It returns
`null` for a decorative morph, or a snapshot containing:

| Field | Meaning |
| --- | --- |
| `role`, `name`, `description` | Semantic role and localized text; never HTML. |
| `states`, `value` | Selected, checked, pressed, expanded, disabled, and value information, as applicable. |
| `parent`, `children` | Semantic morph references and ordered children, independent of decorative canvas children. |
| `bounds`, `visibleBounds` | World-coordinate rectangles; the adapter converts them to DOM coordinates and handles clipping. |
| `focusable`, `navigation`, `activeItem` | Whether this is a focus target, its roving/active-descendant policy, and the current logical item. |
| `actions` | Supported operations such as activate, open context menu, or edit value. |

Retain `a11yIgnore` as a separate subtree exclusion: a decorative parent may
still contain meaningful children. Define consistent semantic ownership,
reject cycles, and give each exposed item one parent. Generate DOM IDs inside
the adapter; callers should pass morph references rather than construct ARIA
relationships themselves. Keep an escape hatch for additional ARIA attributes,
with relationship ownership still managed by the adapter.

Standardize `morph.performAccessibleAction(name, options)` with a handled or
unavailable result. Build on the existing `a11yActivate` hook, invoking the
same underlying operation as the mouse UI. Disabled or detached targets
must not activate. Avoid requiring consumers to synthesize mouse coordinates
or call `mouseClickLeft` to perform editor actions.

Morphic's generic buttons, toggles, menus, and text fields should provide
default descriptions. Snap! adapters provide context-specific descriptions
(a palette template and an inserted block have different roles). Changing a
description must refresh/remove obsolete attributes without losing identity
or focus. Keep DOM creation and updates in `accessibility.js`.

### 3. Focus, text editing, and popup ownership

Keep the distinction already present between `world.focusedMorph` (logical
accessibility focus), `world.keyboardFocus` (raw keyboard receiver), and
native DOM focus. They need coordinated transitions, not forced equality.

Promote the existing `world.setFocus(morph, options)` to a supported interface.
Add a setter for keyboard ownership and migrate direct `keyboardFocus`
assignments in menus, text editing, script editing, and scene changes to it.
Emit focus changes with previous/current targets and input source. Provide a
public way to enter/leave a text or script editing session so
`IDE_Morph.startKeyboardEditing` no longer manipulates `_a11ySyncingFocus` or
focuses the hidden textarea itself.

Morphic should route each key once, in order: active text/composition session,
popup or modal scope, focused composite, then world navigation. Preserve
browser shortcuts and unhandled keys. A menu/dialog focus scope records its
opener, restricts navigation when modal, and restores focus on close. If the
opener was removed, use the nearest surviving focusable semantic ancestor,
then the application entry point. This replaces menu-specific return-focus
bookkeeping and provides the missing general dialog mechanism.

Expose text field name, value, selection, and edit-session changes through the
existing textarea/`CursorMorph` path. Preserve IME composition rather than
creating a competing editable DOM field. Scope listeners to their own world;
one embedded world's keyboard handler must not consume another's input.

## Changes in Snap!

### 4. Stable editor structure and block semantics

Extend the existing `IDE_Morph.accessibleRegions()` idea with stable region
keys and current morph references. Keys such as `palette`, `scripts`, and
`corral` survive pane reconstruction; a region-replaced event supplies the old
and new references. The adapter should not depend on `world.children[0]`,
constructor-name strings, or nested visual container fields.

Put a read-only block description method on `BlockMorph` (provisionally
`describeForAccessibility({context: 'palette' | 'script'})`) and slot
descriptions on input classes in [blocks.js](../src/blocks.js). Return ordered
text/symbol/input parts, input type and literal value, nested reporters and
command stacks, and localized short/full descriptions. Cover custom blocks,
variadic inputs, empty slots, and symbols such as the green flag. Describing a
block must never execute it or evaluate a reporter.

This replaces the visual-child scans in `blockAccessibleLabel`, `templateLabel`,
and `argLabel`, and the global selector override map in `accessibility.js`.
Extensions defining custom primitives need a supported semantic-description
override alongside their primitive registration. Missing overrides fall back
to the block specification and typed slots.

Expose script traversal and the current editing position from `ScriptsMorph`
and `ScriptFocusMorph`: block/input identity plus before/after/inside position.
Provide commands to begin/end editing, move the editing position, insert a
palette block, edit an input, delete, and run a script. Delegate to existing
editor operations, preserving undo and unsaved-change bookkeeping. Validate
stale targets and insertion compatibility before mutation; report failure
without leaving a partially edited script. Navigation policy and spoken
wording stay in the adapter.

### 5. Semantic IDE events

Add `ide.observeEditor(listener)`, returning an unsubscribe function, with
events emitted where operations complete:

| Proposed event | Minimum payload and use |
| --- | --- |
| `project-loaded`, `project-name-changed`, `scene-changed` | Current project/scene identity and name; refresh the entry label and discard obsolete references. Loading means editor regions are ready, not just XML parsed. |
| `region-replaced`, `sprite-selected`, `category-selected`, `editor-tab-changed` | Old/new region or selection references; refresh only affected semantic subtrees. |
| `scripts-changed`, `input-value-changed` | Affected script/block/input and operation; refresh descriptions after edits, undo, or redo. |
| `script-focus-changed`, `script-editing-ended` | Editor, target identity, insertion position, and input source; replace `ScriptFocusMorph` wrappers. |
| `search-results-changed`, `search-selection-changed` | Ordered block matches and selected block; replace the direct announcement calls in `searchBlocks`. |
| `reporter-result`, `runtime-error`, `project-save-finished` | Originating operation/target and value, error, or save outcome; announce actual results rather than inspect a rendered bubble. |

Emit errors/results at their semantic producer before conversion into display
morphs. The `showBubble` wrapper currently identifies errors by an
`AlignmentMorph`; an explicit error event removes that presentation dependency.
Events describe facts, and the adapter decides what merits speech through the
existing `world.announce`. Preserve distinct operations in order, coalesce
redundant state updates, and do not announce layout-only changes.

Use per-IDE listeners with the same cleanup/error-isolation rules as Morphic
observers. These are local JavaScript hooks for trusted editor code. They do
not automatically become methods exposed through the iframe API; serialized
remote commands would need a separate, explicitly bounded contract.

### 6. Adapter registration and disposal

Introduce a small UI-adapter registration facility alongside `SnapExtensions`,
separate from project primitives. A descriptor declares an ID, API major
version, required capabilities, and `install(ide)`, which returns a disposer.
Registration before startup installs after the IDE is ready; registration
after startup also installs once on each ready IDE. Project/scene loads emit
events without reinstalling the adapter. Unregistering or destroying an IDE
disposes it once. Failed installation cleans up partial subscriptions and
reports the missing capability or failure.

The bundled accessibility adapter loads from the application entry point and
works offline; it must not depend on running `src_load` in an inaccessible
project. Preserve the existing policy for loading third-party JavaScript.
Feature detection should use API versions/capabilities rather than Snap!
release strings. Multiple observers can coexist, but one adapter owns the
parallel DOM and native focus for a world.

Disposal must release document/window/canvas listeners, pending announcement
timers, subscriptions, DOM nodes, and the focus indicator. If accessibility is
disabled while the world remains alive, restore canvas exposure and usable
keyboard routing. `initAccessibility()` currently installs listeners; a
matching supported teardown is part of making it reusable.

## Suggested upstream slices and acceptance criteria

Implement these as separate reviewable changes, keeping the current adapter
working during migration:

1. **Semantic events first.** Add script-focus/edit-end and result/error
   events; migrate the three method wrappers in `gui.js` to subscriptions.
   Verify distinct blocks with identical labels still emit distinct focus
   positions, a repaint emits none, and a result/error emits once. This is
   the smallest useful first implementation.
2. **Morphic lifecycle and semantics.** Introduce observation/invalidation,
   descriptions, and actions; migrate generic widgets and DOM writes. Verify
   copy, reparent, hide/show, scroll/zoom, destruction, and disabled activation.
   Check that unchanged cycles do no sync work and standalone Morphic works
   without the adapter.
3. **Focus sessions and scopes.** Migrate keyboard ownership, menus, dialogs,
   and text/script entry. Verify nested popup restoration, removed openers,
   native focus, IME input, and isolation between two worlds.
4. **Snap! semantics and commands.** Migrate region tagging, block descriptions,
   search, and editing. Verify custom/nested/variadic blocks, localization,
   sprite/scene changes, invalid insertions, and undo/redo without prototype
   replacement or direct adapter DOM access from editor code.
5. **Registration and compatibility.** Add managed install/dispose and publish
   the versioned contract. Verify early/late registration, repeated disposal,
   project reload, missing capabilities, and operation with no UI extension.

Use the existing [Playwright harness](../tests/README.md) and its small,
medium, and large project fixtures. Add behavioral tests for these contracts,
including event order, unsubscribe, and listener failure; use DOM focus and
accessibility-tree assertions for integration. Review the older `@spec`
expectations before enabling them: several still describe the pre-prototype
target. Any changed DOM contract must first be agreed in `ACCESSIBILITY.md`.
Actual screen-reader and IME behavior also requires manual validation; an
event API or passing DOM assertions alone cannot establish usability.

The initial upstream request should be for the first slice and agreement on
the Morphic/Snap! boundary. A universal plugin framework, a canvas rewrite,
and a new remote editing protocol are not prerequisites for removing the
current accessibility wrappers.
