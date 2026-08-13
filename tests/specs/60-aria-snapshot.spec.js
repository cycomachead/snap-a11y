// Accessibility-tree snapshots.
//
// The baseline test documents how little assistive technology receives
// today (it should start FAILING once the parallel DOM lands — then
// update it). The @spec test asserts the target tree shape with
// Playwright's ARIA snapshot matcher.

const { test, expect } = require('@playwright/test');
const { loadSnap, getExposedAXNodes } = require('../helpers/snap');

test.describe('accessibility tree', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('the parallel DOM exposes the IDE to assistive technology', async ({ page }) => {
        // The parallel DOM (src/accessibility.js) mirrors the IDE into
        // real ARIA elements: an application root, named landmark
        // regions, the category radio group, and the toolbar buttons.
        const nodes = await getExposedAXNodes(page);
        const roles = nodes.map(n => n.role);
        const names = nodes.map(n => n.name).filter(Boolean);
        expect(roles).toContain('application');
        expect(roles).toContain('region');
        expect(roles).toContain('radiogroup');
        expect(roles).toContain('button');
        expect(roles.filter(r => r === 'region').length)
            .toBeGreaterThanOrEqual(6);
        for (const landmark of [
            'Control Bar', 'Block Palette', 'Scripting Area',
            'Stage', 'Sprite Corral'
        ]) {
            expect(names).toContain(landmark);
        }
        for (const category of ['Motion', 'Looks', 'Control', 'Variables']) {
            expect(names).toContain(category);
        }
        expect(names).toContain('Green flag');
    });

    test('target IDE tree shape @spec', async ({ page }) => {
        test.fixme(true, 'parallel DOM not implemented yet');
        await expect(page.locator('#snap-a11y')).toMatchAriaSnapshot(`
            - toolbar "Snap! toolbar"
            - tablist "Block categories":
              - tab "Motion" [selected]
              - tab "Looks"
              - tab "Sound"
              - tab "Pen"
              - tab "Control"
              - tab "Sensing"
              - tab "Operators"
              - tab "Variables"
            - listbox "Block palette"
            - tablist "Editor views":
              - tab "Scripts" [selected]
              - tab "Costumes"
              - tab "Sounds"
            - region /Scripts/
            - region "Stage"
            - tablist "Sprites"
        `);
    });
});
