// Smoke tests: the harness itself works — Snap! boots headlessly, the
// Morphic world is reachable from tests, and the known DOM surface exists.
// These must always pass.

const { test, expect } = require('@playwright/test');
const { loadSnap, snapEval } = require('../helpers/snap');

test.describe('smoke: Snap! boots and is introspectable', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('the world canvas exists and has a nonzero size', async ({ page }) => {
        const canvas = page.locator('canvas#world');
        await expect(canvas).toBeVisible();
        const box = await canvas.boundingBox();
        expect(box.width).toBeGreaterThan(100);
        expect(box.height).toBeGreaterThan(100);
    });

    test('the IDE morph is constructed with its main regions', async ({ page }) => {
        const regions = await snapEval(page, ide => ({
            controlBar: !!ide.controlBar,
            categories: !!ide.categories,
            palette: !!ide.palette,
            spriteEditor: !!ide.spriteEditor,
            corral: !!ide.corral,
            stage: !!ide.stage,
            sprite: ide.currentSprite.name
        }));
        expect(regions.controlBar).toBe(true);
        expect(regions.categories).toBe(true);
        expect(regions.palette).toBe(true);
        expect(regions.spriteEditor).toBe(true);
        expect(regions.corral).toBe(true);
        expect(regions.stage).toBe(true);
        expect(regions.sprite).toBeTruthy();
    });

    test('the palette contains block templates for the current category', async ({ page }) => {
        const specs = await snapEval(page, ide =>
            ide.palette.contents.children
                .filter(m => m instanceof BlockMorph)
                .map(b => b.blockSpec)
        );
        expect(specs.length).toBeGreaterThan(5);
        expect(specs).toContain('move %n steps');
    });

    test('the hidden Morphic keyboard handler exists', async ({ page }) => {
        await expect(page.locator('textarea#morphic_keyboard')).toHaveCount(1);
    });
});
