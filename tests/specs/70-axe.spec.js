// Automated WCAG scanning with axe-core.
//
// With a canvas-only UI axe can only see the host page, so this is mostly
// a guard for document-level regressions today. As the parallel DOM
// grows, axe will automatically start checking it (ARIA validity, name
// computation, role nesting), which is exactly what we want.

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { loadSnap } = require('../helpers/snap');

// Rules that are known to fail at the current phase. Shrink this list as
// phases complete; never grow it without a note in docs/ACCESSIBILITY.md.
const KNOWN_FAILING_RULES = [
    // Nothing is inside a landmark yet: the page is just the canvas and
    // the hidden keyboard textarea. Resolved by the Phase 1 parallel DOM.
    'region'
];

test.describe('axe-core scan', () => {
    test('the page has no unexpected WCAG violations', async ({ page }) => {
        await loadSnap(page);
        // axe's default (document) context fails to resolve on this page
        // ("No elements found for include in page Context"), so scan from
        // <body>. html-level rules (e.g. html-has-lang) are covered by
        // 10-document.spec.js instead.
        const results = await new AxeBuilder({ page })
            .include('body')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
            .analyze();
        const unexpected = results.violations.filter(
            v => !KNOWN_FAILING_RULES.includes(v.id)
        );
        expect(
            unexpected.map(v => ({
                rule: v.id,
                impact: v.impact,
                help: v.help,
                nodes: v.nodes.map(n => n.target.join(' '))
            }))
        ).toEqual([]);
    });
});
