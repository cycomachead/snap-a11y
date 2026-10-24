// Execution Log (src/execution-log.js): the notebook-style pane that logs
// every script the user runs together with what it reported.
//
// Blocks are created and run programmatically through the Morphic world
// (there is no reliable way to drag blocks on the canvas headlessly); the
// semantics of the pane are asserted through the parallel DOM.

const { test, expect } = require('@playwright/test');
const { loadSnap, snapEval } = require('../helpers/snap');

// run a few world cycles so processes finish and the log settles
const settle = (page, n = 20) => page.evaluate(async count => {
    for (let i = 0; i < count; i += 1) {
        world.doOneCycle();
        await new Promise(r => setTimeout(r, 20));
    }
}, n);

// build a block from a selector, put it into the scripting area, click it
const runBlock = (page, selector, inputs) => snapEval(page, (ide, arg) => {
    const sprite = ide.currentSprite,
        scripts = sprite.scripts,
        block = sprite.blockForSelector(arg.selector, true),
        y = scripts.children.length * 40 + 20;
    (arg.inputs || []).forEach((v, i) => block.inputs()[i].setContents(v));
    block.setPosition(scripts.topLeft().add(new Point(20, y)));
    scripts.add(block);
    block.mouseClickLeft();
    return true;
}, { selector, inputs });

const entries = page => snapEval(page, ide =>
    ide.executionLogEntries().map(e => ({
        index: e.index,
        state: e.state,
        hasResult: e.hasResult,
        result: e.hasResult && typeof e.result !== 'object' ? e.result : null,
        label: e.morph ? e.morph.ariaLabel() : null
    })));

