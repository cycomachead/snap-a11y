// HTML-in-Canvas evaluation prototype (src/html-canvas.js,
// docs/HTML-IN-CANVAS.md).
//
// Opt-in via snap.html?html-in-canvas. In browsers with the API (Chrome
// 157+) the parallel DOM moves inside the canvas, the cloud credential
// dialogs become real HTML forms painted with drawElementImage(), and the
// text on blocks is real DOM text. Everywhere else - and without the flag -
// nothing changes, which the first tests pin down.
//
// The API-dependent tests skip themselves where the browser lacks it.

const { test, expect } = require('@playwright/test');
const { loadSnap, snapEval } = require('../helpers/snap');

const HIC = { query: '?html-in-canvas' };

function supported(page) {
    return page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.setAttribute('content', 'drawable');
        return canvas.content === 'drawable';
    });
}

// open the cloud "Sign in" dialog with the cloud call stubbed out; logins
// are recorded in window.snapLogins
async function openSignIn(page) {
    await snapEval(page, ide => {
        window.snapLogins = [];
        ide.cloud.login = (name, password, persist) =>
            window.snapLogins.push({ name, password, persist });
        world.lastInputWasKeyboard = true;
        ide.initializeCloud();
    });
    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
}

function activeName(page) {
    return page.evaluate(() => {
        const el = document.activeElement;
        return el && (el.name || el.getAttribute('aria-label'));
    });
}

test.describe('HTML-in-Canvas is strictly opt-in', () => {
    test('without the flag nothing about the page changes', async ({ page }) => {
        await loadSnap(page, { query: '' });
        const state = await page.evaluate(() => ({
            enabled: world.htmlInCanvas,
            content: world.worldCanvas.getAttribute('content'),
            canvasHidden: world.worldCanvas.getAttribute('aria-hidden'),
            rootIsOverlay: world.a11yRoot.parentNode === document.body
        }));
        expect(state).toEqual({
            enabled: null,
            content: null,
            canvasHidden: 'true',
            rootIsOverlay: true
        });
    });

    test('without the flag Sign in is the classic Morphic dialog', async ({ page }) => {
        await loadSnap(page, { query: '' });
        await openSignIn(page);
        const dialog = page.getByRole('dialog', { name: 'Sign in' });
        await expect(dialog.locator('form')).toHaveCount(0);
        await expect(dialog.getByRole('textbox')).toHaveCount(2);
    });

    test('the classic password field never exposes its text', async ({ page }) => {
        await loadSnap(page, { query: '' });
        await openSignIn(page);
        await page.keyboard.type('alonzo');
        await page.keyboard.press('Tab');
        await page.keyboard.type('s3cret');
        await page.keyboard.press('Tab');
        const values = await page.getByRole('dialog', { name: 'Sign in' })
            .getByRole('textbox').allTextContents();
        expect(values[0]).toBe('alonzo');
        expect(values[1]).toBe('•'.repeat(6));
    });
});

test.describe('HTML-in-Canvas: the parallel DOM lives in the canvas', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page, HIC);
        test.skip(!(await supported(page)), 'needs HTML-in-Canvas');
    });

    test('the root is a drawable child of the world canvas', async ({ page }) => {
        const state = await page.evaluate(() => ({
            enabled: !!world.htmlInCanvas,
            content: world.worldCanvas.getAttribute('content'),
            canvasHidden: world.worldCanvas.getAttribute('aria-hidden'),
            rootInCanvas: world.a11yRoot.parentNode === world.worldCanvas,
            rootDrawable: world.a11yRoot.hasAttribute('drawable')
        }));
        expect(state).toEqual({
            enabled: true,
            content: 'drawable',
            canvasHidden: null,
            rootInCanvas: true,
            rootDrawable: true
        });
    });

    test('role-only nodes keep their geometry inside the canvas', async ({ page }) => {
        const button = page.getByRole('button', { name: 'Settings menu' });
        const box = await button.boundingBox();
        const bounds = await snapEval(page, ide => {
            const b = ide.controlBar.settingsButton.bounds;
            return { x: b.origin.x, y: b.origin.y, w: b.width(), h: b.height() };
        });
        expect(Math.abs(box.x - bounds.x)).toBeLessThan(1);
        expect(Math.abs(box.y - bounds.y)).toBeLessThan(1);
        expect(Math.abs(box.width - bounds.w)).toBeLessThan(1);
        expect(Math.abs(box.height - bounds.h)).toBeLessThan(1);
    });

    test('landmarks and toolbar buttons are still exposed', async ({ page }) => {
        await expect(page.getByRole('application')).toHaveAccessibleName(/^Snap!/);
        await expect(page.getByRole('region', { name: 'Block Palette' }))
            .toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Project menu' }))
            .toHaveCount(1);
    });
});

