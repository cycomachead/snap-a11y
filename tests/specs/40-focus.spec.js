// Focus behavior (Phase 2 acceptance tests) plus a baseline test that
// documents today's focus reality.

const { test, expect } = require('@playwright/test');
const { loadSnap, snapEval, dismissDialogs } = require('../helpers/snap');

test.describe('focus: baseline (current behavior)', () => {
    test('DOM focus starts on a meaningful element', async ({ page }) => {
        // Was: focus always sat on the off-screen textarea, because all
        // keyboard input funnels through it. With the parallel DOM, focus
        // starts on the modal Snap! shows at startup (the dev-version
        // warning); once no dialog is open it falls back to the textarea,
        // which is still where text editing is driven from.
        await loadSnap(page);
        const dialog = await page.evaluate(() => {
            const el = document.activeElement;
            return el.getAttribute('role') === 'dialog' &&
                el.getAttribute('aria-label');
        });
        expect(dialog).toBeTruthy();

        await dismissDialogs(page);
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

    // Open the "About Snap!" dialog from the logo menu, keyboard-only.
    // Note that the parallel elements are pointer-events:none (the canvas
    // owns the mouse), so these drive the menu with the keyboard.
    async function openAboutDialog(page) {
        await dismissDialogs(page); // the dev-version warning is modal
        await page.getByRole('button', { name: /Snap! menu/i }).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menu')).toBeVisible();
        await page.keyboard.press('ArrowDown'); // "About..." is the first item
        await page.keyboard.press('Enter');
    }

    test('opening a dialog moves focus into it and Escape restores focus', async ({ page }) => {
        await openAboutDialog(page);
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog).toHaveAttribute('aria-label', /About/);
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
            page.getByRole('button', { name: /Snap! menu/i })
        ).toBeFocused();
    });

    test('focus is trapped inside a modal dialog', async ({ page }) => {
        await openAboutDialog(page);
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
