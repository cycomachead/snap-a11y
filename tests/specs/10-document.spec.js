// Document-level semantics: things that must be true of the host page
// regardless of the parallel DOM. These pass today (Phase 0).

const { test, expect } = require('@playwright/test');
const { loadSnap } = require('../helpers/snap');

test.describe('document-level accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('the document declares a language', async ({ page }) => {
        await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
    });

    test('the document has a meaningful title', async ({ page }) => {
        await expect(page).toHaveTitle(/Snap!/);
    });

    test('the page does not disable pinch/zoom', async ({ page }) => {
        const viewport = await page
            .locator('meta[name="viewport"]')
            .getAttribute('content');
        expect(viewport || '').not.toMatch(/user-scalable\s*=\s*no/);
        expect(viewport || '').not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/);
    });

    test('the hidden keyboard handler has an accessible name', async ({ page }) => {
        // Today all keystrokes funnel through this off-screen textarea; a
        // screen reader user who reaches it must not hear an unnamed,
        // empty edit field.
        const kbd = page.locator('#morphic_keyboard');
        await expect(kbd).toHaveAttribute('aria-label', /.+/);
    });
});
