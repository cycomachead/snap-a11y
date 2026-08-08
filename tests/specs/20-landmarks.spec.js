// Parallel DOM landmarks (Phase 1 acceptance tests).
//
// These tests are the executable specification for the parallel DOM
// contract in docs/ACCESSIBILITY.md §2.1. They are marked test.fixme()
// until the overlay is implemented: Playwright reports them as expected
// failures ("fixme") without failing the suite. To activate one, delete
// its test.fixme() line.

const { test, expect } = require('@playwright/test');
const { loadSnap } = require('../helpers/snap');

test.describe('parallel DOM: landmark structure @spec', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('an overlay root exists and is positioned over the canvas', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const root = page.locator('#snap-a11y');
        await expect(root).toHaveCount(1);
        await expect(root).toHaveAttribute('aria-label', 'Snap!');
        const rootBox = await root.boundingBox();
        const canvasBox = await page.locator('canvas#world').boundingBox();
        expect(Math.abs(rootBox.x - canvasBox.x)).toBeLessThan(2);
        expect(Math.abs(rootBox.y - canvasBox.y)).toBeLessThan(2);
    });

    test('the canvas is hidden from assistive technology once the overlay carries semantics', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        await expect(page.locator('canvas#world')).toHaveAttribute(
            'aria-hidden',
            'true'
        );
    });

    test('the top toolbar is exposed', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        await expect(
            page.getByRole('toolbar', { name: 'Snap! toolbar' })
        ).toBeVisible();
    });

    test('block categories are exposed as a tablist with a selected tab', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const tablist = page.getByRole('tablist', { name: 'Block categories' });
        await expect(tablist).toBeVisible();
        const tabs = tablist.getByRole('tab');
        await expect(tabs).toHaveCount(8); // Motion … Variables
        await expect(
            tablist.getByRole('tab', { name: 'Motion', selected: true })
        ).toBeVisible();
    });

    test('the palette is exposed as a listbox', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const palette = page.getByRole('listbox', { name: 'Block palette' });
        await expect(palette).toBeVisible();
        expect(await palette.getByRole('option').count()).toBeGreaterThan(5);
    });

    test('the scripts pane, stage, and sprite corral are exposed', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        await expect(
            page.getByRole('region', { name: /^Scripts/ })
        ).toBeVisible();
        await expect(page.getByRole('region', { name: 'Stage' })).toBeVisible();
        const corral = page.getByRole('tablist', { name: 'Sprites' });
        await expect(corral).toBeVisible();
        // a fresh project has one sprite plus the stage
        await expect(corral.getByRole('tab')).toHaveCount(2);
    });

    test('editor view tabs (Scripts / Costumes / Sounds) are exposed', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        const views = page.getByRole('tablist', { name: 'Editor views' });
        for (const name of ['Scripts', 'Costumes', 'Sounds']) {
            await expect(views.getByRole('tab', { name })).toBeVisible();
        }
    });

    test('live regions for announcements exist', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        await expect(page.locator('#snap-a11y-announcer')).toHaveAttribute(
            'aria-live',
            'polite'
        );
        await expect(page.locator('#snap-a11y-alert')).toHaveAttribute(
            'role',
            'alert'
        );
    });
});
