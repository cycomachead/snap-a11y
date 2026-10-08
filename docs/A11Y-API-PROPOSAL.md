# What Snap! and Morphic should change to make accessibility work an API, not a patch

*Written October 2026 against this fork (upstream baseline 12.1.0-dev-260808).
Line numbers refer to this fork's tree and will drift.*

This document answers one question: **what in Snap! itself or in Morphic
should change so that the screen-reader / keyboard work in this fork could be
written as an extension against a stable interface**, rather than as edits
spread across `morphic.js`, `widgets.js`, `objects.js`, and a 970-line
addition to `gui.js`.

It is organized as: (1) what the fork had to do and why that hurt, (2) the
proposed interface, grouped into four tiers from "trivial and upstreamable
tomorrow" to "new interaction model", (3) what would live where, and (4) a
suggested order of upstream PRs. The roadmap in [ACCESSIBILITY.md](ACCESSIBILITY.md)
§3.11 ("Upstreaming strategy") points here.

---

## 1. Where the current approach fights the framework

The prototype (`src/accessibility.js`, see
[accessibility-prototype.md](../accessibility-prototype.md)) works. But a
`git diff` against upstream shows every place it had to reach *into* Snap!
rather than plug *onto* it. Each of these is a missing seam.

| # | What the fork had to do | Where | Why it hurts |
|---|---|---|---|
| 1 | Edit `Node.addChild`, `addChildFirst`, `removeChild`, `Morph.destroy`, `Morph.changed`, `Morph.copy` inline | `src/morphic.js` | Morphic has no observable tree-lifecycle or geometry-change notification other than `parent.childChanged()`. Every consumer of "a morph appeared / moved / vanished" has to patch the core. `changed()` is also the 60 fps damage hot path, so the a11y geometry sync now runs there. |
| 2 | Invent a semantic vocabulary (`isAccessible`, `ariaRole`, `ariaLabel`, `a11yFocusMode`, `excludeFromTabRing`, …) on `Morph.prototype` and then *assign it per instance* from the IDE (16 per-instance closure overrides such as `a11yParentMorph = () => palette` in `gui.js`) | `src/accessibility.js`, `src/gui.js` | Widgets already know what they are (`PushButtonMorph.hint`, `labelString`, `ToggleButtonMorph.state/query`, `TabMorph`, `SpriteIconMorph.object.name`, category buttons' `category`) but expose none of it through a common protocol. So the IDE has to re-describe every widget from outside, and anything created later or elsewhere (dialogs, BYOB editor, watchers) is silently unlabeled. |
| 3 | Re-run a tagging walk (`setAccessibleRegions` → buttons, categories, palette, scripts) on every `IDE_Morph.fixLayout` | `src/gui.js` | `createPalette`, `createSpriteEditor`, `createCorral`, `createSpriteBar` **destroy and recreate** their panes on category / tab / sprite switch, and the IDE emits no "pane replaced" event. The only reliable hook was `fixLayout`, which is also the layout hot path. |
| 4 | Add a *second* focus concept (`world.focusedMorph`) beside `world.keyboardFocus`, and poll `document.activeElement` to decide who owns a keystroke | `src/accessibility.js` | `world.keyboardFocus` is a bare property written directly from 10 places (`DialogBoxMorph.popUp`, `ScriptFocusMorph.getFocus`, `PianoMenuMorph`, `IDE_Morph` ×2, `StageMorph`, …). There is no setter, so nothing can observe focus changes, and the framework has no notion of "which morph the user is on" separate from "who receives raw keys". |
| 5 | Register a document-level capture `keydown` listener and manually arbitrate against the hidden textarea's own capture listener (text editing, `ScriptFocusMorph`, menus) | `src/accessibility.js` `handleA11yKeydown` | Key routing is hard-wired in `WorldMorph.initKeyboardHandler` (`src/morphic.js:12417`): textarea → `keyboardFocus.processKeyDown`. There is no single dispatcher a module can sit in front of. Tab is swallowed unconditionally there (`keyCode === 9 → preventDefault`). |
| 6 | Null out `world.onNextStep` from inside menu code | `MenuMorph.syncAccessibleMenuFocus` | The Safari right-click kludge in `initEventListeners` (`src/morphic.js:12544`) blurs and re-focuses the hidden textarea one cycle later, which steals native focus from any real DOM element. It is unconditional. |
| 7 | Add `Morph.prototype.a11yWorld()` | `src/accessibility.js` | `MenuMorph` shadows the `world()` **method** with a `world` **property** (`popup`: `this.world = world`). Any generic code that walks morphs breaks on menus. |
| 8 | Edit `MenuMorph.popup/getFocus/select/leaveSubmenu/destroy` and `MenuItemMorph.popUpSubmenu` inline | `src/morphic.js` | Menus have internal keyboard state (`selection`, `hasFocus`, `activeMenu`) but no lifecycle or selection-changed notifications. |
| 9 | Edit `ToggleButtonMorph.refresh` and `ToggleMorph.refresh` to mirror `aria-pressed` / `aria-checked` | `src/widgets.js` | Widgets have no "my state changed" notification; `refresh()` is the only place state becomes visible. |
| 10 | Build block labels by walking `parts()`, reading `.text`, and classifying slots with **regexes on `constructor.name`** (`/SlotMorph$/`, `/CSlotMorph$/`, `/CommandSlotMorph$/`; 10 occurrences in `gui.js`) | `IDE_Morph.blockAccessibleLabel`, `templateLabel`, `lineArguments`, `blockInputItems` | Blocks have `blockSpec`, `abstractBlockSpec()` (inputs as `_`), `toString()` (debug), `components()`/`syntaxTree()` (metaprogramming), and `localizeBlockSpec()`, but **no speakable rendering**. Symbol parts (`$greenflag`, `$turtle`, `$clockwise`…) become a `BlockSymbolMorph` with only a glyph name. Slot kinds are only discoverable by class. Minification or a renamed class silently breaks every label. |
| 11 | Keep a hand-maintained `A11yBlockTemplateLabels` override map (`doFor: 'for i loop'`) | `src/accessibility.js` | No per-primitive accessible-name field in `SpriteMorph.prototype.blocks` / `initBlocks`. |
| 12 | Wrap `ScriptFocusMorph.fixLayout` and dedupe against repaints to detect "focus moved" | `src/gui.js` | Keyboard script editing has no "moved to element X" or "exited" event; `fixLayout` is layout, not semantics. |
| 13 | Wrap `SyntaxElementMorph.showBubble`, and edit `SpriteMorph.searchBlocks` inline | `src/gui.js`, `src/objects.js` | No IDE-level notification channel for user-facing events (result shown, error, search results, project loaded, sprite selected, block snapped). The fork invented `world.announce()` and then had to find every emitter by hand. |
| 14 | Read `scripts.lastDroppedBlock` / `lastDropTarget` after the fact | planned | `HandMorph.grab/drop` and `CommandBlockMorph.snap` have a rich *mouse* protocol (`prepareToBeGrabbed`, `reactToGrabOf`, `justDropped`, `reactToDropOf`, `closestAttachTarget`) but no programmatic "pick up this block, move it, drop it here" entry point for a keyboard user, and no post-snap notification. |
| 15 | Nothing yet for dialogs | `DialogBoxMorph` | `popUp` sets `keyboardFocus`, `processKeyDown` handles only Enter/Esc, Tab cycling happens implicitly via `edit()`. No modal concept, no focusable-children list, no title accessor usable as an accessible name. |
| 16 | Load `accessibility.js` right after `morphic.js` | `snap.html` | Because it loads **before** `widgets.js`, `blocks.js`, `gui.js`, it can only extend Morphic classes. Everything about buttons, blocks, or the IDE had to go into `gui.js` (the file that loads last). The `modules` registry records versions but has no init-after-load hook. |
| 17 | Use `localize()` on strings such as "argument", "empty", "script N" that have no dictionary entries | `src/gui.js` | Works (passthrough) but there is no namespace for interface-description strings, so translators never see them. |
| 18 | Re-add the focus ring to the world on every update to keep it on top | `WorldMorph.updateFocusRing` | Morphic has no overlay layer; only `HandMorph` is guaranteed to paint above children. |

The recurring theme: **Morphic and Snap! know everything the screen reader
needs, but expose it only through rendering.** The fix is to make the same
knowledge available as data (names, roles, states, structure) and as events
(appeared, moved, focused, changed, snapped), so a module can consume it
without patching.

---

## 2. Proposed interface

Four tiers. Each tier is independently useful and independently upstreamable.
Names are suggestions in Morphic's style (verbs on prototypes, `reactTo…`
hooks); the shapes matter more than the spelling.