test.describe('HTML-in-Canvas: the Sign in dialog is a real form', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page, HIC);
        test.skip(!(await supported(page)), 'needs HTML-in-Canvas');
        await page.getByRole('button', { name: 'Cloud menu' }).focus();
        await openSignIn(page);
    });

    test('labelled native fields inside the Morphic dialog', async ({ page }) => {
        const dialog = page.getByRole('dialog', { name: 'Sign in' });
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog.locator('form[drawable]')).toHaveCount(1);
        await expect(dialog.getByRole('textbox', { name: 'User name:' }))
            .toHaveAttribute('autocomplete', 'username');
        await expect(dialog.getByLabel('Password:'))
            .toHaveAttribute('type', 'password');
        await expect(dialog.getByLabel('Password:'))
            .toHaveAttribute('autocomplete', 'current-password');
        await expect(dialog.getByRole('checkbox', { name: /stay signed in/ }))
            .toHaveCount(1);
        // the frame's buttons are still morphs, exposed by the parallel DOM
        await expect(dialog.getByRole('button', { name: 'OK' })).toHaveCount(1);
        await expect(dialog.getByRole('button', { name: 'Cancel' }))
            .toHaveCount(1);
    });

    test('the form is painted where the morph is', async ({ page }) => {
        const field = await page.getByLabel('User name:').boundingBox();
        const body = await page.evaluate(() => {
            const b = world.children
                .find(m => m instanceof DialogBoxMorph).body.bounds;
            return { x: b.origin.x, y: b.origin.y, r: b.corner.x, b: b.corner.y };
        });
        expect(field.width).toBeGreaterThan(150);
        expect(field.x).toBeGreaterThanOrEqual(body.x);
        expect(field.y).toBeGreaterThanOrEqual(body.y);
        expect(field.x + field.width).toBeLessThanOrEqual(body.r + 1);
        expect(field.y + field.height).toBeLessThanOrEqual(body.b + 1);
        // it really is drawn: the field's white background is on the canvas
        // (Morphic's getImageData takes logical coordinates on any display)
        const pixel = await page.evaluate(([x, y]) => Array.from(
            world.worldCanvas.getContext('2d').getImageData(x, y, 1, 1).data
        ).slice(0, 3), [
            Math.round(field.x + field.width - 6),
            Math.round(field.y + field.height / 2)
        ]);
        expect(pixel).toEqual([255, 255, 255]);
    });

    test('focus opens in the first field; Tab runs through native and Morphic stops', async ({ page }) => {
        expect(await activeName(page)).toBe('username');
        const order = [];
        for (let i = 0; i < 5; i += 1) {
            await page.keyboard.press('Tab');
            order.push(await activeName(page));
        }
        expect(order).toEqual(['password', 'choice', 'OK', 'Cancel', 'username']);
        // and backwards, entering the form at its last control
        const back = [];
        for (let i = 0; i < 3; i += 1) {
            await page.keyboard.press('Shift+Tab');
            back.push(await activeName(page));
        }
        expect(back).toEqual(['Cancel', 'OK', 'choice']);
    });

    test('typing, Space and Enter are native; Enter signs in', async ({ page }) => {
        await page.keyboard.type('Alonzo Church');
        await page.keyboard.press('Tab');
        await page.keyboard.type('lambda calculus');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Space'); // checks the checkbox
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(await page.evaluate(() => window.snapLogins)).toEqual([
            { name: 'alonzo church', password: 'lambda calculus', persist: true }
        ]);
    });

    test('the password is never in the DOM as text', async ({ page }) => {
        await page.keyboard.press('Tab');
        await page.keyboard.type('s3cret');
        const html = await page.evaluate(() => document.body.innerHTML +
            document.getElementById('morphic_keyboard').value);
        expect(html).not.toContain('s3cret');
        await expect(page.getByLabel('Password:')).toHaveValue('s3cret');
    });

    test('a mouse click puts the caret into the native field', async ({ page }) => {
        await page.keyboard.type('alonzo');
        await page.keyboard.press('Tab');
        const box = await page.getByLabel('User name:').boundingBox();
        await page.mouse.move(box.x + 4, box.y + box.height / 2);
        await page.mouse.click(box.x + 4, box.y + box.height / 2);
        expect(await activeName(page)).toBe('username');
        await page.keyboard.type('>');
        const value = await page.getByLabel('User name:').inputValue();
        expect(value.length).toBe(7);
        expect(value.endsWith('>')).toBe(false); // caret was placed by the click
    });

    test('a morph on top of the form wins the click', async ({ page }) => {
        const spot = await page.evaluate(() => {
            const dialog = world.children.find(m => m instanceof DialogBoxMorph),
                menu = new MenuMorph(null, 'on top');
            window.snapPicked = null;
            ['one', 'two', 'three', 'four'].forEach(each =>
                menu.addItem(each, () => { window.snapPicked = each; }));
            menu.popup(world, dialog.body.position().add(new Point(20, 4)));
            const item = menu.children.find(m =>
                m instanceof MenuItemMorph && m.labelString === 'two');
            return { x: item.center().x, y: item.center().y };
        });
        await page.mouse.move(spot.x, spot.y);
        expect(await page.evaluate(([x, y]) =>
            document.elementFromPoint(x, y).tagName, [spot.x, spot.y]))
            .toBe('CANVAS');
        await page.mouse.click(spot.x, spot.y);
        expect(await page.evaluate(() => window.snapPicked)).toBe('two');
    });

    test('errors are announced, mark the field, and grow the dialog', async ({ page }) => {
        const height = () => page.evaluate(() =>
            world.children.find(m => m instanceof DialogBoxMorph).height());
        const before = await height();
        await page.keyboard.type('alonzo');
        await page.keyboard.press('Enter'); // no password yet
        await expect(page.getByRole('alert').filter({ hasText: 'fill out' }))
            .toHaveText('please fill out this field');
        await expect(page.getByLabel('Password:'))
            .toHaveAttribute('aria-invalid', 'true');
        expect(await activeName(page)).toBe('password');
        await expect.poll(height).toBeGreaterThan(before);
        expect(await page.evaluate(() => window.snapLogins)).toEqual([]);
        // typing clears the report
        await page.keyboard.type('x');
        await expect(page.getByLabel('Password:'))
            .not.toHaveAttribute('aria-invalid', 'true');
    });

    test('Escape in a native field cancels and restores focus', async ({ page }) => {
        await page.keyboard.type('alonzo');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.locator('form')).toHaveCount(0);
        expect(await activeName(page)).toBe('Cloud menu');
    });

    test('dragging the dialog keeps the form painted and in place', async ({ page }) => {
        const grip = await page.evaluate(() => {
            const dialog = world.children.find(m => m instanceof DialogBoxMorph);
            return { x: dialog.center().x, y: dialog.top() + 10 };
        });
        await page.mouse.move(grip.x, grip.y);
        await page.mouse.down();
        await page.mouse.move(grip.x - 60, grip.y + 20, { steps: 4 });
        await page.mouse.move(grip.x - 200, grip.y + 60, { steps: 4 });
        // dragged live (no cached bitmap), so the element can be drawn
        expect(await page.evaluate(() => world.hand.children.length === 1 &&
            world.hand.cachedFullImage === null)).toBe(true);
        await page.mouse.up();
        const field = await page.getByLabel('User name:').boundingBox();
        const body = await page.evaluate(() => {
            const b = world.children
                .find(m => m instanceof DialogBoxMorph).body.bounds;
            return { x: b.origin.x, y: b.origin.y };
        });
        expect(field.x - body.x).toBeLessThan(8);
        expect(field.x - body.x).toBeGreaterThanOrEqual(0);
        expect(field.y).toBeGreaterThan(body.y);
    });
});

