const { test, expect } = require('@playwright/test');
const { loadSnap, snapEval } = require('../helpers/snap');

async function runReporter(page, a = 7, b = 5) {
    return snapEval(page, (ide, values) => {
        const block = SpriteMorph.prototype.blockForSelector('reportVariadicSum');
        block.inputs()[0].inputs()[0].setContents(values[0]);
        block.inputs()[0].inputs()[1].setContents(values[1]);
        ide.currentSprite.scripts.add(block);
        ide.stage.threads.startProcess(block, ide.currentSprite, false, false, null, true);
    }, [a, b]);
}

test.beforeEach(async ({ page }) => { await loadSnap(page); });

test('defaults and settings; hiding stops new recording and restores space', async ({ page }) => {
    await expect(page.getByRole('complementary', { name: 'Execution Log' })).toBeVisible();
    expect(await snapEval(page, ide => ({
        blocksOnly: ide.scene.hideSprites,
        hiddenStage: !ide.stage.isVisible,
        menu: ide.ideSettingsMenu().items.some(row =>
            Array.isArray(row[0]) && row[0][1] === 'Execution Log'),
        reserved: ide.width() < world.width()
    }))).toEqual({ blocksOnly: true, hiddenStage: true, menu: true, reserved: true });
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await runReporter(page);
    expect(await snapEval(page, ide => ide.executionLog.entries.length)).toBe(0);
    expect(await snapEval(page, ide => ide.width() === world.width())).toBe(true);
    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Execution Log' })).toBeHidden();
    await snapEval(page, ide => ide.executionLog.toggle());
    await expect(page.getByRole('complementary', { name: 'Execution Log' })).toBeVisible();
});

test('reporters stay in start order and preserve scripts and output snapshots', async ({ page }) => {
    await runReporter(page);
    await expect(page.locator('.execution-log-state').first()).toHaveText('Completed');
    await runReporter(page, 20, 3);
    await expect(page.locator('.execution-log-state').nth(1)).toHaveText('Completed');
    await expect(page.locator('.execution-log-output pre')).toHaveText(['12', '23']);
    expect(await snapEval(page, ide => {
        const original = ide.currentSprite.scripts.children.find(b => b instanceof ReporterBlockMorph);
        original.inputs()[0].inputs()[0].setContents(999);
        return ide.executionLog.entries.map(e => ({number: e.number, xml: e.xml.includes('999')}));
    })).toEqual([{number: 1, xml: false}, {number: 2, xml: false}]);
    const download = page.waitForEvent('download');
    await page.getByRole('button', {name: 'Export value'}).first().click();
    expect((await download).suggestedFilename()).toBe('execution-1-output-1.txt');
});