### Tier 0 — small core fixes that remove patches (no behavior change)

These are one-liners or near, carry no risk for sighted users, and would let
`accessibility.js` drop most of its inline edits to `morphic.js`.

1. **`MenuMorph`: stop shadowing `world()`.** Rename the property set in
   `MenuMorph.popup` / `MenuItemMorph.popUpSubmenu` to e.g. `targetWorld`,
   or set it and keep `world()` working. Removes `a11yWorld()` and a class of
   latent bugs for *any* generic morph walker.

2. **`Morph.prototype.copy`: a transient-state hook.** `copy()` is a shallow
   clone, so anything caching a DOM node, an id, or an observer is duplicated
   (this is how palette-template a11y nodes leaked into dragged blocks).
   Proposal: `copy()` calls `c.initTransient()` (default no-op); modules
   override it to clear their caches. Replaces the seven `c.a11y… = null`
   lines now in `morphic.js:4130`.

3. **A world-owned keyboard-focus setter.** Replace the ten direct writes to
   `world.keyboardFocus` with `world.setKeyboardFocus(morph)` /
   `world.releaseKeyboardFocus(morph)`, which call `morph.reactToKeyboardFocus()`
   / `reactToLoseKeyboardFocus()` and notify observers (Tier 2). Keep the
   property readable for compatibility. Without this the a11y layer can never
   know *when* a dialog, menu, or `ScriptFocusMorph` took over.

