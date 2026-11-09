'use strict';

// Some ZIP extraction tools discard Unix executable bits and may turn npm's
// .bin symlinks into regular files. Restore the commands needed to install,
// launch, and run Inky on Linux/macOS.
const fs = require('fs');
const path = require('path');

if (process.platform === 'win32') {
  process.exit(0);
}

const appDir = path.resolve(__dirname, '../app');
const nodeModules = path.join(appDir, 'node_modules');
const binDir = path.join(nodeModules, '.bin');

function ensureExecutable(relativePath) {
  const filePath = path.join(appDir, relativePath);
  if (fs.existsSync(filePath)) {
    fs.chmodSync(filePath, 0o755);
  }
}

function ensureLink(name, relativeTarget) {
  const targetPath = path.join(nodeModules, relativeTarget);
  if (!fs.existsSync(targetPath)) return;

  fs.mkdirSync(binDir, { recursive: true });
  const linkPath = path.join(binDir, name);
  const expectedTarget = path.relative(binDir, targetPath);
  let correct = false;

  try {
    const stat = fs.lstatSync(linkPath);
    correct = stat.isSymbolicLink() && fs.readlinkSync(linkPath) === expectedTarget;
    if (!correct) fs.unlinkSync(linkPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (!correct) fs.symlinkSync(expectedTarget, linkPath);
  fs.chmodSync(targetPath, 0o755);
}

ensureLink('markdown-html', 'markdown-html/index.js');
ensureLink('electron', 'electron/cli.js');
ensureExecutable('node_modules/electron/dist/electron');

// The Inky preview launches inklecate directly. Restore its executable bit as
// well, otherwise a ZIP extractor that drops Unix modes would break playback.
if (process.platform === 'linux') {
  ensureExecutable('main-process/ink/inklecate_linux');
  ensureExecutable('main-process/ink/inkjs-compatible/inklecate_linux');
} else if (process.platform === 'darwin') {
  ensureExecutable('main-process/ink/inklecate_mac');
  ensureExecutable('main-process/ink/inkjs-compatible/inklecate_mac');
}