test.describe('execution log', () => {
    test.beforeEach(async ({ page }) => {
        await loadSnap(page);
    });

    test('is off by default and sits next to "Blocks only" in the project settings', async ({ page }) => {
        const state = await snapEval(page, ide => {
            const labels = ide.projectSettingsMenu().items.map(item =>
                Array.isArray(item[0]) ? item[0][1].trim() : item[0]);
            return {
                on: ide.scene.executionLog,
                visible: ide.executionLog.isVisible,
                blocksOnly: labels.indexOf('Blocks only'),
                executionLog: labels.indexOf('Execution Log')
            };
        });
        expect(state.on).toBe(false);
        expect(state.visible).toBe(false);
        expect(state.blocksOnly).toBeGreaterThan(-1);
        expect(state.executionLog).toBe(state.blocksOnly + 1);
    });

    test('turning it on enables "Blocks only" and shows the pane as a landmark', async ({ page }) => {
        const state = await snapEval(page, ide => {
            ide.toggleExecutionLog(true);
            return {
                on: ide.scene.executionLog,
                blocksOnly: ide.scene.hideSprites,
                visible: ide.executionLog.isVisible,
                stageVisible: ide.stage.isVisible,
                logRight: ide.executionLog.right(),
                editorRight: ide.spriteEditor.right(),
                logLeft: ide.executionLog.left()
            };
        });
        expect(state.on).toBe(true);
        expect(state.blocksOnly).toBe(true);
        expect(state.visible).toBe(true);
        expect(state.stageVisible).toBe(false);
        expect(state.logLeft).toBeGreaterThan(state.editorRight);
        await expect(page.getByRole('region', { name: 'Execution Log' })).toBeAttached();

        // turning "Blocks only" off takes the log with it
        const off = await snapEval(page, ide => {
            ide.hideSpritePanes(false);
            return { on: ide.scene.executionLog, visible: ide.executionLog.isVisible };
        });
        expect(off).toEqual({ on: false, visible: false });
    });

    test('logs clicked scripts with their results, oldest first', async ({ page }) => {
        await snapEval(page, ide => ide.toggleExecutionLog(true));
        await runBlock(page, 'reportVariadicSum', [[3, 4]]);
        await settle(page);
        await runBlock(page, 'reportJoinWords', [['hello ', 'world']]);
        await settle(page);
        await runBlock(page, 'bubble', ['hi']);
        await settle(page);
        await runBlock(page, 'doChangeVar', ['nosuchvar', 1]);
        await settle(page);

        const log = await entries(page);
        expect(log.map(e => e.index)).toEqual([1, 2, 3, 4]);
        expect(log.map(e => e.state)).toEqual(['done', 'done', 'done', 'error']);
        expect(log[0].result).toBe(7);
        expect(log[1].result).toBe('hello world');
        expect(log[2].hasResult).toBe(false); // a command script has no output
        expect(log[0].label).toContain('reports 7');
        expect(log[3].label).toContain('error');

        // every entry is exposed under the landmark, in order
        const region = page.getByRole('region', { name: 'Execution Log' });
        const groups = region.getByRole('group');
        await expect(groups).toHaveCount(4);
        await expect(groups.nth(0)).toHaveAttribute('aria-label', /run 1/);
        await expect(groups.nth(3)).toHaveAttribute('aria-label', /run 4/);
    });

    test('scripts can be brought back into the scripting area by keyboard and by dragging', async ({ page }) => {
        await snapEval(page, ide => ide.toggleExecutionLog(true));
        await runBlock(page, 'reportVariadicSum', [[1, 2]]);
        await settle(page);
        const counts = await snapEval(page, async ide => {
            const scripts = ide.currentSprite.scripts,
                count = () => scripts.children.filter(m => m instanceof BlockMorph).length,
                entry = ide.executionLogEntries()[0],
                before = count();
            // Enter / Space on the focused entry ends up here
            entry.morph.a11yActivate();
            const afterKeyboard = count();
            // dragging the picture grabs a fresh copy of the script
            const copy = entry.morph.scriptPicture.selectForEdit();
            world.hand.grab(copy);
            const slidesBackToPalette = world.hand.grabOrigin.origin === ide.palette;
            copy.setPosition(scripts.center());
            world.hand.setPosition(scripts.center());
            world.hand.drop();
            return { before, afterKeyboard, afterDrag: count(), slidesBackToPalette };
        });
        expect(counts.afterKeyboard).toBe(counts.before + 1);
        expect(counts.afterDrag).toBe(counts.before + 2);
        expect(counts.slidesBackToPalette).toBe(true);
    });

    test('the whole log exports as importable scripts, with results as comments', async ({ page }) => {
        await snapEval(page, ide => ide.toggleExecutionLog(true));
        await runBlock(page, 'reportVariadicSum', [[3, 4]]);
        await settle(page);
        await runBlock(page, 'bubble', ['hi']);
        await settle(page);
        const result = await snapEval(page, ide => {
            const scripts = ide.currentSprite.scripts,
                count = () => scripts.children.filter(m => m instanceof BlockMorph).length,
                xml = ide.executionLogScriptsXML(true),
                before = count();
            ide.rawOpenScriptsOnlyString(xml);
            return {
                xmlStart: xml.slice(0, 12),
                scripts: (xml.match(/<script x=/g) || []).length,
                comments: (xml.match(/<comment /g) || []).length,
                imported: count() - before
            };
        });
        expect(result.xmlStart).toBe('<scriptsonly');
        expect(result.scripts).toBe(2);
        expect(result.comments).toBe(1); // only the reporter has a result
        expect(result.imported).toBe(2);
    });

    test('the setting is saved with the project and the log survives an IDE refresh', async ({ page }) => {
        await snapEval(page, ide => ide.toggleExecutionLog(true));
        await runBlock(page, 'reportVariadicSum', [[3, 4]]);
        await settle(page);
        const xml = await snapEval(page, ide => {
            ide.scene.captureGlobalSettings();
            return ide.serializer.serialize(new Project(ide.scenes, ide.scene));
        });
        expect(xml).toContain('executionlog="true"');
        expect(xml).toContain('blocksonly="true"');

        await snapEval(page, ide => ide.refreshIDE());
        await settle(page, 40);
        const afterRefresh = await snapEval(page, ide => ({
            on: ide.scene.executionLog,
            visible: ide.executionLog.isVisible,
            entries: ide.executionLogEntries().length,
            cells: ide.executionLog.entryMorphs().length
        }));
        expect(afterRefresh).toEqual({ on: true, visible: true, entries: 1, cells: 1 });

        await snapEval(page, (ide, projectXML) => ide.rawOpenProjectString(projectXML), xml);
        await settle(page, 40);
        const reopened = await snapEval(page, ide => ({
            on: ide.scene.executionLog,
            visible: ide.executionLog.isVisible,
            entries: ide.executionLogEntries().length
        }));
        expect(reopened).toEqual({ on: true, visible: true, entries: 0 });
    });
});
