// Dialog accessibility: DialogBoxMorph in general, and the two dialogs with
// a search field and list views - Import library, and Open / Save project.
//
// Contract (docs/ACCESSIBILITY.md §2.1): dialogs are
// [role="dialog"][aria-modal="true"] labeled by their title, with a real
// focus trap and focus restored on close. Inside a dialog, Tab moves
// between the search field, the list views and every button; up / down
// move through a list view.

const { test, expect } = require('@playwright/test');
const { loadSnap, dismissDialogs, focusInfo } = require('../helpers/snap');

// open a dialog directly (the menu route is covered in 40-focus)
async function openLibraryDialog(page) {
    await page.evaluate(() => new Promise(resolve => {
        const ide = world.children.find(m => m instanceof IDE_Morph);
        ide.getURL(ide.resourceURL('libraries', 'LIBRARIES.json'), txt => {
            new LibraryImportDialogMorph(ide, ide.parseResourceFile(txt))
                .popUp();
            resolve(true);
        });
    }));
    await page.waitForFunction(() =>
        world.children.some(m => m instanceof LibraryImportDialogMorph));
}

async function openProjectDialog(page, task, source) {
    await page.evaluate(([t, src]) => {
        const ide = world.children.find(m => m instanceof IDE_Morph),
            dialog = new ProjectDialogMorph(ide, t);
        dialog.popUp(world);
        if (src) {
            dialog.setSource(src);
        }
    }, [task, source]);
    await page.waitForFunction(() =>
        world.children.some(m => m instanceof ProjectDialogMorph));
}

// the accessible names of a dialog's tab stops, in tab order
function tabStops(page) {
    return page.evaluate(() => {
        const dialog = world.children.filter(m => m instanceof DialogBoxMorph)
            .pop();
        return dialog.a11yTabStops().map(m => m.ariaLabel());
    });
}

test.describe('dialogs: ARIA + focus', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('the startup dialog is a labelled modal dialog', async ({ page }) => {
        // Snap!'s dev-version warning is an ordinary DialogBoxMorph
        const dialog = page.getByRole('dialog');
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog).toHaveAttribute(
            'aria-label', /CAUTION! Development Version/);
        // its message text is exposed, not just the title
        await expect(dialog).toHaveAttribute(
            'aria-description', /NOT supported for end users/);
        // focus moved into the dialog, and Escape closes it
        expect((await focusInfo(page)).inDialog).toBe(true);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('a dialog traps Tab and restores focus when it closes',
        async ({ page }) => {
            await dismissDialogs(page);
            // anchor focus on a toolbar button, then open a dialog from there
            await page.evaluate(() => {
                const ide = world.children.find(m => m instanceof IDE_Morph);
                world.setFocus(ide.controlBar.projectButton,
                    {viaKeyboard: true});
            });
            await openProjectDialog(page, 'open');

            const names = [];
            for (let i = 0; i < 10; i += 1) {
                await page.keyboard.press('Tab');
                const info = await focusInfo(page);
                names.push(info.name);
                // focus never escapes into the IDE behind the dialog
                expect(await page.evaluate(() =>
                    world.a11yFocusRoot().constructor.name
                )).toBe('ProjectDialogMorph');
            }
            // it wrapped around rather than leaving the dialog
            expect(new Set(names).size).toBeLessThan(names.length);

            await page.keyboard.press('Escape');
            await expect(page.getByRole('dialog')).toHaveCount(0);
            expect((await focusInfo(page)).name).toBe('Project menu');
        });
});

