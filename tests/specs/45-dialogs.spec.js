// Dialog keyboard accessibility: the generic DialogBoxMorph contract
// (role=dialog, focus in / trap / restore, Escape) applied to the dialogs
// with search fields and lists - Open / Save Project and Import library.
//
// Contract (docs/ACCESSIBILITY.md): a dialog is [role=dialog][aria-modal]
// named by its title; Tab / Shift+Tab cycle through its search field, list,
// notes and buttons; lists are listboxes navigated with Up / Down; Enter on
// a list item is the dialog's default action; Escape cancels and returns
// focus to the opener.

const { test, expect } = require('@playwright/test');
const {
    loadSnap,
    snapEval,
    openExamplesDialog,
    openLibrariesDialog
} = require('../helpers/snap');

// the accessible name of the element that currently has DOM focus, or, while
// a text is being edited through the hidden textarea, that textarea's name
// (which the a11y layer sets to the edited field's label)
function activeName(page) {
    return page.evaluate(() =>
        document.activeElement && document.activeElement.getAttribute('aria-label'));
}

function activeRole(page) {
    return page.evaluate(() =>
        document.activeElement && document.activeElement.getAttribute('role'));
}

async function tabSequence(page, count, shift = false) {
    const names = [];
    for (let i = 0; i < count; i += 1) {
        await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
        names.push(await activeName(page));
    }
    return names;
}

test.describe('dialogs: Open Project @spec', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
        // open it "from" the project menu button so there is an opener to
        // return focus to
        await page.getByRole('button', { name: 'Project menu' }).focus();
        await openExamplesDialog(page);
    });

    test('is an ARIA dialog with a named search field, list and buttons', async ({ page }) => {
        const dialog = page.getByRole('dialog', { name: 'Open Project' });
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog.getByRole('textbox', { name: 'Search projects' })).toHaveCount(1);
        const list = dialog.getByRole('listbox', { name: 'Projects' });
        await expect(list).toHaveCount(1);
        await expect(list.getByRole('option', { name: 'Animal Game' })).toHaveCount(1);
        for (const name of ['Cloud', 'Examples', 'Computer', 'Open', 'Cancel']) {
            await expect(dialog.getByRole('button', { name })).toHaveCount(1);
        }
        // the current source is a pressed toggle
        await expect(dialog.getByRole('button', { name: 'Examples' }))
            .toHaveAttribute('aria-pressed', 'true');
        // hidden buttons (share / publish / recover) are hidden from AT too
        await expect(dialog.getByRole('button', { name: 'Share' })).toHaveCount(0);
        // focus starts in the search field: the hidden textarea, named after it
        expect(await activeName(page)).toBe('Search projects');
    });

    test('Tab cycles through search, list, notes and every button', async ({ page }) => {
        const names = await tabSequence(page, 9);
        expect(names).toEqual([
            'Projects',        // the list
            'Project notes',
            'Open',
            'Cancel',
            'Cloud',
            'Examples',
            'Computer',
            'Search projects', // back to the top (editing again)
            'Projects'
        ]);
        // and backwards
        expect(await tabSequence(page, 2, true)).toEqual(['Search projects', 'Computer']);
    });

    test('Up / Down move through the project list and select', async ({ page }) => {
        await page.keyboard.press('Tab');
        expect(await activeRole(page)).toBe('listbox');
        const list = page.getByRole('listbox', { name: 'Projects' });
        const selected = () => snapEval(page, () => {
            const dlg = world.children.find(m => m instanceof ProjectDialogMorph);
            return dlg.listField.selected && dlg.listField.selected.name;
        });
        // nothing selected yet: the whole list is the focus target
        expect(await selected()).toBeFalsy();
        await page.keyboard.press('ArrowDown');
        await expect.poll(selected).toBe('Animal Game');
        await expect(list.getByRole('option', { name: 'Animal Game' }))
            .toHaveAttribute('aria-selected', 'true');
        const activeId = await list.getAttribute('aria-activedescendant');
        expect(activeId).toBeTruthy();
        await expect(page.locator(`#${activeId}`)).toHaveAccessibleName('Animal Game');
        await page.keyboard.press('ArrowDown');
        await expect.poll(selected).toBe('Codification');
        await page.keyboard.press('ArrowUp');
        await expect.poll(selected).toBe('Animal Game');
        await page.keyboard.press('End');
        await expect.poll(selected).toBe('Vee');
        await page.keyboard.press('Home');
        await expect.poll(selected).toBe('Animal Game');
        // selecting shows the project's notes, and focus stays on the list
        await expect.poll(() => snapEval(page, () => {
            const dlg = world.children.find(m => m instanceof ProjectDialogMorph);
            return dlg.notesText.text.length;
        })).toBeGreaterThan(0);
        expect(await activeRole(page)).toBe('listbox');
    });

    test('typing in the search field filters the list', async ({ page }) => {
        await page.keyboard.type('tree', { delay: 100 });
        const list = page.getByRole('listbox', { name: 'Projects' });
        await expect(list.getByRole('option')).toHaveCount(2);
        await expect(list.getByRole('option').first()).toHaveAccessibleName('Live Tree');
        // Tab from the (filtered) field goes to the list
        await page.keyboard.press('Tab');
        expect(await activeName(page)).toBe('Projects');
        await page.keyboard.press('ArrowDown');
        await expect.poll(() => snapEval(page, () => {
            const dlg = world.children.find(m => m instanceof ProjectDialogMorph);
            return dlg.listField.selected && dlg.listField.selected.name;
        })).toBe('Live Tree');
    });

    test('Escape closes the dialog and returns focus to the opener', async ({ page }) => {
        await page.keyboard.press('Tab');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Open Project' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Project menu' })).toBeFocused();
    });

    test('Enter on a selected project opens it', async ({ page }) => {
        await page.keyboard.press('Tab');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog', { name: 'Open Project' })).toHaveCount(0);
        await expect.poll(
            () => snapEval(page, ide => ide.getProjectName().toLowerCase()),
            { timeout: 20000 }
        ).toBe('animal game');
    });
});

