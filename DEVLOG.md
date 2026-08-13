# Snap! (BYOB) Dev History

## in development:

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
* bumped morphic.js ?version= in snap.html and morphicVersion
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
