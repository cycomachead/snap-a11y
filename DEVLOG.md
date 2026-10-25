# Snap! (BYOB) Dev History

## in development:

### 2026-10-24 — sync with upstream & Execution Log extension
* merged jmoenig/Snap master (v12.3.6, 226 commits) into the a11y fork;
  conflicts were limited to the snap.html script cache-busters and the
  sw.js cache version
* new src/execution-log.js, an extension that is loaded by default from
  snap.html: a notebook-style "Execution Log" pane for the "Blocks only"
  (functions-first) mode that records - top to bottom, oldest to newest -
  every script the user runs (clicked or activated via the keyboard)
  together with who ran it, when, how it ended (done / stopped / error)
  and what it reported, rendered the way a result bubble would (text,
  booleans, colors, lists & tables, costumes, sounds, rings, sprites,
  pictures, errors)
* command scripts have no result, so each run compares a tiny thumbnail
  of the (hidden) stage before and after; if it differs (sprites moved or
  drawn, pen trails, speech bubbles, watchers) a picture of the stage
  after the run becomes part of the entry, exportable as a PNG
* "Execution Log" is a project setting right below "Blocks only" in the
  project settings menu and is saved with the project (scene attribute
  executionlog="true"); turning it on also turns "Blocks only" on because
  the pane takes the place of the stage & sprite panes, turning "Blocks
  only" off hides the log. The pane has a resize handle like the stage.
  ExecutionLog.enabledByDefault (false) decides whether new projects
  start with both switched on
* each entry's script picture can be dragged back into the scripting
  area (a fresh copy, like dragging a block out of a result bubble) or
  added there via the entry's context menu / Enter key; results can be
  exported (text, CSV / JSON, PNG, SVG, WAV, XML), copied, or opened in a
  table dialog; the whole log exports as a <scriptsonly> XML file that
  Snap! imports again, optionally with each result attached as a comment
* accessibility: the pane is an "Execution Log" landmark, each entry a
  Tab stop (role group) whose label reads the script, its state and its
  result; Enter / Space adds the script to the scripting area and
  announces it
* extension primitives for scripts: log_clear(), log_count(),
  log_result(n), log_script(n) (the script as a ring)
* everything is additive: the extension wraps IDE_Morph (buildPanes,
  fixLayout, hideSpritePanes, openProject, refreshIDE, newProject,
  projectSettingsMenu, accessibleRegions), ThreadManager (startProcess,
  removeTerminatedProcesses, toggleProcess, stopProcess, stopAll),
  Process.throwError, SnapSerializer.loadScene and Scene.toXML
* tests: new tests/specs/80-execution-log.spec.js
* added src/execution-log.js to snap.html (after api.js) and to the sw.js
  precache list; bumped the PWA cache version to 12.3.6-a11y

### 2026-08-13 — merge the parallel-DOM screen-reader prototype
* merged the morphic-a11y-prototype branch: src/accessibility.js now
  mirrors opted-in morphs into a parallel, invisible DOM tree (roving
  tabindex, aria-activedescendant, live-region announcements, two-way
  focus sync), with IDE landmark/toolbar/palette wiring in gui.js
* the prototype supersedes the earlier canvas focus-ring experiment in
  morphic.js — in the merge the canvas system (acceptsFocus, isFocused,
  setFocusedMorph, drawFocusRing, world-level tab handling) was removed
  in favor of the parallel DOM's focus manager; focus-visible semantics
  are preserved: the FocusIndicatorMorph ring only shows when the last
  input was the keyboard, and native browser Tab now drives navigation
  through real DOM elements
* restored the aria-label on the hidden morphic_keyboard textarea (the
  prototype was replayed onto vanilla sources and dropped it); it still
  receives real focus during text editing and axe flags it otherwise
* added src/accessibility.js to snap.html (after morphic.js) and to the
  sw.js precache list; bumped the PWA cache version
* tests: helpers and specs no longer assume the IDE is
  world.children[0] (the focus ring is added to the world first);
  replaced the "AX tree exposes almost nothing" baseline with positive
  assertions on the landmarks, category radios, and toolbar buttons the
  parallel DOM now exposes

### 2026-08-13 — sync with upstream & focus-visible ring semantics
* merged jmoenig/Snap master (12.1.0-dev-260808, 83 commits) into the a11y
  fork; conflicts were limited to snap.html script cache-busters and the
  sw.js cache version
* focus rings now mirror CSS :focus-visible semantics: the world tracks
  the user's input modality (pointer vs. keyboard), and a focused morph
  only draws its ring when focus was acquired via the keyboard or when
  the morph itself takes keyboard input (editable text), never when a
  block, button, or pane is clicked or dragged with the mouse
* Morph.copy() no longer transfers isFocused to copies, which used to
  leave a permanently stuck ring on blocks dragged out of the palette
  (template blocks are copied on grab) after the template had been
  clicked
* focused morphs are only scrolled into view on keyboard focus; clicking
  a palette block no longer makes the palette jump sideways mid-grab
* Enter (13) now activates the focused morph alongside space; the
  previous keyCode 35 was the End key
* fixed the "this.world is not a function" TypeError in the focus
  cleanup added to Morph.destroy: MenuMorph shadows the world() method
  with a property, so destroying any menu (e.g. the "loading..."
  message during snap.html#open:) threw and aborted project loading;
  destroy now uses root() and also clears focus when a destroyed
  morph contains the focused morph
* tab now navigates the IDE: the stage holds the world's keyboardFocus
  but never consumed tab (its processKeyPress is a nop), so tab did
  nothing; morphs that really use tab themselves declare handlesTabKey
  (CursorMorph, ScriptFocusMorph) and everything else lets tab move
  the world focus with a visible ring; space/enter activate the
  keyboard-focused morph; dialogs declare trapsFocus so tab cycles
  inside them while they hold the keyboard focus
* bumped morphic.js, blocks.js, and widgets.js ?version= in snap.html
  and morphicVersion
* audited the v12.0.6 baseline for screen reader / keyboard accessibility;
  findings, remaining tasks, phased plan, and the parallel DOM contract are
  in docs/ACCESSIBILITY.md
* added a Playwright + axe-core test harness under tests/ covering roles,
  labels, focus, keyboard behavior, and accessibility-tree inspection;
  future-facing tests are checked in as fixme-marked executable specs
  (see tests/README.md)
* seed fixes: lang attribute on snap.html and index.html, aria-label on
  the hidden morphic_keyboard textarea (morphic.js), world canvas
  tabindex 1 -> 0 (positive tabindex is a WCAG anti-pattern)
* bumped morphic.js ?version= in snap.html and the sw.js cache version so
  browsers and the PWA service worker pick up the modified sources
* added tests.html, a dev launcher page to open one of three fixture
  projects (tests/fixtures/) or a new project; fixtures are also loaded
  by tests/specs/05-fixtures.spec.js
* added .agents/ notes (architecture, caching, testing) for future
  contributors and coding agents