test.describe('dialogs: Save Project @spec', () => {
    test('focus starts in the name field; Tab reaches list, notes and buttons', async ({ page }) => {
        await loadSnap(page);
        await snapEval(page, ide => ide.saveProjectsBrowser());
        const dialog = page.getByRole('dialog', { name: 'Save Project' });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('textbox', { name: 'Project name' })).toHaveCount(1);
        expect(await activeName(page)).toBe('Project name');
        const names = await tabSequence(page, 5);
        expect(names.slice(0, 3)).toEqual(['Projects', 'Project notes', 'Save']);
        expect(names[3]).toBe('Cancel');
        // the notes are an editable multi-line textbox
        await expect(dialog.getByRole('textbox', { name: 'Project notes' }))
            .toHaveAttribute('aria-multiline', 'true');
    });
});

test.describe('dialogs: Import library @spec', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
        await openLibrariesDialog(page);
    });

    test('exposes a search field, the libraries list, description and buttons', async ({ page }) => {
        const dialog = page.getByRole('dialog', { name: 'Import library' });
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog.getByRole('textbox', { name: 'Search libraries' })).toHaveCount(1);
        const list = dialog.getByRole('listbox', { name: 'Libraries' });
        await expect(list.getByRole('option').first()).toHaveAccessibleName(/.+/);
        await expect(dialog.getByRole('textbox', { name: 'Library description' })).toHaveCount(1);
        await expect(dialog.getByRole('button', { name: 'Import' })).toHaveCount(1);
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(1);
        expect(await activeName(page)).toBe('Search libraries');
    });

    test('Tab cycles search, list, description and buttons', async ({ page }) => {
        expect(await tabSequence(page, 5)).toEqual([
            'Libraries',
            'Library description',
            'Import',
            'Cancel',
            'Search libraries'
        ]);
    });

    test('Up / Down select libraries and load their description', async ({ page }) => {
        await page.keyboard.press('Tab');
        await page.keyboard.press('ArrowDown');
        const selectedName = () => snapEval(page, () => {
            const dlg = world.children.find(m => m instanceof LibraryImportDialogMorph);
            return dlg.listField.selected && dlg.listField.selected.name;
        });
        const first = await selectedName();
        expect(first).toBeTruthy();
        await page.keyboard.press('ArrowDown');
        await expect.poll(selectedName).not.toBe(first);
        await expect.poll(() => snapEval(page, () => {
            const dlg = world.children.find(m => m instanceof LibraryImportDialogMorph);
            return dlg.notesText.text.length;
        })).toBeGreaterThan(0);
        // the description textbox exposes the text as its value
        const desc = page.getByRole('textbox', { name: 'Library description' });
        await expect(desc).toHaveAttribute('aria-readonly', 'true');
        await expect(desc).not.toHaveText('');
        expect(await activeRole(page)).toBe('listbox');
    });

    test('typing filters the list; Escape closes', async ({ page }) => {
        const list = page.getByRole('listbox', { name: 'Libraries' });
        const before = await list.getByRole('option').count();
        await page.keyboard.type('bignum', { delay: 100 });
        await expect.poll(() => list.getByRole('option').count()).toBeLessThan(before);
        await expect(list.getByRole('option', { name: /Bignums/ })).toHaveCount(1);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Import library' })).toHaveCount(0);
    });
});

test.describe('dialogs: generic prompt @spec', () => {
    test('Tab moves from the input field to the buttons and back; Enter accepts', async ({ page }) => {
        await loadSnap(page);
        await page.evaluate(() => {
            window.__answer = null;
            new DialogBoxMorph(null, v => { window.__answer = v; })
                .prompt('Sprite name', 'Sprite', world);
        });
        const dialog = page.getByRole('dialog', { name: 'Sprite name' });
        await expect(dialog).toBeVisible();
        expect(await activeName(page)).toBe('Sprite name'); // editing the field
        expect(await tabSequence(page, 3)).toEqual(['OK', 'Cancel', 'Sprite name']);
        await page.keyboard.type('X', { delay: 50 });
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        expect(await page.evaluate(() => window.__answer)).toBe('X');
    });
});
