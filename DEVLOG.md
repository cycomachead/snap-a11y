# Snap! (BYOB) Dev History

## in development:

### 2026-08-07 — accessibility baseline audit & test harness
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