4. **Make the Safari refocus kludge overridable.** In `initEventListeners`
   (`src/morphic.js:12544`) guard the `this.keyboardHandler.blur(); onNextStep =
   () => keyboardHandler.focus()` pair with a predicate the world owns, e.g.
   `if (this.wantsNativeKeyboardFocus())` (default `true`). A module that has
   moved native focus onto a real element returns `false`.

5. **Single key dispatcher.** Route the textarea's `keydown`/`keyup`/`keypress`/
   `input` listeners through one method, `WorldMorph.prototype.dispatchKeyEvent(kind, event)`,
   that (a) asks `this.keyboardFocus`, and (b) can be overridden/wrapped
   once. Stop unconditionally `preventDefault`-ing Tab there; let the receiver
   decide (`handlesTabKey`, as in the fork's earlier experiment, or simply
   return `true` from `processKeyDown`).

6. **Tree-lifecycle notifications.** `Node.addChild` / `addChildFirst` /
   `removeChild` call `aNode.justAddedTo(parent)` / `aNode.reactToRemovalFrom(parent)`
   (default no-ops) **and** forward to a world-level observer (Tier 2). This
   replaces the inline `createAccessibleElementTree()` /
   `destroyAccessibleElementTree()` calls and is useful far beyond a11y
   (inspectors, undo, telemetry).

