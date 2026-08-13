// Shared helpers for driving Snap! from Playwright tests.
//
// Snap! renders everything onto a single canvas, so most assertions about
// application *state* go through page.evaluate() into the Morphic world
// (the global `window.world`), while assertions about *semantics* (roles,
// labels, focus) go through the DOM / accessibility tree.

/**
 * Load snap.html and wait until the IDE is fully constructed:
 * the world exists, the IDE morph is installed, and the palette has
 * been populated for the current sprite.
 */
async function loadSnap(page) {
    await page.goto('/snap.html');
    // note: the IDE is not necessarily world.children[0] - the accessibility
    // layer adds its focus-ring morph to the world before the IDE opens
    await page.waitForFunction(() => {
        const ide = typeof world !== 'undefined' && world !== null &&
            world.children.find(m => m instanceof IDE_Morph);
        return ide &&
            ide.currentSprite &&
            ide.palette &&
            ide.palette.contents.children.length > 0;
    }, null, { timeout: 30000 });
    return page;
}

/**
 * Evaluate a function in the page with `ide` (the IDE_Morph) as its
 * argument. Usage: snapEval(page, ide => ide.currentSprite.name)
 */
function snapEval(page, fn, arg) {
    return page.evaluate(
        ([src, a]) => {
            const ide = world.children.find(m => m instanceof IDE_Morph);
            // eslint-disable-next-line no-eval
            return eval(`(${src})`)(ide, a);
        },
        [fn.toString(), arg]
    );
}

/**
 * Close every dialog that is open, e.g. the "CAUTION! Development Version"
 * warning Snap! shows at startup (which is modal, so it traps focus).
 */
async function dismissDialogs(page) {
    await page.evaluate(() => {
        world.children
            .filter(m => m instanceof DialogBoxMorph)
            .forEach(dialog => dialog.destroy());
    });
}

/**
 * What assistive technology currently sees at the focus: the focused
 * element's role / name, the label of its aria-activedescendant (composite
 * widgets such as list boxes keep DOM focus on themselves), and which morph
 * Morphic thinks is focused.
 */
function focusInfo(page) {
    return page.evaluate(() => {
        const el = document.activeElement,
            active = el.getAttribute('aria-activedescendant'),
            item = active && document.getElementById(active);
        return {
            id: el.id,
            role: el.getAttribute('role'),
            name: el.getAttribute('aria-label'),
            item: item ? item.getAttribute('aria-label') : null,
            morph: world.focusedMorph ? world.focusedMorph.constructor.name
                : null,
            inDialog: [...document.querySelectorAll('[role="dialog"]')]
                .some(d => d.contains(el))
        };
    });
}

/**
 * Dump the full Chromium accessibility tree (CDP) as a flat list of
 * { role, name, ignored } nodes. Lets tests inspect what assistive
 * technology actually receives, beyond what DOM queries show.
 */
async function getAXTree(page) {
    const client = await page.context().newCDPSession(page);
    try {
        await client.send('Accessibility.enable');
        const { nodes } = await client.send('Accessibility.getFullAXTree');
        return nodes.map(n => ({
            role: n.role ? n.role.value : undefined,
            name: n.name ? n.name.value : undefined,
            ignored: n.ignored
        }));
    } finally {
        await client.detach().catch(() => {});
    }
}

/**
 * Convenience: the AX nodes that are exposed (not ignored) and carry a
 * role other than generic/none.
 */
async function getExposedAXNodes(page) {
    const nodes = await getAXTree(page);
    return nodes.filter(n =>
        !n.ignored &&
        n.role &&
        !['none', 'generic', 'InlineTextBox', 'StaticText'].includes(n.role)
    );
}

/**
 * Focus Snap!'s hidden keyboard handler (the way keystrokes reach the
 * Morphic world today) so subsequent page.keyboard input is routed to
 * world.keyboardFocus.
 */
async function focusMorphicKeyboard(page) {
    await page.evaluate(() => {
        document.getElementById('morphic_keyboard').focus();
    });
}

module.exports = {
    loadSnap,
    snapEval,
    dismissDialogs,
    focusInfo,
    getAXTree,
    getExposedAXNodes,
    focusMorphicKeyboard
};