test('say, timed say, image and list results are captured with exportable values', async ({ page }) => {
    await snapEval(page, ide => {
        const say = SpriteMorph.prototype.blockForSelector('bubble');
        const timed = SpriteMorph.prototype.blockForSelector('doSayFor');
        say.inputs()[0].setContents('<hello>');
        timed.inputs()[0].setContents('waited');
        timed.inputs()[1].setContents(0.1);
        say.nextBlock(timed);
        ide.currentSprite.scripts.add(say);
        ide.stage.threads.startProcess(say, ide.currentSprite);
    });
    await expect(page.locator('.execution-log-state')).toHaveText('Completed');
    await expect(page.locator('.execution-log-output pre')).toHaveText(['<hello>', 'waited']);
    await snapEval(page, ide => {
        const log = ide.executionLog, entry = log.entries[0];
        const list = new List([1, 'two', new List([false])]);
        log.output(entry, list, 'Result');
        list.put(999, 1);
        const canvas = document.createElement('canvas');
        canvas.width = 20; canvas.height = 20;
        canvas.getContext('2d').fillRect(0, 0, 20, 20);
        log.output(entry, new Costume(canvas, 'image'), 'Result');
    });
    expect(await snapEval(page, ide => JSON.parse(ide.executionLog.entries[0].outputs[2].data)))
        .toEqual([1, 'two', [false]]);
    await expect(page.locator('.execution-log-output img')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', {name: 'Export value'}).last().click();
    expect((await download).suggestedFilename()).toBe('execution-1-output-4.png');
});

test('restore and full log export round trip through native Snap import', async ({ page }) => {
    await runReporter(page);
    await runReporter(page, 20, 3);
    await expect(page.locator('.execution-log-state').nth(1)).toHaveText('Completed');
    const result = await snapEval(page, ide => {
        const log = ide.executionLog;
        const oldCount = ide.currentSprite.scripts.children.filter(b => b instanceof BlockMorph).length;
        log.restore(log.entries[0], ide.spriteEditor.topLeft().add(new Point(50, 80)));
        const restored = ide.currentSprite.scripts.children.filter(b => b instanceof BlockMorph).length;
        let exported;
        ide.saveXMLAs = xml => { exported = xml; };
        log.exportAll();
        const oldSprites = ide.sprites.length();
        ide.rawOpenSpritesString(exported);
        return {
            restored: restored - oldCount,
            added: ide.sprites.length() - oldSprites,
            scripts: ide.sprites.asArray().slice(-2).map(s =>
                s.scripts.children.filter(b => b instanceof BlockMorph).map(b => b.selector)),
            xml: exported.startsWith('<sprites')
        };
    });
    expect(result).toEqual({restored: 1, added: 2, scripts: [['reportVariadicSum'], ['reportVariadicSum']], xml: true});
});

test('errors, stopped scripts and clear during execution', async ({ page }) => {
    await snapEval(page, ide => {
        const bad = SpriteMorph.prototype.variableBlock('missing');
        ide.currentSprite.scripts.add(bad);
        ide.stage.threads.startProcess(bad, ide.currentSprite, false, false, null, true);
    });
    await expect(page.locator('.execution-log-state')).toHaveText('Failed');
    await expect(page.locator('.execution-log-output pre')).toContainText('does not exist');
    await snapEval(page, ide => {
        const wait = SpriteMorph.prototype.blockForSelector('doWait');
        wait.inputs()[0].setContents(10);
        ide.currentSprite.scripts.add(wait);
        ide.stage.threads.startProcess(wait, ide.currentSprite);
        ide.stage.threads.stopAll();
    });
    await expect(page.locator('.execution-log-state').nth(1)).toHaveText('Stopped');
    await page.getByRole('button', {name: 'Clear log'}).click();
    await expect(page.getByRole('article')).toHaveCount(0);
    await runReporter(page);
    await expect(page.locator('.execution-log-state')).toHaveText('Completed');
    await expect(page.locator('.execution-log-cell-title strong')).toContainText('[3]');
});


test('dragging a notebook script restores a copy in the scripting area', async ({ page }) => {
    await runReporter(page);
    await expect(page.locator('.execution-log-state')).toHaveText('Completed');
    const position = await snapEval(page, ide => ({
        x: ide.spriteEditor.left() + 180, y: ide.spriteEditor.top() + 200
    }));
    await page.getByRole('button', {name: 'Restore script 1', exact: true})
        .dragTo(page.locator('#world'), {targetPosition: position});
    expect(await snapEval(page, ide =>
        ide.currentSprite.scripts.children.filter(b => b instanceof BlockMorph).length)).toBe(2);
    await expect(page.getByRole('article')).toHaveCount(1);
});

test('custom block dependencies survive export into a fresh project', async ({ page }) => {
    await snapEval(page, ide => {
        const say = SpriteMorph.prototype.blockForSelector('bubble');
        say.inputs()[0].setContents('from dependency');
        const global = new CustomBlockDefinition('greet', ide.stage);
        global.category = 'other';
        global.isGlobal = true;
        global.body = new Context(null, say, null, ide.currentSprite);
        ide.stage.globalBlocks.push(global);
        const local = new CustomBlockDefinition('local greeting', ide.currentSprite);
        local.category = 'other';
        local.body = new Context(null, global.blockInstance(), null, ide.currentSprite);
        ide.currentSprite.customBlocks.push(local);
        const script = local.blockInstance();
        ide.currentSprite.scripts.add(script);
        ide.stage.threads.startProcess(script, ide.currentSprite);
    });
    await expect(page.locator('.execution-log-state')).toHaveText('Completed');
    await expect(page.locator('.execution-log-output pre')).toHaveText('from dependency');
    expect(await snapEval(page, ide => {
        let exported;
        const save = ide.saveXMLAs;
        ide.saveXMLAs = xml => { exported = xml; };
        ide.executionLog.exportAll();
        ide.saveXMLAs = save;
        ide.newProject();
        ide.rawOpenSpritesString(exported);
        const imported = ide.sprites.asArray().find(s => s.name.startsWith('Execution'));
        const script = imported.scripts.children.find(b => b instanceof BlockMorph);
        ide.stage.threads.startProcess(script, imported);
        return {global: ide.stage.globalBlocks[0].spec,
            local: imported.customBlocks[0].spec, blocksOnly: ide.scene.hideSprites};
    })).toEqual({global: 'greet [execution 1]', local: 'local greeting', blocksOnly: true});
    await expect(page.locator('.execution-log-state')).toHaveText('Completed');
    await expect(page.locator('.execution-log-output pre')).toHaveText('from dependency');
});

test('narrow layouts and presentation mode reserve and release the notebook space', async ({ page }) => {
    await page.setViewportSize({width: 700, height: 800});
    await expect(page.locator('.execution-log')).toHaveClass(/execution-log-stacked/);
    expect(await snapEval(page, ide => ide.height() < world.height())).toBe(true);
    await snapEval(page, ide => { ide.hideSpritePanes(false); ide.toggleAppMode(true); });
    await expect(page.getByRole('complementary', {name: 'Execution Log'})).toBeHidden();
    await snapEval(page, ide => ide.toggleAppMode(false));
    await expect(page.getByRole('complementary', {name: 'Execution Log'})).toBeVisible();
});


test('the full log preserves different versions of the same global definition', async ({ page }) => {
    await snapEval(page, ide => {
        const say = SpriteMorph.prototype.blockForSelector('bubble');
        say.inputs()[0].setContents('first version');
        const definition = new CustomBlockDefinition('versioned greeting', ide.stage);
        definition.category = 'other';
        definition.isGlobal = true;
        definition.body = new Context(null, say, null, ide.currentSprite);
        ide.stage.globalBlocks.push(definition);
        const script = definition.blockInstance();
        ide.currentSprite.scripts.add(script);
        ide.stage.threads.startProcess(script, ide.currentSprite);
    });
    await expect(page.locator('.execution-log-state')).toHaveText('Completed');
    await snapEval(page, ide => {
        ide.stage.globalBlocks[0].body.expression.inputs()[0].setContents('second version');
        const script = ide.currentSprite.scripts.children.find(b => b instanceof BlockMorph);
        ide.stage.threads.startProcess(script, ide.currentSprite);
    });
    await expect(page.locator('.execution-log-state').nth(1)).toHaveText('Completed');
    await snapEval(page, ide => {
        let exported;
        ide.saveXMLAs = xml => { exported = xml; };
        ide.executionLog.exportAll();
        ide.newProject();
        ide.rawOpenSpritesString(exported);
        ide.sprites.asArray().filter(s => s.name.startsWith('Execution')).forEach(sprite => {
            const script = sprite.scripts.children.find(b => b instanceof BlockMorph);
            ide.stage.threads.startProcess(script, sprite);
        });
    });
    await expect(page.locator('.execution-log-state')).toHaveText(['Completed', 'Completed']);
    await expect(page.locator('.execution-log-output pre')).toHaveText(['first version', 'second version']);
});
