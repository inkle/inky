/**
 * Post-install patch for spectron compatibility with Electron 30+ and Node 22+.
 *
 * 1. Removes spectron's nested electron-chromedriver (we use the npm override
 *    to force the top-level version matching our Electron).
 * 2. Fixes launcher.js stdin pipe crash on Node 22 (EPIPE / .end not a function).
 */
const fs = require('fs');
const path = require('path');

const spectronDir = path.join(__dirname, '..', 'node_modules', 'spectron');

// 1. Remove nested electron-chromedriver if it exists
const nestedCd = path.join(spectronDir, 'node_modules', 'electron-chromedriver');
if (fs.existsSync(nestedCd)) {
    fs.rmSync(nestedCd, { recursive: true, force: true });
    console.log('[patch-spectron] Removed nested electron-chromedriver');
}

// 2. Fix launcher.js stdin pipe
const launcherPath = path.join(spectronDir, 'lib', 'launcher.js');
if (fs.existsSync(launcherPath)) {
    let src = fs.readFileSync(launcherPath, 'utf8');
    // Remove the broken stdin line (both the original and the reversed version)
    const broken1 = 'appProcess.stdin.pipe(process.stdin);';
    const broken2 = 'process.stdin.pipe(appProcess.stdin);';
    if (src.includes(broken1) || src.includes(broken2)) {
        src = src.replace(broken1, '').replace(broken2, '');
        fs.writeFileSync(launcherPath, src);
        console.log('[patch-spectron] Fixed launcher.js stdin pipe');
    }
}
