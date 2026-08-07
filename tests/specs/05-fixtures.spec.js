// tests.html launcher page and the fixture projects it opens.
//
// The fixtures in tests/fixtures/ are real projects of increasing size,
// used to exercise the IDE with non-empty content (and, later, to check
// parallel-DOM sync and performance on large projects). tests.html is a
// small hand-written page for opening them quickly during development —
// and it must itself be accessible.

const { test, expect } = require('@playwright/test');

const FIXTURES = [
    {
        file: 'Snap_v11_Map_Colors.xml',
        projectName: 'Snap! v11 Map Colors',
        sprites: ['Map Colors', 'Report Scripts']
    },
    {
        file: 'manual_cover_scripts.xml',
        projectName: 'manual cover scripts',
        sprites: []
    },
    {
        file: 'CS10_SP22_Final_Main.xml',
        projectName: 'CS10 SP22 Final Main',
        sprites: [],
        timeout: 90000 // 4.2 MB project with media
    }
];

test.describe('tests.html launcher page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/tests.html');
    });

    test('is itself accessible: lang, title, named links', async ({ page }) => {
        await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
        await expect(page).toHaveTitle(/Snap!/);
        await expect(
            page.getByRole('heading', { level: 1 })
        ).toBeVisible();
    });

    test('offers a new-project link and one link per fixture', async ({ page }) => {
        await expect(
            page.getByRole('link', { name: /New project/ })
        ).toHaveAttribute('href', 'snap.html');
        for (const fixture of FIXTURES) {
            await expect(
                page.getByRole('link', { name: new RegExp(fixture.projectName.replace(/[.*+?^${}()|[\]\\!]/g, '\\$&')) })
            ).toHaveAttribute(
                'href',
                `snap.html#open:tests/fixtures/${fixture.file}`
            );
        }
    });
});

test.describe('fixture projects open in the IDE', () => {
    for (const fixture of FIXTURES) {
        test(`${fixture.projectName} loads via #open:`, async ({ page }) => {
            if (fixture.timeout) {
                test.setTimeout(fixture.timeout);
            }
            await page.goto(`/snap.html#open:tests/fixtures/${fixture.file}`);
            await page.waitForFunction(
                expected =>
                    typeof world !== 'undefined' &&
                    world &&
                    world.children.length > 0 &&
                    world.children[0].getProjectName &&
                    world.children[0].getProjectName() === expected,
                fixture.projectName,
                { timeout: fixture.timeout || 30000 }
            );
            const state = await page.evaluate(() => {
                const ide = world.children[0];
                return {
                    sprites: ide.sprites.asArray().map(s => s.name),
                    scripts: ide.sprites.asArray().reduce(
                        (sum, s) => sum + s.scripts.children.length,
                        0
                    )
                };
            });
            expect(state.sprites.length).toBeGreaterThan(0);
            for (const name of fixture.sprites) {
                expect(state.sprites).toContain(name);
            }
        });
    }
});
