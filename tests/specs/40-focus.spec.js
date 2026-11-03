// Focus behavior (Phase 2 acceptance tests) plus a baseline test that
// documents today's focus reality.

const { test, expect } = require('@playwright/test');
const { loadSnap, snapEval } = require('../helpers/snap');

test.describe('focus: baseline (current behavior)', () => {
    test('DOM focus starts on the hidden keyboard handler', async ({ page }) => {
        // All keyboard input funnels through the off-screen textarea, so
        // that is where focus rests when nothing in the IDE holds it.
        // (A development build first shows its "CAUTION! Development
        // Version" dialog, which - being a real ARIA dialog - takes focus;
        // loadSnap dismisses it, returning focus to the textarea.)
        await loadSnap(page);
        const active = await page.evaluate(() => document.activeElement.id);
        expect(active).toBe('morphic_keyboard');
    });

    test('a dialog shown at startup takes focus', async ({ page }) => {
        await loadSnap(page, { keepNag: true });
        const nag = await snapEval(page, () =>
            world.children.some(m => m instanceof DialogBoxMorph && m.nag));
        test.skip(!nag, 'no startup dialog in this build');
        const dialog = page.getByRole('dialog', { name: /Development Version/ });
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog.getByRole('button', { name: 'OK' })).toBeFocused();
        // Enter on the focused OK button closes it
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
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

    // the parallel elements are pointer-events:none (the canvas takes the
    // mouse), so a menu item is "clicked" the way assistive tech does it: a
    // DOM click event on its element
    async function openAboutDialog(page) {
        await page.getByRole('button', { name: /Snap! menu/i }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('menuitem', { name: /^About/ }).dispatchEvent('click');
    }

    test('opening a dialog moves focus into it and Escape restores focus', async ({ page }) => {
        // Open the "About Snap!" dialog from the logo menu, keyboard-only.
        await openAboutDialog(page);
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog).toHaveAccessibleName(/About Snap/);
        // the body text is the dialog's description
        await expect(dialog).toHaveAccessibleDescription(/Snap!/);
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
        const seen = new Set();
        for (let i = 0; i < 12; i += 1) {
            await page.keyboard.press('Tab');
            const inDialog = await page.evaluate(() => {
                const d = document.querySelector('[role="dialog"]');
                return d && d.contains(document.activeElement);
            });
            expect(inDialog).toBe(true);
            seen.add(await page.evaluate(
                () => document.activeElement.getAttribute('aria-label')));
        }
        // ... and cycle through all of the dialog's buttons
        expect([...seen]).toEqual(
            expect.arrayContaining(['OK', 'License...', 'Modules...']));
    });
});
