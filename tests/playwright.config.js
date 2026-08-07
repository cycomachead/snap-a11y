// Playwright configuration for the Snap! accessibility test harness.
//
// Serves the repository root over plain HTTP (Snap! is a static site) and
// runs the specs in tests/specs/ against snap.html.

const { defineConfig, devices } = require('@playwright/test');

const PORT = 8787;

module.exports = defineConfig({
    testDir: './specs',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        // Snap! registers a service worker (sw.js) for offline caching;
        // block it so tests always exercise the code in the working tree.
        serviceWorkers: 'block',
        trace: 'on-first-retry'
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ],
    webServer: {
        command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ..`,
        url: `http://127.0.0.1:${PORT}/snap.html`,
        reuseExistingServer: !process.env.CI,
        timeout: 30 * 1000
    }
});
