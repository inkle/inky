/**
 * Launcher factory — returns the right adapter based on TEST_LAUNCHER env var.
 *
 *   TEST_LAUNCHER=spectron   →  Spectron (desktop, requires packaged binary)
 *   TEST_LAUNCHER=playwright →  Playwright (web, runs Electron from source)
 *
 * Defaults to 'playwright' when unset.
 */
function createLauncher() {
    const type = (process.env.TEST_LAUNCHER || 'playwright').toLowerCase();
    if (type === 'spectron') {
        const SpectronLauncher = require('./spectron');
        return new SpectronLauncher();
    }
    const PlaywrightLauncher = require('./playwright');
    return new PlaywrightLauncher();
}

module.exports = { createLauncher };