7. **Geometry-change notification off the damage path.** `Morph.changed()`
   should not grow consumers. Instead the world collects `changed` morphs into
   a per-cycle set and, after `updateBroken()` in `doOneCycle`, calls
   `observer.morphsChanged(set)`. The a11y layer then syncs geometry once per
   frame for only the morphs that moved, instead of on every `changed()` call.

8. **`modules` with init hooks and a documented load order.** Today
   `modules.accessibility = '2026-06-29'` is only a version stamp. Give
   optional modules a registration call, e.g.
   `Morphic.registerModule(name, {initWorld(world), initIDE(ide)})`, invoked
   from `WorldMorph.init` and `IDE_Morph.openIn`. Then an a11y module can be
   loaded **after** `gui.js` (so it may extend `PushButtonMorph`,
   `BlockMorph`, `IDE_Morph`) and still initialize at the right moments.
   `snap.html` / `sw.js` already know how to add a script; this removes the
   "must be second in the list" constraint that pushed 970 lines into `gui.js`.

9. **`WorldMorph.prototype.addOverlay(morph)`.** A small "always on top"
   list painted after children (the hand already behaves this way). Used by
   the focus ring, usable by any highlight / hint layer.

### Tier 1 — a semantic protocol on existing classes

The point of this tier: **the class that knows what a widget is should say
so**, with defaults good enough that most of Snap! becomes labelled with no
per-instance code. These are plain methods; they do not create any DOM and
have no cost unless someone calls them.

```text
Morph.prototype
  accessibleRole()      -> null (default) | 'button' | 'checkbox' | 'radio' | 'tab' |
                           'listbox' | 'option' | 'menu' | 'menuitem' | 'region' | 'dialog' …
  accessibleName()      -> string | null   (default: this.hintString() if any)
  accessibleDescription() -> string | null (default: null)
  accessibleState()     -> { pressed?, checked?, expanded?, selected?, disabled?, hasPopup? }
  accessibleChildren()  -> Morph[]  (default: children; composites override to flatten/filter)
  isDecorative()        -> boolean  (default: false; true for shadows, textures, rings)
  accessibleBounds()    -> Rectangle (default: this.bounds; regions may span more)
```

Defaults per class, all derivable from state the class already holds:

| Class | role | name | state |
|---|---|---|---|
| `PushButtonMorph` | `button` | `labelString` if a string, else `hint` | `disabled` |
| `ToggleButtonMorph` | `button` (or `radio` inside a radiogroup, see below) | as above, else `category` capitalized | `pressed: this.state` |
| `TabMorph` | `tab` | the string part of the `[SymbolMorph, string]` label | `selected: this.state` |
| `ToggleMorph` | `checkbox` | `captionString` / `labelString` | `checked: this.state` |
| `MenuMorph` | `menu` | `title` | — |
| `MenuItemMorph` | `menuitem` | string part of `labelString` | `hasPopup/expanded` when `action instanceof MenuMorph` |
| `DialogBoxMorph` | `dialog` | `title` (expose it; today it is only a child `TextMorph`) | `modal: true` |
| `InputFieldMorph`, `StringMorph`/`TextMorph` when editable | `textbox` | nearest label (dialog can supply) | — |
| `SpriteIconMorph` | `tab`/`option` | `object.name` | `selected` from the existing `query` |
| `CostumeIconMorph`, `SoundIconMorph` | `option` | `object.name` | — |
| `WatcherMorph` | `status`/`group` | `labelText` + value | — |
| `FrameMorph`/`ScrollFrameMorph` | `null` (decorative unless the IDE names it) | — | — |

Snap!-specific additions:

- **`IDE_Morph.prototype.panes()`** returning the named, ordered landmark
  list the fork hard-codes in `accessibleRegions()`:
  `{controlBar, categories, palette, spriteBar, spriteEditor, stage, corralBar, corral}`.
  Each pane answers `accessibleRole() === 'region'` and a localized name. The
  categories pane answers `radiogroup`; its buttons answer `radio`.

