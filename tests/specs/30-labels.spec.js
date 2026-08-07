// Accessible names (Phases 1 and 3 acceptance tests).
//
// Executable spec for docs/ACCESSIBILITY.md §2.1 naming rules. Marked
// test.fixme() until the parallel DOM exists.

const { test, expect } = require('@playwright/test');
const { loadSnap, getExposedAXNodes } = require('../helpers/snap');

test.describe('parallel DOM: accessible names @spec', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('every exposed button has a non-empty accessible name', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const nodes = await getExposedAXNodes(page);
        const unnamedButtons = nodes.filter(
            n => n.role === 'button' && !(n.name && n.name.trim())
        );
        expect(unnamedButtons).toEqual([]);
    });

    test('category tabs carry the category names', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const tablist = page.getByRole('tablist', { name: 'Block categories' });
        for (const name of [
            'Motion', 'Looks', 'Sound', 'Pen',
            'Control', 'Sensing', 'Operators', 'Variables'
        ]) {
            await expect(tablist.getByRole('tab', { name })).toBeVisible();
        }
    });

    test('palette blocks have speakable labels with input values inlined', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const palette = page.getByRole('listbox', { name: 'Block palette' });
        // "move %n steps" with its default input must read "move 10 steps",
        // not the raw spec and not "move steps".
        await expect(
            palette.getByRole('option', { name: 'move 10 steps' })
        ).toBeVisible();
        await expect(
            palette.getByRole('option', { name: /turn .*15 degrees/ })
        ).toBeVisible();
    });

    test('symbol-only specs are verbalized', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        // Control palette: "when %greenflag pressed"
        const categories = page.getByRole('tablist', { name: 'Block categories' });
        await categories.getByRole('tab', { name: 'Control' }).click();
        await expect(
            page.getByRole('listbox', { name: 'Block palette' })
                .getByRole('option', { name: /when green flag (clicked|pressed)/ })
        ).toBeVisible();
    });

    test('the sprite corral tabs are named after the sprites', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const corral = page.getByRole('tablist', { name: 'Sprites' });
        await expect(corral.getByRole('tab', { name: 'Sprite' })).toBeVisible();
        await expect(corral.getByRole('tab', { name: 'Stage' })).toBeVisible();
    });
});
