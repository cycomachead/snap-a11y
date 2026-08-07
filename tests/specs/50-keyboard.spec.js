// Keyboard support.
//
// The first group exercises what already works today (ScriptFocusMorph
// keyboard script editing) so regressions in existing keyboard machinery
// are caught while the parallel DOM work proceeds. The second group is
// the executable spec for full-IDE keyboard access (Phases 2–3).

const { test, expect } = require('@playwright/test');
const {
    loadSnap,
    snapEval,
    focusMorphicKeyboard
} = require('../helpers/snap');

test.describe('keyboard: baseline script editing (works today)', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
        // "Keyboard editing" is a setting; force it on for the test.
        await snapEval(page, () => {
            ScriptsMorph.prototype.enableKeyboard = true;
        });
    });

    test('toggleKeyboardEntry gives the scripts pane a keyboard focus', async ({ page }) => {
        await snapEval(page, ide => {
            ide.currentSprite.scripts.toggleKeyboardEntry();
        });
        const state = await snapEval(page, ide => ({
            hasFocus: !!ide.currentSprite.scripts.focus,
            worldFocus: world.keyboardFocus
                ? world.keyboardFocus.constructor.name
                : null
        }));
        expect(state.hasFocus).toBe(true);
        expect(state.worldFocus).toBe('ScriptFocusMorph');
    });

    test('typing in keyboard-entry mode adds a block to the scripts pane', async ({ page }) => {
        await snapEval(page, ide => {
            ide.currentSprite.scripts.toggleKeyboardEntry();
        });
        await focusMorphicKeyboard(page);
        // Type-to-find a block, accept the first match with Enter. The
        // first keystroke opens the palette's block-search field and moves
        // Morphic's keyboard focus into it, which takes a world cycle —
        // hence the inter-key delay.
        await page.keyboard.type('move', { delay: 100 });
        await page.keyboard.press('Enter');
        await expect
            .poll(() =>
                snapEval(page, ide =>
                    ide.currentSprite.scripts.children.filter(
                        m => m instanceof BlockMorph
                    ).length
                )
            )
            .toBeGreaterThan(0);
        const specs = await snapEval(page, ide =>
            ide.currentSprite.scripts.children
                .filter(m => m instanceof BlockMorph)
                .map(b => b.blockSpec)
        );
        expect(specs).toContain('move %n steps');
    });
});

test.describe('parallel DOM: full-IDE keyboard access @spec', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('arrow keys move between block categories', async ({ page }) => {
        test.fixme(true, 'palette keyboard navigation not implemented yet');
        const tablist = page.getByRole('tablist', { name: 'Block categories' });
        await tablist.getByRole('tab', { name: 'Motion' }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(
            tablist.getByRole('tab', { name: 'Looks' })
        ).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(
            tablist.getByRole('tab', { name: 'Looks', selected: true })
        ).toBeVisible();
    });

    test('a palette block can be added to the scripts pane keyboard-only', async ({ page }) => {
        test.fixme(true, 'keyboard pick-up/drop not implemented yet');
        const palette = page.getByRole('listbox', { name: 'Block palette' });
        await palette.getByRole('option', { name: 'move 10 steps' }).focus();
        await page.keyboard.press('Enter'); // pick up / insert
        const scripts = page.getByRole('tree', { name: /^Scripts for/ });
        await expect(
            scripts.getByRole('treeitem', { name: 'move 10 steps' })
        ).toBeVisible();
    });

    test('sprites can be switched from the corral with the keyboard', async ({ page }) => {
        test.fixme(true, 'corral keyboard navigation not implemented yet');
        await snapEval(page, ide => ide.addNewSprite());
        const corral = page.getByRole('tablist', { name: 'Sprites' });
        await corral.getByRole('tab').first().focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        const current = await snapEval(page, ide => ide.currentSprite.name);
        expect(current).not.toBe('Sprite');
    });

    test('the context menu of the focused element opens with the keyboard', async ({ page }) => {
        test.fixme(true, 'keyboard context menus not implemented yet');
        const palette = page.getByRole('listbox', { name: 'Block palette' });
        await palette.getByRole('option', { name: 'move 10 steps' }).focus();
        await page.keyboard.press('Shift+F10');
        const menu = page.getByRole('menu');
        await expect(menu).toBeVisible();
        await expect(
            menu.getByRole('menuitem', { name: /help/ })
        ).toBeVisible();
    });

    test('keyboard editing is enabled by default', async ({ page }) => {
        test.fixme(true, 'default-on keyboard editing is a Phase 3 decision');
        const enabled = await snapEval(page, () =>
            ScriptsMorph.prototype.enableKeyboard
        );
        expect(enabled).toBe(true);
    });
});