- **Speakable text for blocks.** This is the single most valuable addition
  and belongs in `blocks.js`, not in the IDE:

  ```text
  SyntaxElementMorph.prototype.speakableText(options) -> string
      BlockMorph:        label words + each input's speakableText, in parts() order;
                         options.withInputs=false gives the palette/template form
                         (what templateLabel() hand-rolls today)
      ArgMorph & heirs:  "<slot kind> <value>"  e.g. "number 10", "text hello",
                         "boolean true", "empty number slot", "list input",
                         "dropdown: space"; InputSlotMorph uses contents().text /
                         evaluateOption(); BooleanSlotMorph its value; ColorSlotMorph
                         a color name or hsv
      MultiArgMorph:     joins its slots, mentions arity ("2 inputs")
      CSlotMorph / CommandSlotMorph: "with N nested blocks" (never the nested text,
                         the consumer walks those as lines)
      RingMorph:         "ring containing <inner speakableText>"
      BlockSymbolMorph:  its alt text (next bullet)
  ```

  Plus the structural predicates the fork fakes with `constructor.name`
  regexes: `ArgMorph.prototype.isStatementSlot()` (C-slot or command slot),
  `isNavigableInput()`, and `BlockMorph.prototype.descendantInputs()` (reading
  order, descending into plugged-in reporters and multi-args, skipping
  statement slots). `blockSequence()`, `allChildren()`, `inputs()` already
  exist; this just names the traversal the a11y layer needs.

- **Alt text for symbols.** `SyntaxElementMorph.prototype.labelParts`
  (`src/blocks.js:311`) already describes every `$symbol` with
  `{type:'symbol', name, color, scale}`. Add `alt: 'green flag'` etc. and have
  `BlockSymbolMorph.speakableText()` return it. Same for `SymbolMorph` used
  as button icons (`SymbolMorph.prototype.names` in `symbols.js` could carry a
  parallel `altNames` table), which would label every icon-only toolbar button
  for free.

- **Per-primitive accessible names.** Allow an optional `a11y` (or `spoken`)
  field in `SpriteMorph.prototype.blocks` entries so that "for i loop" style
  overrides live with the block definition and are localizable, replacing the
  global `A11yBlockTemplateLabels` map. Custom blocks get the same via the
  block editor (a field in `CustomBlockDefinition`), which also solves the
  "custom block editor is inaccessible" item in the TODO list half-way:
  authors can at least name their blocks.

- **Dialogs.** `DialogBoxMorph.prototype.focusableElements()` (the inputs
  and buttons in Tab order; the dialog already knows them because `edit()`
  iterates children) and `title` as a real accessor. Then a generic focus
  trap can be written once.

- **Localization namespace.** A `SnapTranslator.dict.*.a11y` sub-dictionary
  (or a documented prefix) for interface-description strings, so "argument",
  "empty", "script", "N blocks" show up for translators.

### Tier 2 — events: let the IDE tell the module what happened

Everything the fork wraps or edits inline becomes a notification. One small
observer mechanism on the world (and mirrored on the IDE) is enough:

```text
WorldMorph.prototype.addObserver(obj)   // obj implements any subset of:
  morphAdded(morph, parent)        morphRemoved(morph, parent)
  morphsChanged(Set<Morph>)        // once per cycle, see Tier 0 #7
  keyboardFocusChanged(now, before)
  menuOpened(menu, trigger)        menuSelectionChanged(menu, item)   menuClosed(menu)
  dialogOpened(dialog)             dialogClosed(dialog)
  textEditStarted(morph)           textEditStopped(morph)
  grabbed(morph, hand)             dropped(morph, target, hand)
  overlayFrameRendered()           // optional, after the ring/overlays paint

IDE_Morph.prototype.addObserver(obj)
  paneReplaced(name, newMorph, oldMorph)   // from createPalette/createSpriteEditor/…
  layoutFixed(situation)                   // after fixLayout
  spriteSelected(sprite)                   tabChanged(name)      categoryChanged(name)
  projectOpened(project)                   projectNameChanged(name)
  message(text, kind)                      // showMessage / inform / error bubbles
  resultShown(value, block)                // from showBubble
  searchResults(blocks, selection)         searchSelectionChanged(block)
  blockSnapped(block, target, scripts)     // from CommandBlockMorph.snap / ReporterBlockMorph.snap
  scriptRunStarted(block) / scriptRunStopped(block)   // thread manager
  keyboardEditingMoved(focus, element)     keyboardEditingStopped(focus)   // ScriptFocusMorph
```

