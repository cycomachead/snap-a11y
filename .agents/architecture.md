# How Snap!/Morphic actually works (facts that matter for a11y work)

## Everything is one canvas

The entire IDE is painted onto `<canvas id="world">` (`snap.html`) by
morphic.js. The DOM contains only that canvas and a hidden
`<textarea id="morphic_keyboard">`; palette, blocks, menus, and dialogs
have **no DOM existence**. This is why screen readers perceive nothing and
why the roadmap (docs/ACCESSIBILITY.md) is built around a parallel DOM.

Key globals in the page: `world` (the `WorldMorph`), and
`world.children[0]` is the `IDE_Morph`. From there:
`ide.controlBar`, `ide.categories`, `ide.palette`, `ide.spriteEditor`,
`ide.corral`, `ide.stage`, `ide.currentSprite`, `ide.sprites` (a Snap!
`List` — use `.asArray()`).

## Keyboard input path

All keystrokes go: hidden textarea (`WorldMorph.initKeyboardHandler`,
`src/morphic.js` ~line 12337) → `world.keyboardFocus.processKeyDown/
Press/Up`. `world.keyboardFocus` is Morphic's *internal* focus — invisible
to the browser and to assistive tech. Current focus holders:

- `CursorMorph` — text editing (binds the textarea for IME).
- `MenuMorph` — arrow/enter/esc menu navigation (morphic.js ~8412).
- `DialogBoxMorph` — tab cycling, enter/esc (widgets.js ~2901).
- `ScriptFocusMorph` — keyboard block editing (blocks.js), entered via
  `scripts.toggleKeyboardEntry()`; gated on
  `ScriptsMorph.prototype.enableKeyboard`.

## Timing: the world steps at 60 fps

`world.doOneCycle()` runs on a requestAnimationFrame loop (snap.html).
Some reactions are queued via `nextSteps` and happen on a *later cycle* —
notably, typing the first character in keyboard-entry mode opens the
palette block-search field and moves `keyboardFocus` into it one cycle
later. Consequences for automation:

- Type with an inter-key delay (~100 ms) when the UI reacts to keys.
- Poll for state changes (`expect.poll`) instead of asserting immediately
  after a keystroke.

## Loading projects via URL

`snap.html#open:<url-or-xml>` fetches and opens a project
(`interpretUrlAnchors`, `src/gui.js` ~549). Relative same-origin URLs
work — `tests.html` and the fixture spec rely on
`snap.html#open:tests/fixtures/<file>.xml`. Project readiness signal:
`world.children[0].getProjectName()` returns the loaded project's name.
