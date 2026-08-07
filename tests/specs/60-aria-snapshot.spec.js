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

    test('baseline: the AX tree exposes almost nothing (canvas-only UI)', async ({ page }) => {
        const nodes = await getExposedAXNodes(page);
        const roles = nodes.map(n => n.role);
        // Today assistive technology receives just the document and the
        // hidden keyboard textarea — no toolbar, tabs, lists, or buttons.
        expect(roles).not.toContain('toolbar');
        expect(roles).not.toContain('tab');
        expect(roles).not.toContain('button');
        // When this assertion starts failing, the parallel DOM has begun
        // exposing real semantics: replace this test with a positive
        // snapshot and activate the @spec test below.
        expect(nodes.length).toBeLessThan(10);
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