Most emitters already have an obvious single line to put the call on:
`IDE_Morph.createPalette` (after `this.add(this.palette)`),
`SyntaxElementMorph.showBubble`, `SpriteMorph.searchBlocks` where it calls
`showSelection()`, `CommandBlockMorph.snap` where it sets `scripts.lastDropTarget`,
`ScriptFocusMorph.fixLayout`/`stopEditing`, `MenuMorph.popup/select/destroy`,
`DialogBoxMorph.popUp/destroy`, `WorldMorph.edit/stopEditing`,
`HandMorph.grab/drop`. The fork has, in effect, already found them all; the
proposal is to make the call sites official and the consumer pluggable.

With Tier 2 in place the fork's `WorldMorph.announce()` becomes a *consumer*
of these events, and the inline edits in `objects.js`, `widgets.js`, and the
wrappers in `gui.js` disappear.

### Tier 3 — a keyboard interaction model the UI can expose

These change behavior for everyone and need design discussion with upstream,
but each has a natural home:

1. **Programmatic grab / move / drop.** `HandMorph.prototype.grab()` and
   `drop()` already implement the protocol; what is missing is driving them
   without a mouse. Proposal: `ScriptsMorph.prototype.pickUp(block)`,
   `moveCarried(deltaOrTarget)`, `dropCarried()` that reuse
   `closestAttachTarget()` and `snap()`, so the a11y layer can offer the
   APG-style "grab, arrow to a target, drop" flow and announce
   `blockSnapped`. The existing `ScriptFocusMorph` (insert-at-cursor model)
   stays; this adds the move-existing-block half it lacks.

