# Snap! (BYOB) Dev History

## in development:

### 2026-08-15 — accessible dialogs: Open / Save Project, Libraries
* DialogBoxMorph is now an ARIA dialog (role=dialog, aria-modal, named by
  its title, static body text as its description) that traps focus: while
  AT focus is inside, Tab / Shift+Tab cycle through the dialog's own stops
  (wrapping), Escape cancels, and closing the dialog returns focus to the
  morph that had it before it opened; the dialog itself is one stop in the
  world's Tab ring so a keyboard user can always get back into it. On
  popUp the dialog exposes its contents (tagAccessibleContents: push /
  toggle buttons, checkbox / radio toggles, input fields, editable and
  read-only text) and moves focus onto its first stop - or into the text
  field popUp already started editing (widgets.js)
* ListMorph is an ARIA listbox (accessibility.js): ONE tab stop with the
  items as options in aria-activedescendant; Up / Down / Home / End move the
  selection exactly like a click (so a dialog's "show details" action
  runs), Enter fires the list's double-click action (the dialog's default
  button); a ListMorph's inner MenuMorph no longer appears as a menu
* InputFieldMorph is a textbox (when tagged): keyboard-focusing it starts
  editing, Enter / Space activate it, its value is exposed; the hidden
  morphic_keyboard textarea takes the edited field's name while editing so
  the screen reader announces "Search projects" rather than "keyboard
  input"; Tab out of a text field inside a dialog moves to the dialog's
  next stop instead of hopping to the next editable text anywhere in the
  world (a11yFocusScope / a11yTabWithin in accessibility.js)
* Open / Save Project (ProjectDialogMorph): named fields (Project name,
  Search projects, Projects list, Project notes), the Cloud / Examples /
  Computer source buttons are named pressed-state buttons, deliberate Tab
  order (sources, field, list, notes, buttons); Import library
  (LibraryImportDialogMorph): Search libraries, Libraries list, Library
  description (read-only textbox), buttons
* Morph.hide / show / toggleVisibility now sync aria-hidden across the
  hidden subtree (a hidden parent doesn't flip its children's isVisible), so
  e.g. a dialog's hidden Share / Publish buttons stay out of the AT tree
* fixed two parallel-DOM bubbling bugs: focusin / focusout and click
  listeners on nested elements reacted to their descendants' events too
  (focusing a toolbar button made its region the focused morph; Enter on a
  dialog button re-activated the already-closed dialog)
* focus no longer falls off to <body>: destroying a morph whose element (or
  a child's) holds native focus hands focus back to the hidden textarea,
  and orderAccessibleRegions re-focuses the element it moved (re-appending
  a region's node - e.g. after opening a project - blurred the focused
  button inside it, so Enter on a project in the Open dialog left the
  keyboard user with no focus at all)
* tests: new tests/specs/45-dialogs.spec.js (Open / Save Project, Import
  library, generic prompt), the two dialog specs in 40-focus are live;
  loadSnap dismisses the dev-version nag dialog (it takes focus like any
  other dialog now); helpers openExamplesDialog / openLibrariesDialog
* bumped morphic.js, accessibility.js, widgets.js, gui.js ?version= in
  snap.html, morphicVersion / module dates, and the sw.js cache version

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
