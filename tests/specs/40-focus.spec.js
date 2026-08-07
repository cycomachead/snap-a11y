// Focus behavior (Phase 2 acceptance tests) plus a baseline test that
// documents today's focus reality.

const { test, expect } = require('@playwright/test');
const { loadSnap, snapEval } = require('../helpers/snap');

test.describe('focus: baseline (current behavior)', () => {
    test('DOM focus starts on the hidden keyboard handler', async ({ page }) => {
        // Documents the status quo: all keyboard input funnels through the
        // off-screen textarea. When the parallel DOM lands, initial focus
        // should move to a meaningful element and this test should be
        // updated alongside the Phase 2 specs below.
        await loadSnap(page);
        const active = await page.evaluate(() => document.activeElement.id);
        expect(active).toBe('morphic_keyboard');
    });
});

test.describe('parallel DOM: focus model @spec', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('Tab reaches the toolbar from the top of the document', async ({ page }) => {
        test.fixme(true, 'global keyboard navigation not implemented yet');
        await page.keyboard.press('Tab');
        const focused = page.locator(':focus');
        await expect(focused).toHaveAttribute('role', /button|tab|menuitem/);
    });

    test('DOM focus and Morphic keyboardFocus stay in sync', async ({ page }) => {
        test.fixme(true, 'focus sync not implemented yet');
        // Focus a palette option via the keyboard, then confirm Morphic
        // agrees about what has focus.
        const palette = page.getByRole('listbox', { name: 'Block palette' });
        await palette.getByRole('option').first().focus();
        const morphicFocus = await snapEval(page, () =>
            world.keyboardFocus ? world.keyboardFocus.constructor.name : null
        );
        expect(morphicFocus).not.toBeNull();
    });

    test('opening a dialog moves focus into it and Escape restores focus', async ({ page }) => {
        test.fixme(true, 'ARIA dialogs not implemented yet');
        // Open the "About Snap!" dialog from the logo menu, keyboard-only.
        await page.getByRole('button', { name: /Snap! logo/i }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('menuitem', { name: /About/ }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        // focus is inside the dialog
        const inDialog = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"]');
            return d && d.contains(document.activeElement);
        });
        expect(inDialog).toBe(true);
        // Escape closes and focus returns to the opener
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: /Snap! logo/i })
        ).toBeFocused();
    });

    test('focus is trapped inside a modal dialog', async ({ page }) => {
        test.fixme(true, 'ARIA dialogs not implemented yet');
        await page.getByRole('button', { name: /Snap! logo/i }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('menuitem', { name: /About/ }).click();
        // Tab many times; focus must remain inside the dialog.
        for (let i = 0; i < 12; i += 1) {
            await page.keyboard.press('Tab');
            const inDialog = await page.evaluate(() => {
                const d = document.querySelector('[role="dialog"]');
                return d && d.contains(document.activeElement);
            });
            expect(inDialog).toBe(true);
        }
    });
});