2. **Keyboard editing as a first-class, observable mode.** `ScriptsMorph.prototype.enableKeyboard`
   is already a setting and `BlockMorph.focus()` already starts editing at a
   block. Add `ScriptFocusMorph.prototype.describe()` (speakable position,
   the fork's `scriptFocusAccessibleText`) and the Tier 2 events, and make
   "Keyboard editing" default on.

3. **Context menus from the keyboard.** `Morph.prototype.contextMenu()`
   already builds the menu; add `Morph.prototype.popUpContextMenu(world, atBounds)`
   so Shift+F10 / the Menu key can open it at the focused morph. Menus are
   already keyboard-navigable.

4. **Splitters.** `PaletteHandleMorph` / `StageHandleMorph` get
   `nudge(delta)` so they can be exposed as `separator` with arrow keys.

5. **Dialog focus trap.** With `focusableElements()` (Tier 1) and
   `dialogOpened/Closed` (Tier 2), `DialogBoxMorph.processKeyDown` can own Tab
   cycling explicitly instead of via `edit()`, and the module can trap and
   restore native focus.

6. **A "quiet editing" switch.** `StageMorph.fireKeyEvent` runs "when key
   pressed" hats on every keystroke that reaches the stage. A
   `StageMorph.prototype.suspendKeyEvents` flag (set while keyboard-driven
   editing is active) stops projects from reacting to navigation keys.

7. **Preference.** `MorphicPreferences.enableAccessibility` (framework) and
   an IDE setting (`saveSetting('a11y', …)`) in `accessibilityMenu`, so the
   overlay can be default-on but switchable, and tests can flip it.

---

## 3. What lives where

| Layer | Owns | Does *not* own |
|---|---|---|
| **Morphic** (`morphic.js`) | Tier 0 fixes; observer mechanism; `accessibleRole/Name/State/Children/Bounds` defaults on `Morph`, `MenuMorph`, `MenuItemMorph`, `StringMorph`; keyboard-focus setter; key dispatcher; overlay layer; `addOverlay` | Anything ARIA- or DOM-specific beyond the method names. Morphic stays a canvas framework; it only has to *describe* itself. |
| **Snap! widgets & blocks** (`widgets.js`, `blocks.js`, `byob.js`, `objects.js`) | Semantic defaults for buttons, toggles, tabs, dialogs, icons; `speakableText()`, slot predicates, symbol alt text, per-primitive names; `blockSnapped`, search, keyboard-editing events; grab/move/drop API | Any DOM. |
| **IDE** (`gui.js`) | `panes()`, pane/tab/sprite/project events, `message`/`resultShown`, the accessibility preference | Tagging individual widgets (that becomes each class's job). |
| **Accessibility module** (`accessibility.js`, loaded after `gui.js`, registered via `modules`) | The parallel DOM projection: create/sync/destroy elements from `accessibleRole/Name/State`; two-way focus sync; roving / activedescendant composites; focus ring; live region; keyboard navigation between panes; everything ARIA | Patches to core files. Target: zero inline edits outside the module. |

Under this split the module shrinks to the generic projection (today roughly
the first 600 lines of `accessibility.js`) plus Snap!-specific *policies*
(which pane is a listbox, which keys do what), and the IDE loses the 970-line
tagging walk because each widget already answers the questions.

---

## 4. Suggested upstream sequence

Ordered to maximize what can be merged with no visible change to Snap! and
to validate the design before the larger pieces:

1. **PR 1 — Tier 0 #1, #2, #3, #4, #6** (menu `world` property, `initTransient`,
   `setKeyboardFocus`, overridable refocus kludge, tree hooks). Pure
   plumbing, each a few lines, each independently justifiable on
   maintainability grounds.
2. **PR 2 — `modules` init hooks + load-order note** in `docs/Extensions.md`
   (Tier 0 #8). Lets this fork load `accessibility.js` last and delete most
   of what is now in `gui.js`, which is the best demonstration that the
   hooks are sufficient.
3. **PR 3 — `speakableText()`, slot predicates, symbol alt text** (Tier 1).
   Self-contained in `blocks.js` / `symbols.js`, testable with plain unit
   assertions, and useful on its own (search, debugging, text export).
4. **PR 4 — `accessibleRole/Name/State` defaults** across `morphic.js`,
   `widgets.js`, `gui.js` (Tier 1). No behavior change; reviewable
   class-by-class.
5. **PR 5 — world/IDE observers and the event call sites** (Tier 2, plus
   Tier 0 #5 and #7). The only PR that touches hot paths; ship with the
   per-cycle batching so `changed()` stays untouched.
6. **PR 6+ — Tier 3 items**, one per PR, each with its own UX discussion.

After PR 2 the fork can already restructure so that `src/accessibility.js`
is the *only* file that differs from upstream apart from `snap.html`/`sw.js`;
after PR 5 the module needs no knowledge of IDE internals beyond the public
pane names and the event list above.

---

## 5. Things deliberately *not* proposed

- **Rewriting Snap! on the DOM.** The parallel-DOM projection keeps Morphic's
  rendering model and is the same approach Flutter web uses; the proposals
  above make it cheaper, not different.
- **Baking ARIA into `morphic.js`.** Morphic should describe roles and names
  in its own terms; mapping to ARIA (and to anything else, e.g. a text dump
  for tests) is the module's job.
- **Changing `keyboardFocus` semantics.** It stays the raw-key receiver. The
  proposal only adds a setter and observers so the module can mirror it.