test.describe('HTML-in-Canvas: Sign up uses native selects and links', () => {
    test('birth date selects, e-mail label, TOS links', async ({ page }) => {
        await loadSnap(page, HIC);
        test.skip(!(await supported(page)), 'needs HTML-in-Canvas');
        await snapEval(page, ide => ide.createCloudAccount());
        const dialog = page.getByRole('dialog', { name: 'Sign up' });
        await expect(dialog.getByRole('combobox', { name: 'Birth date:' }))
            .toHaveCount(1);
        await expect(dialog.getByRole('link', { name: 'Terms of Service...' }))
            .toHaveAttribute('href', 'https://snap.berkeley.edu/tos.html');
        await expect(dialog.getByLabel('E-mail address:')).toHaveCount(1);
        await dialog.getByLabel('Birth date:').selectOption('March');
        await dialog.getByLabel('year:')
            .selectOption(String(new Date().getFullYear() - 5));
        await expect(dialog.getByLabel('E-mail address of parent or guardian:'))
            .toHaveCount(1);
    });
});

test.describe('HTML-in-Canvas: the text on blocks is DOM text', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page, HIC);
        test.skip(!(await supported(page)), 'needs HTML-in-Canvas');
        // let the browser snapshot the freshly created text elements
        await page.waitForFunction(() => world.hicMorphs.size > 0 &&
            Array.from(world.hicMorphs).every(m => m.hicElement.hicReady));
    });

    test('palette labels are painted from elements at the morphs\' positions', async ({ page }) => {
        const labels = await snapEval(page, ide =>
            ide.palette.allChildren()
                .filter(m => m instanceof BlockLabelMorph)
                .slice(0, 6)
                .map(m => {
                    const r = m.hicElement.getBoundingClientRect();
                    return {
                        text: m.text,
                        dom: m.hicElement.textContent,
                        ready: m.hicElement.hicReady,
                        dx: Math.abs(r.x - m.left()),
                        dy: Math.abs(r.y - m.top()),
                        dw: Math.abs(r.width - m.width()),
                        dh: Math.abs(r.height - m.height())
                    };
                }));
        expect(labels.length).toBe(6);
        labels.forEach(each => {
            expect(each.dom).toBe(each.text);
            expect(each.ready).toBe(true);
            expect(each.dx).toBeLessThan(1);
            expect(each.dy).toBeLessThan(1);
            expect(each.dw).toBeLessThan(1);
            expect(each.dh).toBeLessThan(1);
        });
    });

    test('a block\'s words live inside that block\'s node', async ({ page }) => {
        const move = page.getByRole('option', { name: 'move steps' });
        await expect(move.locator('.morphic-text')).toHaveText(['move', '10', 'steps']);
    });

    test('the browser can find and select words on blocks', async ({ page }) => {
        const found = await page.evaluate(() => {
            window.getSelection().removeAllRanges();
            const ok = window.find('degrees');
            const node = window.getSelection().anchorNode;
            return ok && node.parentNode.className;
        });
        expect(found).toBe('morphic-text');
    });

    test('offscreen rendering falls back to fillText()', async ({ page }) => {
        // a block's picture (drag image, script pic, export) is rendered
        // into another canvas, which an element can't be drawn into
        const inked = await snapEval(page, ide => {
            const block = ide.palette.contents.children
                    .find(m => m instanceof BlockMorph),
                label = block.children.find(m => m instanceof BlockLabelMorph),
                pic = block.fullImage(),
                ratio = pic.getContext('2d').getTransform().a || 1,
                box = label.bounds.translateBy(block.fullBounds().origin.neg()),
                data = pic.getContext('2d').getImageData(
                    box.origin.x * ratio, box.origin.y * ratio,
                    box.width() * ratio, box.height() * ratio).data;
            let white = 0;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
                    white += 1;
                }
            }
            return white;
        });
        expect(inked).toBeGreaterThan(10); // the label's white glyphs
    });

    test('a block dragged out of the palette gets its own text', async ({ page }) => {
        const start = await snapEval(page, ide => {
            const block = ide.palette.contents.children
                .find(m => m instanceof BlockMorph);
            return { x: block.left() + 6, y: block.top() + 8 };
        });
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 40, start.y + 20, { steps: 4 });
        await page.mouse.move(320, 220, { steps: 6 });
        await page.mouse.up();
        await page.waitForFunction(() => {
            const ide = world.children.find(m => m instanceof IDE_Morph),
                block = ide.currentSprite.scripts.children
                    .find(m => m instanceof BlockMorph);
            return block && block.allChildren()
                .filter(m => m instanceof BlockLabelMorph)
                .every(m => m.hicElement && m.hicElement.hicReady);
        });
        const state = await snapEval(page, ide => {
            const dropped = ide.currentSprite.scripts.children
                    .find(m => m instanceof BlockMorph),
                template = ide.palette.contents.children
                    .find(m => m instanceof BlockMorph),
                own = b => b.allChildren()
                    .filter(m => m instanceof BlockLabelMorph)
                    .map(m => m.hicElement);
            return {
                shared: own(dropped).some(el => own(template).includes(el)),
                templateKept: own(template).every(el => el && el.isConnected),
                near: own(dropped).every((el, i) => {
                    const label = dropped.allChildren()
                        .filter(m => m instanceof BlockLabelMorph)[i];
                    return Math.abs(el.getBoundingClientRect().x -
                        label.left()) < 1;
                })
            };
        });
        expect(state).toEqual({ shared: false, templateKept: true, near: true });
    });

    test('text elements go away with their blocks', async ({ page }) => {
        const count = () => page.evaluate(() => ({
            registry: world.hicMorphs.size,
            dom: document.querySelectorAll('.morphic-text').length,
            orphans: Array.from(document.querySelectorAll('.morphic-text'))
                .filter(el => !el.hicMorph || el.hicMorph.root() !== world)
                .length
        }));
        // real pointer input goes to the canvas (the parallel nodes are
        // pointer-transparent), so click where the category buttons are
        const click = async name => {
            const box = await page.getByRole('radio', { name }).boundingBox();
            await page.mouse.click(
                box.x + box.width / 2,
                box.y + box.height / 2
            );
        };
        await click('Looks');
        await expect.poll(() => snapEval(page, ide => ide.currentCategory))
            .toBe('looks');
        await expect.poll(async () => (await count()).orphans).toBe(0);
        await click('Motion');
        await expect.poll(async () => {
            const c = await count();
            return c.registry === c.dom && c.orphans === 0;
        }).toBe(true);
    });
});