test.describe('Import library dialog', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
        await dismissDialogs(page);
        await openLibraryDialog(page);
    });

    test('Tab reaches the search field, both list views and the buttons',
        async ({ page }) => {
            expect(await tabStops(page)).toEqual([
                'Search libraries',
                expect.stringMatching(/^Libraries, \d+ items$/),
                expect.stringMatching(/^Library blocks, \d+ blocks?$/),
                expect.stringMatching(/^Description:/),
                'Import',
                'Cancel'
            ]);

            // focus starts on the dialog itself; tabbing walks the stops
            const reached = [];
            for (let i = 0; i < 6; i += 1) {
                await page.keyboard.press('Tab');
                reached.push((await focusInfo(page)).name);
            }
            expect(reached[0]).toBe('Search libraries');
            expect(reached[1]).toMatch(/^Libraries, /);
            expect(reached[4]).toBe('Import');
            expect(reached[5]).toBe('Cancel');
        });

    test('the library list is a listbox navigated with up and down',
        async ({ page }) => {
            const list = page.getByRole('listbox', { name: /^Libraries, / });
            await expect(list).toHaveCount(1);
            await expect(list.getByRole('option').first())
                .toHaveAttribute('aria-posinset', '1');

            await page.evaluate(() => {
                const dialog = world.children.find(
                    m => m instanceof LibraryImportDialogMorph);
                world.setFocus(dialog.listField,
                    {viaKeyboard: true, force: true});
            });
            await page.keyboard.press('ArrowDown');
            const first = await focusInfo(page);
            expect(first.role).toBe('listbox');
            expect(first.item).toBeTruthy(); // aria-activedescendant follows

            await page.keyboard.press('ArrowDown');
            const second = await focusInfo(page);
            expect(second.item).not.toBe(first.item);

            await page.keyboard.press('ArrowUp');
            expect((await focusInfo(page)).item).toBe(first.item);

            // the selection is the real Morphic selection, so the dialog
            // reacts to it (description, block preview)
            expect(await page.evaluate(() => {
                const dialog = world.children.find(
                    m => m instanceof LibraryImportDialogMorph);
                return dialog.listField.selected.name;
            })).toBe(first.item);
            await expect(list.getByRole('option', { name: first.item }))
                .toHaveAttribute('aria-selected', 'true');
        });

    test('the previewed blocks are options with speakable names',
        async ({ page }) => {
            await page.evaluate(() => {
                const dialog = world.children.find(
                    m => m instanceof LibraryImportDialogMorph);
                world.setFocus(dialog.listField,
                    {viaKeyboard: true, force: true});
            });
            await page.keyboard.press('ArrowDown');
            // the library's blocks are fetched and rendered
            await page.waitForFunction(() => {
                const dialog = world.children.find(
                    m => m instanceof LibraryImportDialogMorph);
                return dialog.a11yPaletteBlocks().length > 0;
            }, null, { timeout: 15000 });

            const preview = page.getByRole('listbox',
                { name: /^Library blocks/ });
            expect(await preview.getByRole('option').count())
                .toBeGreaterThan(0);

            // up / down move through the preview too
            await page.evaluate(() => {
                const dialog = world.children.find(
                    m => m instanceof LibraryImportDialogMorph);
                world.setFocus(dialog.palette, {viaKeyboard: true, force: true});
            });
            await page.keyboard.press('ArrowDown');
            const first = await focusInfo(page);
            expect(first.item).toBeTruthy();
            await page.keyboard.press('ArrowDown');
            expect((await focusInfo(page)).item).not.toBe(first.item);
        });
});

test.describe('Open / Save project dialog', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
        await dismissDialogs(page);
    });

    test('Open: search, sources, list, notes and buttons are tab stops',
        async ({ page }) => {
            await openProjectDialog(page, 'open');
            expect(await tabStops(page)).toEqual([
                'Search projects',
                'Cloud',
                'Examples',
                'Computer',
                expect.stringMatching(/^Projects, /),
                expect.stringMatching(/^Notes:/),
                'Open',
                'Cancel'
            ]);
            // Snap! opens the dialog editing the search field: the textarea
            // that receives the typing is named after it
            expect((await focusInfo(page)).name).toBe('Search projects');
        });

    test('Save: the project name field is the first stop and stays editable',
        async ({ page }) => {
            await openProjectDialog(page, 'save');
            const stops = await tabStops(page);
            expect(stops[0]).toBe('Project name');
            expect(stops).toContain('Project notes');
            expect(stops).toContain('Save');

            await page.keyboard.type('a keyboard project');
            expect(await page.evaluate(() =>
                world.children.find(m => m instanceof ProjectDialogMorph)
                    .nameField.getValue()
            )).toContain('a keyboard project');

            // Tab leaves the field for the next stop without leaving the dialog
            await page.keyboard.press('Tab');
            expect((await focusInfo(page)).name).toBe('Cloud');
        });

    test('the project list is navigated with up and down, Enter opens',
        async ({ page }) => {
            await openProjectDialog(page, 'open', 'examples');
            await page.waitForFunction(() =>
                world.children.find(m => m instanceof ProjectDialogMorph)
                    .listField.elements.length > 1);

            await page.evaluate(() => {
                const dialog = world.children.find(
                    m => m instanceof ProjectDialogMorph);
                world.setFocus(dialog.listField,
                    {viaKeyboard: true, force: true});
            });
            await page.keyboard.press('ArrowDown');
            const first = await focusInfo(page);
            expect(first.item).toBeTruthy();
            await page.keyboard.press('ArrowDown');
            const second = await focusInfo(page);
            expect(second.item).not.toBe(first.item);

            // selecting reads out into the notes stop
            expect((await tabStops(page)).find(n => /^Notes:/.test(n)))
                .not.toBe('Notes: none');

            // Enter runs the dialog's default action (open the project)
            await page.keyboard.press('Enter');
            await expect(page.getByRole('dialog')).toHaveCount(0);
            await page.waitForFunction(name => {
                const ide = world.children.find(m => m instanceof IDE_Morph);
                return ide.getProjectName().toLowerCase() ===
                    name.toLowerCase();
            }, second.item, { timeout: 30000 });
        });
});
